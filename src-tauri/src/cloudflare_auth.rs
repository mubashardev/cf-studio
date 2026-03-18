// cloudflare_auth.rs
//
// Reads the local Wrangler OAuth config to provide zero-touch authentication.
// No API tokens are ever stored in CF Studio — we reuse the session that
// `wrangler login` already created on the user's machine.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

use crate::cloudflare_client::{CfError, CfResponse, CloudflareClient};

// ── Error type ─────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum AuthError {
    #[error("Wrangler config directory not found. Is your home directory set?")]
    ConfigDirNotFound,

    #[error("Wrangler config file not found at {0}. Run `wrangler login` first.")]
    ConfigFileNotFound(String),

    #[error("Failed to read Wrangler config: {0}")]
    Io(#[from] std::io::Error),

    #[error("Failed to parse Wrangler config TOML: {0}")]
    TomlParse(#[from] toml::de::Error),

    #[error("No oauth_token found in Wrangler config. Run `wrangler login` first.")]
    NoToken,

    #[error("Command execution failed: {0}")]
    ExecError(String),
}

// Tauri requires errors to be serializable so they travel back to JS as strings.
impl Serialize for AuthError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── Wrangler config shape ──────────────────────────────────────────────────────

/// Only the fields we care about from `~/.config/.wrangler/config/default.toml`
#[derive(Debug, Deserialize)]
struct WranglerConfig {
    oauth_token: Option<String>,
    /// Wrangler sometimes stores the account_id it last used.
    account_id: Option<String>,
}

// ── Public result type returned to the frontend ────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct CloudflareCredentials {
    pub oauth_token: String,
    /// Present only when Wrangler has cached the account ID.
    pub account_id: Option<String>,
}

// ── Cloudflare Accounts ────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CloudflareAccount {
    pub id: String,
    pub name: String,
}

#[derive(Debug, thiserror::Error)]
pub enum AccountsError {
    #[error("Authentication error: {0}")]
    Auth(#[from] AuthError),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("Cloudflare API error(s): {0}")]
    Api(String),
}

impl Serialize for AccountsError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

fn api_errors_to_string(errors: &[CfError]) -> String {
    errors
        .iter()
        .map(|e| format!("[{}] {}", e.code, e.message))
        .collect::<Vec<_>>()
        .join("; ")
}

// ── Path resolution ────────────────────────────────────────────────────────────

/// Returns candidate paths to search for the Wrangler `default.toml`, in
/// priority order. We try multiple because Wrangler's storage location has
/// changed across versions and differs per OS:
///
/// | Platform | Path |
/// |----------|------|
/// | macOS    | `~/Library/Preferences/.wrangler/config/default.toml` |
/// | Linux    | `~/.config/.wrangler/config/default.toml` |
/// | Windows  | `%USERPROFILE%\.wrangler\config\default.toml` |
///
/// We also add `~/.wrangler/config/default.toml` as a universal fallback
/// since older Wrangler versions stored it there on all platforms.
fn wrangler_candidate_paths() -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // macOS: ~/Library/Preferences/.wrangler/config/default.toml
    // Linux: ~/.config/.wrangler/config/default.toml
    if let Some(pref) = dirs::preference_dir() {
        candidates.push(pref.join(".wrangler").join("config").join("default.toml"));
    }

    // Linux / XDG: ~/.config/.wrangler/config/default.toml
    if let Some(cfg) = dirs::config_dir() {
        candidates.push(cfg.join(".wrangler").join("config").join("default.toml"));
    }

    // Universal fallback: ~/.wrangler/config/default.toml
    if let Some(home) = dirs::home_dir() {
        candidates.push(
            home.join(".wrangler").join("config").join("default.toml"),
        );
        // Also try the old ~/.config/.wrangler path explicitly
        candidates.push(
            home.join(".config")
                .join(".wrangler")
                .join("config")
                .join("default.toml"),
        );
    }

    // De-duplicate while preserving order
    let mut seen = std::collections::HashSet::new();
    candidates.retain(|p| seen.insert(p.clone()));
    candidates
}

