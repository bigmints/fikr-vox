use std::path::{Path, PathBuf};

pub fn local_tool(resources: &Path, name: &str) -> PathBuf {
    if cfg!(debug_assertions) {
        resources.join(format!("{name}-aarch64-apple-darwin"))
    } else {
        // Tauri puts sidecars next to the main executable under Contents/MacOS.
        resources.join("../../MacOS").join(name)
    }
}

pub fn compatible_data_dir(current: PathBuf) -> PathBuf {
    if current.join("studio.json").exists() {
        return current;
    }
    let legacy = current.parent().map(|parent| parent.join("com.pretheesh.mytwin"));
    legacy.filter(|path| path.join("studio.json").exists()).unwrap_or(current)
}

// The selected data directory can be the legacy MyTwin directory. Tauri's
// static $APPDATA scope follows the new identifier, so grant only the actual
// managed media directory. Never grant the whole data directory (secrets live there).
pub fn allow_media(scope: &tauri::scope::fs::Scope, data_dir: &Path) -> tauri::Result<()> {
    scope.allow_directory(data_dir.join("media"), false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    #[test]
    fn new_install_uses_new_identifier() {
        let root = tempfile::tempdir().unwrap();
        let current = root.path().join("com.bigmints.fikr.vox");
        assert_eq!(compatible_data_dir(current.clone()), current);
    }
    #[test]
    fn existing_install_keeps_projects_and_model_directory() {
        let root = tempfile::tempdir().unwrap();
        let legacy = root.path().join("com.pretheesh.mytwin");
        fs::create_dir(&legacy).unwrap();
        fs::write(legacy.join("studio.json"), "{}").unwrap();
        assert_eq!(compatible_data_dir(root.path().join("com.bigmints.fikr.vox")), legacy);
    }
    #[test]
    fn existing_new_database_takes_precedence() {
        let root = tempfile::tempdir().unwrap();
        let current = root.path().join("com.bigmints.fikr.vox");
        let legacy = root.path().join("com.pretheesh.mytwin");
        for path in [&current, &legacy] {
            fs::create_dir(path).unwrap();
            fs::write(path.join("studio.json"), "{}").unwrap();
        }
        assert_eq!(compatible_data_dir(current.clone()), current);
    }

    #[test]
    fn migrated_media_plays_without_exposing_other_app_data() {
        let root = tempfile::tempdir().unwrap();
        let current = root.path().join("com.bigmints.fikr.vox");
        let legacy = root.path().join("com.pretheesh.mytwin");
        for dir in [&current, &legacy] { fs::create_dir_all(dir.join("media")).unwrap(); }
        fs::write(legacy.join("studio.json"), "{}").unwrap();
        fs::write(legacy.join("media/preview.wav"), b"RIFF").unwrap();
        fs::write(legacy.join("secrets.json"), "{}").unwrap();
        fs::write(root.path().join("private.txt"), "private").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(root.path().join("private.txt"), legacy.join("media/link.txt")).unwrap();
        let app = tauri::test::mock_app();
        let scope = tauri::scope::fs::Scope::new(&app, &tauri::utils::config::FsScope::AllowedPaths(vec![current.join("media/*")])).unwrap();
        let selected = compatible_data_dir(current);
        assert!(!scope.is_allowed(selected.join("media/preview.wav")), "Static new-app scope must reproduce the migrated-media failure");
        allow_media(&scope, &selected).unwrap();
        assert!(scope.is_allowed(selected.join("media/preview.wav")));
        fs::write(selected.join("media/generated-after-startup.wav"), b"RIFF").unwrap();
        assert!(scope.is_allowed(selected.join("media/generated-after-startup.wav")));
        assert!(!scope.is_allowed(selected.join("secrets.json")));
        assert!(!scope.is_allowed(selected.join("studio.json")));
        assert!(!scope.is_allowed(root.path().join("private.txt")));
        #[cfg(unix)]
        assert!(!scope.is_allowed(selected.join("media/link.txt")));
    }
}
