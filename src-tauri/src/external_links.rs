const ALLOWED_HOSTS: &[&str] = &["open.higgsfield.ai", "openrouter.ai", "crates.io", "pypi.org", "github.com", "huggingface.co", "www.npmjs.com", "spdx.org"];
fn checked_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid link".to_string())?;
    if url.scheme() != "https" || !url.username().is_empty() || url.password().is_some()
        || !ALLOWED_HOSTS.contains(&url.host_str().unwrap_or("")) || url.port().is_some() {
        return Err("This link is not an approved external destination".into());
    }
    Ok(url)
}
#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = checked_url(&url)?;
    #[cfg(target_os = "macos")]
    { std::process::Command::new("/usr/bin/open").arg(url.as_str()).spawn().map_err(|e| e.to_string())?; Ok(()) }
    #[cfg(not(target_os = "macos"))]
    { let _ = url; Err("Opening external links is only available on macOS".into()) }
}
#[cfg(test)]
mod tests {
    use super::checked_url;
    #[test]
    fn external_links_allow_only_approved_public_https_sources() {
        assert!(checked_url("https://openrouter.ai/settings/keys").is_ok());
        assert!(checked_url("https://open.higgsfield.ai/api-keys").is_ok());
        assert!(checked_url("https://crates.io/crates/tauri/2.12.5").is_ok());
        assert!(checked_url("https://huggingface.co/mlx-community/Kokoro-82M-bf16").is_ok());
        for url in ["file:///etc/passwd", "javascript:alert(1)", "http://github.com/astral-sh/uv", "https://github.com.evil.example/license", "https://user:password@github.com/license", "https://github.com:8000/license"] {
            assert!(checked_url(url).is_err(), "{url}");
        }
    }
}
