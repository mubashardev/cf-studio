// CF Studio — Tauri backend entry point

pub mod cloudflare_auth;
pub mod cloudflare_client;
pub mod d1;
pub mod user;

use cloudflare_auth::{read_credentials, AuthError, CloudflareCredentials};

// ── Tauri Commands ─────────────────────────────────────────────────────────────

/// Read the local Wrangler session and return Cloudflare credentials to the
/// React frontend. Never asks the user for a token — pure zero-touch auth.
#[tauri::command]
async fn get_cloudflare_token() -> Result<CloudflareCredentials, AuthError> {
    // `read_credentials` does synchronous file I/O; run it on a blocking
    // thread so we don't stall the Tokio executor.
    tokio::task::spawn_blocking(read_credentials)
        .await
        .unwrap_or_else(|e| Err(AuthError::Io(std::io::Error::new(
            std::io::ErrorKind::Other,
            e.to_string(),
        ))))
}

/// Dev-only greet command — remove before shipping.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// ── Tauri App Entry Point ──────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_cloudflare_token,
            d1::fetch_d1_databases,
            d1::execute_d1_query,
            user::fetch_user_profile,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
