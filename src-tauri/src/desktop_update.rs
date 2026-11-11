use serde_json::{json, Value};
use std::time::Duration;
use tauri::{AppHandle, State};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

#[derive(Default)]
pub struct DesktopUpdate(Mutex<Option<(Update, Vec<u8>)>>);

fn enabled(app: &AppHandle) -> bool {
    !cfg!(debug_assertions) && app.config().plugins.0.contains_key("updater")
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    if enabled(app) {
        app.plugin(tauri_plugin_updater::Builder::new().build())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn stage_desktop_update(
    app: AppHandle,
    state: State<'_, DesktopUpdate>,
) -> Result<Value, String> {
    if !enabled(&app) {
        return Ok(json!({"status": "disabled"}));
    }
    let mut staged = state.0.lock().await;
    // Keep an already verified update available if a later check fails.
    let update = match app
        .updater_builder()
        .timeout(Duration::from_secs(20))
        .build()
    {
        Ok(updater) => updater.check().await,
        Err(error) => Err(error),
    };
    match update {
        Ok(Some(mut update))
            if staged
                .as_ref()
                .is_none_or(|(previous, _)| previous.version != update.version) =>
        {
            update.timeout = Some(Duration::from_secs(300));
            match update.download(|_, _| {}, || {}).await {
                Ok(bytes) => *staged = Some((update, bytes)),
                Err(error) if staged.is_none() => return Err(error.to_string()),
                Err(_) => {}
            }
        }
        Ok(None) => *staged = None,
        Err(error) if staged.is_none() => return Err(error.to_string()),
        _ => {}
    }
    Ok(match staged.as_ref() {
        Some((update, _)) => json!({"status": "ready", "version": update.version}),
        None => json!({"status": "current"}),
    })
}

#[tauri::command]
pub async fn install_desktop_update(
    app: AppHandle,
    state: State<'_, DesktopUpdate>,
) -> Result<(), String> {
    if !enabled(&app) {
        return Err("Updates are only available in official releases.".into());
    }
    let mut staged = state.0.lock().await;
    let (update, bytes) = staged.as_ref().ok_or("No update is ready to install.")?;
    update.install(bytes).map_err(|error| error.to_string())?;
    *staged = None;
    app.request_restart();
    Ok(())
}
