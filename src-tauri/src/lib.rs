// CF Studio — Tauri backend entry point

pub mod cloudflare_auth;
pub mod cloudflare_client;
pub mod d1;
pub mod r2;
pub mod user;

use cloudflare_auth::{read_credentials, AuthError, CloudflareCredentials};
use std::sync::Arc;
use tokio::sync::Mutex;
use std::collections::HashMap;
use tokio_util::sync::CancellationToken;

#[derive(Default)]
pub struct UploadState {
    pub cancel_tokens: Arc<Mutex<HashMap<String, CancellationToken>>>,
}

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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(UploadState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_cloudflare_token,
            cloudflare_auth::refresh_wrangler_token,
            cloudflare_auth::fetch_cloudflare_accounts,
            d1::fetch_d1_databases,
            d1::execute_d1_query,
            d1::get_d1_database_info,
            r2::create_r2_bucket,
            r2::delete_r2_bucket,
            r2::empty_r2_bucket,
            r2::fetch_r2_buckets,
            r2::list_r2_objects,
            r2::delete_r2_object,
            r2::upload_r2_object,
            r2::cancel_upload_r2_object,
            r2::download_r2_object,
            r2::get_r2_bucket_domain,
            r2::update_r2_bucket_managed_domain,
            r2::add_r2_bucket_custom_domain,
            r2::remove_r2_bucket_custom_domain,
            r2::get_r2_bucket_domains_list,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
