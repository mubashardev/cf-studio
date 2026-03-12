// d1.rs
//
// Cloudflare D1 Database API — list, inspect, and query databases.
// All functions operate over the CloudflareClient which already carries
// the Bearer token extracted from Wrangler.

use serde::{Deserialize, Serialize};

use crate::cloudflare_auth::{read_credentials, AuthError};
use crate::cloudflare_client::{CfError, CfResponse, CloudflareClient};

// ── Error type ─────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum D1Error {
    #[error("Authentication error: {0}")]
    Auth(#[from] AuthError),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("No account_id available. Add `account_id` to your wrangler config or set it explicitly.")]
    NoAccountId,

    #[error("Cloudflare API error(s): {0}")]
    Api(String),
}

impl Serialize for D1Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── D1 API types ───────────────────────────────────────────────────────────────

/// A single D1 database as returned by the Cloudflare list endpoint.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct D1Database {
    pub uuid: String,
    pub name: String,
    pub created_at: Option<String>,
    pub version: Option<String>,
    pub num_tables: Option<u32>,
    pub file_size: Option<u64>,
}

// ── Helper: format API errors into a readable string ──────────────────────────

fn api_errors_to_string(errors: &[CfError]) -> String {
    errors
        .iter()
        .map(|e| format!("[{}] {}", e.code, e.message))
        .collect::<Vec<_>>()
        .join("; ")
}

// ── Core async function (shared by the Tauri command and future callers) ───────

pub async fn list_databases(
    client: &CloudflareClient,
    account_id: &str,
) -> Result<Vec<D1Database>, D1Error> {
    let resp = client
        .get(&format!("accounts/{account_id}/d1/database"))
        .send()
        .await?
        .json::<CfResponse<Vec<D1Database>>>()
        .await?;

    if !resp.success {
        return Err(D1Error::Api(api_errors_to_string(&resp.errors)));
    }

    Ok(resp.result.unwrap_or_default())
}

// ── Tauri command ──────────────────────────────────────────────────────────────

/// Invoked by the React frontend to list all D1 databases for the authenticated
/// Cloudflare account. Reads credentials from the local Wrangler session.
#[tauri::command]
pub async fn fetch_d1_databases() -> Result<Vec<D1Database>, D1Error> {
    // Read credentials — offload blocking I/O to the thread-pool.
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .unwrap_or_else(|e| {
            Err(AuthError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            )))
        })?;

    let account_id = creds.account_id.ok_or(D1Error::NoAccountId)?;
    let client = CloudflareClient::new(&creds.oauth_token)?;

    list_databases(&client, &account_id).await
}
