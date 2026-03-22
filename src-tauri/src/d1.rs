// d1.rs
//
// Cloudflare D1 Database API — list, inspect, and query databases.
// All functions operate over the CloudflareClient which already carries
// the Bearer token extracted from Wrangler.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct D1TableSummary {
    pub name: String,
    pub ncol: u32,
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
    pub tables: Option<Vec<D1TableSummary>>,
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

// ── D1 Query types ─────────────────────────────────────────────────────────────

/// Execution metadata included in every D1 query response.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct D1QueryMeta {
    pub duration: Option<f64>,
    pub rows_read: Option<u64>,
    pub rows_written: Option<u64>,
    pub changes: Option<u64>,
    pub last_row_id: Option<u64>,
    pub changed_db: Option<bool>,
    pub size_after: Option<u64>,
    pub served_by: Option<String>,
}

/// A single statement result within a D1 query response.
/// `results` is a dynamic array of row objects — column names are not
/// known at compile time, so we use `serde_json::Value`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct D1QueryResult {
    /// Rows returned by this statement (empty for DDL / DML).
    pub results: Vec<Value>,
    pub success: bool,
    pub meta: Option<D1QueryMeta>,
    /// Per-statement error message, if `success` is false.
    pub error: Option<String>,
}

// ── D1 Query helper ───────────────────────────────────────────────────────────

async fn execute_query(
    client: &CloudflareClient,
    account_id: &str,
    database_id: &str,
    sql_query: &str,
    params: Option<Vec<Value>>,
) -> Result<Vec<D1QueryResult>, D1Error> {
    let body = json!({
        "sql":    sql_query,
        "params": params.unwrap_or_default(),
    });

    let endpoint = format!("accounts/{account_id}/d1/database/{database_id}/query");

    let resp = client
        .post(&endpoint)
        .json(&body)
        .send()
        .await?;
    let resp_text = resp.text().await.map_err(|e| D1Error::Http(e))?;
    let resp: CfResponse<Vec<D1QueryResult>> = serde_json::from_str(&resp_text).map_err(|e| D1Error::Api(format!("Failed to parse response: {}. Body: {}", e, resp_text)))?;

    if !resp.success {

        return Err(D1Error::Api(api_errors_to_string(&resp.errors)));
    }

    let results = resp.result.unwrap_or_default();
    if let Some(stmt) = results.iter().find(|r| !r.success) {
        let msg = stmt
            .error
            .clone()
            .unwrap_or_else(|| "Unknown query error".to_string());
        return Err(D1Error::Api(msg));
    }

    Ok(results)
}

async fn fetch_table_metadata(
    client: &CloudflareClient,
    account_id: &str,
    database_id: &str,
) -> Result<(u32, Vec<D1TableSummary>), D1Error> {
    // We'll use PRAGMA table_list because it gives both name and ncol in one go.
    match execute_query(client, account_id, database_id, "PRAGMA table_list;", None).await {
        Ok(results) => {
            if let Some(res) = results.get(0) {
                let tables: Vec<D1TableSummary> = res.results.iter().filter_map(|v| {
                    if let Some(name) = v.get("name").and_then(|v| v.as_str()) {
                        if !name.starts_with("sqlite_") && !name.starts_with("d1_") && !name.starts_with("_cf_") {
                            let ncol = v.get("ncol").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
                            return Some(D1TableSummary { name: name.to_string(), ncol });
                        }
                    }
                    None
                }).collect();
                

                return Ok((tables.len() as u32, tables));
            }
        },
        Err(_) => {

        }
    }

    Ok((0, vec![]))
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

    let mut databases = list_databases(&client, &account_id).await?;


    for db in &mut databases {
        // Run the metadata fetch if count is missing (None) or 0 (likely placeholder)
        if db.num_tables.is_none() || db.num_tables == Some(0) {
            match fetch_table_metadata(&client, &account_id, &db.uuid).await {
                Ok((count, tables)) => {
                    db.num_tables = Some(count);
                    db.tables = Some(tables);
                },
                Err(_) => {
                    db.num_tables = Some(0);
                    db.tables = Some(vec![]);
                }
            }
        }
    }

    Ok(databases)
}

// ── execute_d1_query ───────────────────────────────────────────────────────────

/// Execute one or more SQL statements against a specific D1 database.
///
/// Parameters
/// - `account_id`  : Cloudflare account UUID (caller-supplied from the DB list)
/// - `database_id` : D1 database UUID
/// - `sql_query`   : One or more SQL statements (`;` separated)
/// - `params`      : Optional positional parameters for prepared statements
///                   (`?` placeholders). Pass `null` / omit for plain SQL.
///
/// Returns the raw `result` array from the Cloudflare API, typed as
/// `Vec<D1QueryResult>` (one entry per statement).
#[tauri::command]
pub async fn execute_d1_query(
    account_id: String,
    database_id: String,
    sql_query: String,
    params: Option<Vec<Value>>,
) -> Result<Vec<D1QueryResult>, D1Error> {
    // Load the OAuth token — blocking I/O, run on thread-pool.
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .unwrap_or_else(|e| {
            Err(AuthError::Io(std::io::Error::new(
                std::io::ErrorKind::Other,
                e.to_string(),
            )))
        })?;



    let client = CloudflareClient::new(&creds.oauth_token)?;

    // Resolve account_id: use what the caller provided, or auto-fetch.
    let resolved_account_id = if account_id.is_empty() {
        resolve_account_id(&client).await?
    } else {
        account_id
    };

    execute_query(
        &client,
        &resolved_account_id,
        &database_id,
        &sql_query,
        params,
    )
    .await
}