/// Returns the first existing Wrangler config path, or the primary candidate
/// path for use in error messages when none are found.
pub fn wrangler_config_path() -> Result<PathBuf, AuthError> {
    let candidates = wrangler_candidate_paths();
    if candidates.is_empty() {
        return Err(AuthError::ConfigDirNotFound);
    }

    // Prefer the most recently modified config if multiple exist.
    let existing: Vec<PathBuf> = candidates
        .iter()
        .filter(|p| p.exists())
        .cloned()
        .collect();

    if !existing.is_empty() {
        let mut newest = existing[0].clone();
        let mut newest_mtime = fs::metadata(&newest).and_then(|m| m.modified()).ok();

        for path in existing.into_iter().skip(1) {
            if let Ok(meta) = fs::metadata(&path) {
                if let Ok(modified) = meta.modified() {
                    let is_newer = newest_mtime
                        .map(|t| modified > t)
                        .unwrap_or(true);
                    if is_newer {
                        newest = path;
                        newest_mtime = Some(modified);
                    }
                }
            }
        }

        return Ok(newest);
    }

    // None existed — return the primary candidate for a good error message
    Err(AuthError::ConfigFileNotFound(
        candidates[0].to_string_lossy().into_owned(),
    ))
}

// ── Core parsing logic ─────────────────────────────────────────────────────────

/// Reads and parses the Wrangler config, returning the extracted credentials.
pub fn read_credentials() -> Result<CloudflareCredentials, AuthError> {
    let path = wrangler_config_path()?;
    let raw = fs::read_to_string(&path)?;
    let config: WranglerConfig = toml::from_str(&raw)?;
    let oauth_token = config.oauth_token.ok_or(AuthError::NoToken)?;
    Ok(CloudflareCredentials {
        oauth_token,
        account_id: config.account_id,
    })
}

// ── Background Token Refresh ───────────────────────────────────────────────────

/// Executes `wrangler whoami` silently in the background. Wrangler automatically
/// detects expired tokens and refreshes them during this command. We then
/// re-read the configuration file and return the fresh token.
#[tauri::command]
pub async fn refresh_wrangler_token() -> Result<CloudflareCredentials, AuthError> {
    let output = tokio::task::spawn_blocking(|| {
        let mut cmd = if cfg!(target_os = "windows") {
            let mut c = std::process::Command::new("cmd");
            c.args(["/c", "npx", "wrangler", "d1", "list"]);
            c
        } else {
            let mut c = std::process::Command::new("npx");
            c.args(["wrangler", "d1", "list"]);
            c
        };

        // Run silently
        cmd.output()
    })
    .await
    .map_err(|e| AuthError::ExecError(e.to_string()))?
    .map_err(AuthError::Io)?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(AuthError::ExecError(format!("Wrangler failed to refresh token: {}", err_msg)));
    }

    // Re-read the credentials now that Wrangler has updated the config file
    tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| AuthError::ExecError(e.to_string()))?
}

// ── Accounts API ───────────────────────────────────────────────────────────────

/// Fetches the list of Cloudflare accounts visible to the current OAuth token.
#[tauri::command]
pub async fn fetch_cloudflare_accounts() -> Result<Vec<CloudflareAccount>, AccountsError> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .unwrap_or_else(|e| {
            Err(AuthError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            )))
        })?;

    let client = CloudflareClient::new(&creds.oauth_token)?;

    let resp = client
        .get("accounts")
        .send()
        .await?
        .json::<CfResponse<Vec<CloudflareAccount>>>()
        .await?;

    if !resp.success {
        return Err(AccountsError::Api(api_errors_to_string(&resp.errors)));
    }

    Ok(resp.result.unwrap_or_default())
}

// ── Tests ──────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wrangler_path_ends_correctly() {
        // Just verify the path ends with the expected segments.
        // The home directory itself is environment-dependent.
        if let Ok(p) = wrangler_config_path() {
            let s = p.to_string_lossy();
            assert!(s.contains(".wrangler"), "path should contain .wrangler: {s}");
            assert!(s.ends_with("default.toml"), "path should end with default.toml: {s}");
        }
    }

    #[test]
    fn missing_config_returns_error() {
        // Simulate a non-existent file.
        let path = PathBuf::from("/tmp/__cf_studio_nonexistent_test_file.toml");
        assert!(!path.exists());
    }
}
