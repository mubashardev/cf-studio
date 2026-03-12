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

    #[error("Could not determine your Cloudflare account ID. Your account may not have API access.")]
    NoAccountId,

    #[error("Cloudflare API error(s): {0}")]
    Api(String),
}

impl Serialize for D1Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── API types ──────────────────────────────────────────────────────────────────

/// Minimal account info from `GET /accounts`.
#[derive(Debug, Deserialize)]
struct CfAccount {
    id: String,
    #[allow(dead_code)]
    name: Option<String>,
}

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

// ── Helper ─────────────────────────────────────────────────────────────────────

fn api_errors_to_string(errors: &[CfError]) -> String {
    errors
        .iter()
        .map(|e| format!("[{}] {}", e.code, e.message))
        .collect::<Vec<_>>()
        .join("; ")
}

// ── Account ID resolution ──────────────────────────────────────────────────────

/// Fetches the first Cloudflare account visible to the OAuth token.
/// Used when the Wrangler config file doesn't contain `account_id`.
async fn resolve_account_id(client: &CloudflareClient) -> Result<String, D1Error> {
    let resp = client
        .get("accounts")
        .send()
        .await?
        .json::<CfResponse<Vec<CfAccount>>>()
        .await?;

    if !resp.success {
        return Err(D1Error::Api(api_errors_to_string(&resp.errors)));
    }

    let accounts = resp.result.unwrap_or_default();
    accounts
        .into_iter()
        .next()
        .map(|a| a.id)
        .ok_or(D1Error::NoAccountId)
}

// ── Core async fn ──────────────────────────────────────────────────────────────

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
/// Cloudflare account.
///
/// Account resolution order:
/// 1. `account_id` field in `~/.wrangler/config/default.toml` (rare)
/// 2. Auto-fetched from `GET /accounts` using the OAuth token (typical)
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

    let client = CloudflareClient::new(&creds.oauth_token)?;

    // Use the account_id from Wrangler config if present, otherwise fetch it.
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    list_databases(&client, &account_id).await
}
