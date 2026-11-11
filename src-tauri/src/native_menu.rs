use tauri::{menu::{Menu, MenuItem, PredefinedMenuItem}, Emitter};

pub fn install(app: &tauri::AppHandle) -> tauri::Result<()> {
    let menu = Menu::default(app)?;
    let new = MenuItem::with_id(app, "project-new", "New Project…", true, Some("CmdOrCtrl+N"))?;
    let open = MenuItem::with_id(app, "project-open", "Open Project…", true, Some("CmdOrCtrl+O"))?;
    let rename = MenuItem::with_id(app, "project-rename", "Rename Project…", true, None::<&str>)?;
    let save = MenuItem::with_id(app, "project-save", "Save Project", true, Some("CmdOrCtrl+S"))?;
    let sidebar = MenuItem::with_id(app, "sidebar-toggle", "Show/Hide Clip Sidebar", true, Some("CmdOrCtrl+Shift+B"))?;
    for item in menu.items()? {
        if let Some(submenu) = item.as_submenu() {
            match submenu.text()?.as_str() {
                "File" => submenu.insert_items(&[&new, &open, &rename, &save, &PredefinedMenuItem::separator(app)?], 0)?,
                "View" => submenu.insert_items(&[&sidebar, &PredefinedMenuItem::separator(app)?], 0)?,
                _ => {}
            }
        }
    }
    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        let action = match event.id().as_ref() {
            "project-new" => "new",
            "project-open" => "open",
            "project-save" => "save",
            "project-rename" => "rename",
            "sidebar-toggle" => "sidebar",
            _ => return,
        };
        let _ = app.emit("studio-menu", action);
    });
    Ok(())
}
