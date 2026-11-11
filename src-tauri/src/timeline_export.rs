use crate::store::{text, uid, Result, Store};
use base64::Engine;
use serde_json::{json, Value};
use std::time::Duration;

fn validate(plan: &Value) -> Result<()> {
    let duration = plan["duration"].as_f64().ok_or("Invalid timeline duration")?;
    if !duration.is_finite() || duration <= 0.0 || duration > 7200.0 {
        return Err("Export a timeline up to two hours".into());
    }
    if !["16:9", "9:16", "1:1", "4:3"].contains(&text(plan, "ratio").as_str())
        || !["contain", "cover"].contains(&text(plan, "fit").as_str()) {
        return Err("Choose a valid video size and Fit/Fill setting".into());
    }
    let clips = plan["clips"].as_array().ok_or("Missing video clips")?;
    if clips.is_empty() || clips.len() > 200 { return Err("Choose finished video clips to export".into()); }
    let mut end = 0.0;
    for clip in clips {
        let start = clip["start"].as_f64().ok_or("Invalid video start")?;
        let length = clip["duration"].as_f64().ok_or("Invalid video duration")?;
        let source = clip["sourceStart"].as_f64().ok_or("Invalid video trim")?;
        if text(clip,"assetId").is_empty() || !start.is_finite() || !length.is_finite() || !source.is_finite()
            || start < end - 0.00001 || length <= 0.0 || source < 0.0 || start + length > duration + 0.00001 {
            return Err("Invalid video clip timing".into());
        }
        end = start + length;
    }
    Ok(())
}

pub async fn export(store: &Store, data: String, name: String, mut plan: Value) -> Result<bool> {
    validate(&plan)?;
    if data.len() > 360 * 1024 * 1024 { return Err("Export audio is too large".into()); }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|_| "Invalid audio data")?;
    if bytes.len() < 44 || bytes.len() > 256 * 1024 * 1024 + 44 || &bytes[..4] != b"RIFF" || &bytes[8..16] != b"WAVEfmt " || &bytes[36..40] != b"data" {
        return Err("Invalid WAV export".into());
    }
    let safe_name = std::path::Path::new(&name).file_name().unwrap_or_default().to_string_lossy().into_owned();
    let Some(dest) = rfd::AsyncFileDialog::new().set_title("Export timeline video").set_file_name(&safe_name).add_filter("MP4 video", &["mp4"]).save_file().await else {return Ok(false)};
    // Do not allow replacing a source in the app's media store.
    if dest.path().starts_with(store.dir.join("media")) {return Err("Choose an export location outside the media library".into());}
    let work = store.dir.join(format!("timeline-export-{}",uid()));
    tokio::fs::create_dir(&work).await.map_err(|_| "Could not prepare video export")?;
    let result = async {
        let audio = work.join("mix.wav");
        tokio::fs::write(&audio,bytes).await.map_err(|_| "Could not prepare timeline audio")?;
        for (i,clip) in plan["clips"].as_array_mut().unwrap().iter_mut().enumerate() {
            let asset = store.asset(&text(clip,"assetId"))?;
            let mime = text(&asset,"type");
            if !mime.starts_with("video/") {return Err("A selected video source is missing".into());}
            let ext = match mime.as_str() {"video/quicktime"=>"mov","video/webm"=>"webm",_=>"mp4"};
            let local = work.join(format!("clip-{i}.{ext}"));
            tokio::fs::copy(store.asset_path(&asset)?,&local).await.map_err(|_| "Could not read a selected video")?;
            clip["path"] = json!(local);
        }
        let output = work.join("export.mp4");
        plan["audio"]=json!(audio);plan["output"]=json!(output);
        let script=work.join("export.swift");let request=work.join("request.json");
        tokio::fs::write(&script,include_str!("../../lib/timeline-video.swift")).await.map_err(|_|"Could not prepare video exporter")?;
        tokio::fs::write(&request,serde_json::to_vec(&plan).unwrap()).await.map_err(|_|"Could not prepare export request")?;
        let process=tokio::time::timeout(Duration::from_secs(1800),tokio::process::Command::new("/usr/bin/swift").arg(script).arg(request).kill_on_drop(true).output()).await.map_err(|_|"Video export timed out. Try a shorter timeline.")?.map_err(|_|"Could not start video export. Xcode command-line tools are required.")?;
        if !process.status.success(){return Err(String::from_utf8_lossy(&process.stderr).lines().last().unwrap_or("Video export failed").to_string());}
        let size=tokio::fs::metadata(&output).await.map_err(|_|"Video output is missing")?.len();
        if size==0 || size>512*1024*1024 {return Err("Video exceeds 512 MB. Export a shorter timeline.".into());}
        tokio::fs::copy(output,dest.path()).await.map_err(|_|"Could not save exported video")?;
        Ok(true)
    }.await;
    let _=tokio::fs::remove_dir_all(work).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_overlaps_invalid_ranges_and_sizes() {
        let mut plan=json!({"duration":5,"ratio":"16:9","fit":"contain","clips":[{"assetId":"v","start":1,"duration":3,"sourceStart":0}]});
        assert!(validate(&plan).is_ok());
        plan["clips"][0]["sourceStart"]=json!(-1);assert!(validate(&plan).is_err());
        plan["clips"][0]["sourceStart"]=json!(0);plan["clips"][0]["duration"]=json!(6);assert!(validate(&plan).is_err());
        plan["clips"][0]["duration"]=json!(3);plan["ratio"]=json!("bad");assert!(validate(&plan).is_err());
    }
}
