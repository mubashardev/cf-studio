// CF Studio — Tauri backend entry point

pub mod cloudflare_auth;
pub mod cloudflare_client;
pub mod d1;
pub mod r2;
pub mod setup;
pub mod user;
pub mod db;

#[path = "../../src/pro_modules/rust/history.rs"]
pub mod history_pro;

#[path = "../../src/pro_modules/rust/domain_audit.rs"]
pub mod domain_audit_pro;

#[path = "../../src/pro_modules/rust/r2_pro.rs"]
pub mod r2_pro;

#[path = "../../src/pro_modules/rust/r2_worker_proxy.rs"]
pub mod r2_worker_proxy;

#[tauri::command]
fn is_pro_enabled() -> bool {
    #[cfg(feature = "pro")]
    return true;
    #[cfg(not(feature = "pro"))]
    return false;
}

use cloudflare_auth::{read_credentials, AuthError, CloudflareCredentials};
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;
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


use std::process::Command;

#[tauri::command]
async fn download_update_binary(
    app: tauri::AppHandle,
    _window: tauri::Window,
    url: String,
    filename: String,
) -> Result<String, String> {
    use futures_util::StreamExt;
    use std::io::Write;
    use tauri::{Emitter, Manager};

    let client = reqwest::Client::new();
    let response = client.get(url).send().await.map_err(|e| e.to_string())?;
    
    if !response.status().is_success() {
        return Err(format!("Server returned error {}: The update file might not be ready on GitHub yet.", response.status()));
    }

    let total_size = response
        .content_length()
        .ok_or_else(|| "Failed to get content length".to_string())?;

    let cache_dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let dest_path = cache_dir.join(&filename);
    let mut file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();

    let mut downloaded: u64 = 0;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;

        if total_size > 0 {
            let progress = (downloaded as f64 / total_size as f64) * 100.0;
            app.emit("update-download-progress", progress).map_err(|e| e.to_string())?;
        }
    }

    // --- NEW: Automatically launch the installer from Rust ---
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("open")
            .arg(&dest_path)
            .spawn();
    }
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("cmd")
            .args(["/C", "start", ""])
            .arg(&dest_path)
            .spawn();
    }

    Ok(dest_path.to_string_lossy().to_string())
}

#[tauri::command]
fn fix_mac_quarantine() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // We target the standard Applications path for CF Studio
        let status = Command::new("xattr")
            .args(["-cr", "/Applications/CF Studio.app"])
            .status()
            .map_err(|e: std::io::Error| e.to_string())?;
        
        if !status.success() {
            return Err("Failed to clear xattr".to_string());
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .manage(UploadState::default())
        .setup(|app| {
            cloudflare_auth::start_wrangler_watcher(app.handle().clone());
            match db::init_db(app.handle()) {
                Ok(db_state) => { app.manage(db_state); },
                Err(e) => eprintln!("Failed to initialize query history database: {}", e),
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            fix_mac_quarantine,
            get_cloudflare_token,
            cloudflare_auth::refresh_wrangler_token,
            cloudflare_auth::run_wrangler_login,
            cloudflare_auth::run_wrangler_logout,
            cloudflare_auth::fetch_cloudflare_accounts,
            d1::fetch_d1_databases,
            d1::execute_d1_query,
            d1::analyze_d1_query,
            user::fetch_user_profile,
            // ── Domain Audit (Pro) ──
            domain_audit_pro::list_cf_zones,
            domain_audit_pro::get_zone_security_settings,
            domain_audit_pro::update_zone_setting,
            domain_audit_pro::validate_zone_token,
            domain_audit_pro::verify_global_token,
            domain_audit_pro::save_zone_token,
            domain_audit_pro::delete_zone_token,
            domain_audit_pro::has_zone_token,
            domain_audit_pro::get_zone_performance_settings,
            domain_audit_pro::get_zone_dns_health,
            domain_audit_pro::add_dns_record,
            domain_audit_pro::check_active_token,
            domain_audit_pro::analyze_domain,
            // ── R2 Public ──
            r2::fetch_r2_buckets,
            r2::list_r2_objects,
            r2::delete_r2_object,
            r2::get_r2_bucket_domain,
            // ── R2 Pro (gated by remote config on the frontend) ──
            r2_pro::fetch_cloudflare_zones,
            r2_pro::create_r2_bucket,
            r2_pro::delete_r2_bucket,
            r2_pro::empty_r2_bucket,
            r2_pro::upload_r2_object,
            r2_pro::cancel_upload_r2_object,
            r2_pro::download_r2_object,
            r2_pro::update_r2_bucket_managed_domain,
            r2_pro::add_r2_bucket_custom_domain,
            r2_pro::remove_r2_bucket_custom_domain,
            r2_pro::get_r2_bucket_domains_list,
            // ── Setup ──
            setup::check_dependencies,
            setup::install_dependencies,
            download_update_binary,

            // ── History Commands (Gated by remote config on frontend) ──
            is_pro_enabled,

            history_pro::save_query_history,
            history_pro::get_paginated_history,
            history_pro::get_global_stats,
            history_pro::clear_query_history,
            history_pro::get_history_debug_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
