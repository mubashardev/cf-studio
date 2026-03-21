// r2.rs
//
// Cloudflare R2 File Management API — list buckets, objects, and perform file operations.
// Operates over the CloudflareClient using the Wrangler OAuth token (zero-touch auth).
// Bypasses the need for S3 Access Keys entirely using Cloudflare's direct REST API.

use serde::{Deserialize, Serialize};
use reqwest::header::CONTENT_TYPE;

use crate::cloudflare_auth::{read_credentials, AuthError};
use crate::cloudflare_client::{CfError, CfResponse, CloudflareClient};
use tauri::Emitter;
use tokio_util::codec::{BytesCodec, FramedRead};
use futures_util::stream::StreamExt;
use crate::UploadState;

// ── Error type ─────────────────────────────────────────────────────────────────

#[derive(Debug, thiserror::Error)]
pub enum R2Error {
    #[error("Authentication error: {0}")]
    Auth(#[from] AuthError),

    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Could not determine your Cloudflare account ID. Your account may not have API access.")]
    NoAccountId,

    #[error("Cloudflare API error(s): {0}")]
    Api(String),
}

impl Serialize for R2Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

// ── API types ──────────────────────────────────────────────────────────────────

/// Minimal account info from `GET /accounts`.
#[derive(Debug, Deserialize)]
struct CfAccount {
    id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct R2Bucket {
    pub name: String,
    pub creation_date: String,
    pub object_count: Option<u64>,
    pub total_size_bytes: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BucketsResponse {
    pub buckets: Vec<R2Bucket>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct R2Object {
    pub key: String,
    pub size: u64,
    pub uploaded: String,
    pub etag: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ObjectsResponse {
    pub objects: Option<Vec<serde_json::Value>>,
    #[serde(rename = "delimitedPrefixes")]
    pub delimited_prefixes: Option<Vec<serde_json::Value>>,
    pub truncated: bool,
    pub cursor: Option<String>,
}

#[derive(Serialize)]
pub struct FolderListing {
    pub files: Vec<R2Object>,
    pub folders: Vec<String>,
}

#[derive(Serialize)]
pub struct BucketDomainsInfo {
    managed: serde_json::Value,
    custom: Vec<serde_json::Value>,
}

#[derive(Clone, Serialize)]
pub struct UploadProgress {
    upload_id: String,
    bytes_uploaded: u64,
    total_bytes: u64,
}

#[derive(Clone, Serialize)]
pub struct EmptyBucketProgress {
    pub bucket_name: String,
    pub deleted: u32,
    pub total: u32,
}

// ── Helper ─────────────────────────────────────────────────────────────────────

fn api_errors_to_string(errors: &[CfError]) -> String {
    errors
        .iter()
        .map(|e| format!("[{}] {}", e.code, e.message))
        .collect::<Vec<_>>()
        .join("; ")
}

async fn resolve_account_id(client: &CloudflareClient) -> Result<String, R2Error> {
    let resp = client
        .get("accounts")
        .send()
        .await?
        .json::<CfResponse<Vec<CfAccount>>>()
        .await?;

    if !resp.success {
        return Err(R2Error::Api(api_errors_to_string(&resp.errors)));
    }

    let accounts = resp.result.unwrap_or_default();
    accounts
        .into_iter()
        .next()
        .map(|a| a.id)
        .ok_or(R2Error::NoAccountId)
}

// ── Tauri Commands ─────────────────────────────────────────────────────────────

/// Fetches the list of all R2 buckets for the authenticated Cloudflare account.
#[tauri::command]
pub async fn create_r2_bucket(bucket_name: String) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id { Some(id) => id, None => resolve_account_id(&client).await? };
    let url = format!("accounts/{}/r2/buckets", account_id);
    let body = serde_json::json!({ "name": bucket_name });
    let resp = client.post(&url).json(&body).send().await?.json::<CfResponse<serde_json::Value>>().await?;
    if !resp.success { return Err(R2Error::Api(api_errors_to_string(&resp.errors))); }
    Ok(())
}

#[tauri::command]
pub async fn delete_r2_bucket(bucket_name: String) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id { Some(id) => id, None => resolve_account_id(&client).await? };
    let url = format!("accounts/{}/r2/buckets/{}", account_id, bucket_name);
    
    let resp = client.delete(&url).send().await?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(R2Error::Api(format!("Delete bucket failed: {}", text)));
    }
    
    Ok(())
}

#[tauri::command]
pub async fn empty_r2_bucket(
    app: tauri::AppHandle,
    bucket_name: String
) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    let mut cursor: Option<String> = None;
    let mut all_keys = Vec::new();

    loop {
        let mut url = format!("accounts/{}/r2/buckets/{}/objects", account_id, bucket_name);
        if let Some(c) = &cursor {
            url = format!("{}?cursor={}", url, urlencoding::encode(c));
        }

        let resp = client
            .get(&url)
            .send()
            .await?
            .json::<CfResponse<Vec<serde_json::Value>>>()
            .await?;

        if !resp.success {
            return Err(R2Error::Api(api_errors_to_string(&resp.errors)));
        }

        if let Some(objects) = resp.result {
            for obj in objects {
                if let Some(k) = obj["key"].as_str() {
                    all_keys.push(k.to_string());
                }
            }
        }

        let mut is_truncated = false;
        if let Some(info) = resp.result_info {
            if let Some(trunc) = info.get("truncated").and_then(|v| v.as_bool()) {
                is_truncated = trunc;
            } else if let Some(trunc) = info.get("is_truncated").and_then(|v| v.as_bool()) {
                is_truncated = trunc;
            }
            
            if let Some(c) = info.get("cursor").and_then(|v| v.as_str()) {
                cursor = Some(c.to_string());
            } else {
                cursor = None;
            }
        }

        if !is_truncated || cursor.is_none() || all_keys.is_empty() {
            break;
        }
    }

    let total = all_keys.len() as u32;
    let mut deleted = 0;

    let _ = app.emit("empty-bucket-progress", EmptyBucketProgress {
        bucket_name: bucket_name.clone(),
        deleted,
        total,
    });

    for key in all_keys {
        let url = format!("accounts/{}/r2/buckets/{}/objects/{}", account_id, bucket_name, urlencoding::encode(&key));
        let _ = client.delete(&url).send().await?;
        deleted += 1;
        let _ = app.emit("empty-bucket-progress", EmptyBucketProgress {
            bucket_name: bucket_name.clone(),
            deleted,
            total,
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn fetch_r2_buckets() -> Result<Vec<R2Bucket>, R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    let resp = client
        .get(&format!("accounts/{}/r2/buckets", account_id))
        .send()
        .await?
        .json::<CfResponse<BucketsResponse>>()
        .await?;

    if !resp.success {
        return Err(R2Error::Api(api_errors_to_string(&resp.errors)));
    }

    let mut buckets = resp.result.map(|r| r.buckets).unwrap_or_default();

    // ── GraphQL Stats Fetching ───────────────────────────────────────────────
    let date_geq = chrono::Utc::now()
        .checked_sub_days(chrono::Days::new(2))
        .unwrap_or_else(chrono::Utc::now)
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();

    let query = format!(
        r#"query {{ viewer {{ accounts(filter: {{accountTag: "{account_id}"}}) {{ r2StorageAdaptiveGroups(limit: 1000, filter: {{datetime_geq: "{date_geq}"}}) {{ dimensions {{ bucketName }} max {{ objectCount payloadSize }} }} }} }} }}"#
    );

    let gql_resp = client
        .post("graphql")
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await;

    if let Ok(gql_res) = gql_resp {
        if let Ok(data) = gql_res.json::<serde_json::Value>().await {
            // Traverse down to `r2StorageAdaptiveGroups` array safely
            if let Some(groups) = data["data"]["viewer"]["accounts"][0]["r2StorageAdaptiveGroups"].as_array() {
                let mut stats_map = std::collections::HashMap::new();
                for group in groups {
                    if let Some(bname) = group["dimensions"]["bucketName"].as_str() {
                        let count = group["max"]["objectCount"].as_u64().unwrap_or(0);
                        let size = group["max"]["payloadSize"].as_u64().unwrap_or(0);
                        stats_map.insert(bname.to_string(), (count, size));
                    }
                }

                for b in &mut buckets {
                    if let Some(&(count, size)) = stats_map.get(&b.name) {
                        b.object_count = Some(count);
                        b.total_size_bytes = Some(size);
                    } else {
                        b.object_count = Some(0);
                        b.total_size_bytes = Some(0);
                    }
                }
            }
        }
    }

    Ok(buckets)
}

/// Lists objects (files) and common prefixes (folders) at a specific prefix.
#[tauri::command]
pub async fn list_r2_objects(bucket_name: String, prefix: String) -> Result<FolderListing, R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    let mut url = format!("accounts/{}/r2/buckets/{}/objects?delimiter=/", account_id, bucket_name);
    if !prefix.is_empty() {
        // Cloudflare requires URL encoded query params
        url = format!("{}&prefix={}", url, urlencoding::encode(&prefix));
    }

    let text = client
        .get(&url)
        .send()
        .await?
        .text()
        .await?;
        
    println!("RAW OBJECTS RESPONSE: {}", text);
    
    let resp = client
        .get(&url)
        .send()
        .await?
        .json::<CfResponse<Vec<serde_json::Value>>>()
        .await?;

    if !resp.success {
        return Err(R2Error::Api(api_errors_to_string(&resp.errors)));
    }

    let all_objects = resp.result.unwrap_or_default();
    
    let mut files = Vec::new();
    let mut folders = std::collections::HashSet::new();

    // Cloudflare's REST API returns a flat array. We simulate folder architecture manually:
    for obj in all_objects {
        let key = obj["key"].as_str().unwrap_or("").to_string();
        
        // If a prefix is requested, ignore objects that don't start with it
        if !prefix.is_empty() && !key.starts_with(&prefix) {
            continue;
        }

        // Determine the relative path after the prefix
        let relative_path = if prefix.is_empty() {
            &key[..]
        } else {
            &key[prefix.len()..]
        };

        if let Some(slash_idx) = relative_path.find('/') {
            // It's a folder: extract the folder name (up to and including the `/`)
            let folder_name = &relative_path[..=slash_idx];
            folders.insert(format!("{}{}", prefix, folder_name));
        } else {
            // It's a file at the current depth
            files.push(R2Object {
                key,
                size: obj["size"].as_u64().unwrap_or(0),
                uploaded: obj["last_modified"].as_str().unwrap_or(obj["uploaded"].as_str().unwrap_or("")).to_string(),
                etag: obj["etag"].as_str().unwrap_or("").to_string(),
            });
        }
    }

    // Capture explicit simulated directories returned by Cloudflare's delimiter param
    if let Some(info) = resp.result_info {
        if let Some(delimited) = info.get("delimited").and_then(|v| v.as_array()) {
            for v in delimited {
                if let Some(s) = v.as_str() {
                    folders.insert(s.to_string());
                }
            }
        }
    }

    let mut folders_vec: Vec<String> = folders.into_iter().collect();
    folders_vec.sort();

    Ok(FolderListing { files, folders: folders_vec })
}

/// Deletes an object by key.
#[tauri::command]
pub async fn delete_r2_object(bucket_name: String, key: String) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    let url = format!("accounts/{}/r2/buckets/{}/objects/{}", account_id, bucket_name, urlencoding::encode(&key));
    
    let resp = client
        .delete(&url)
        .send()
        .await?;

    if !resp.status().is_success() {
        // sometimes delete endpoints return a CfResponse, sometimes just 200/204 empty
        let text = resp.text().await.unwrap_or_default();
        return Err(R2Error::Api(format!("Delete failed: {}", text)));
    }

    Ok(())
}

#[tauri::command]
pub async fn upload_r2_object(
    app: tauri::AppHandle,
    state: tauri::State<'_, UploadState>,
    upload_id: String,
    bucket_name: String,
    key: String,
    local_path: String
) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    let metadata = tokio::fs::metadata(&local_path).await?;
    let total_bytes = metadata.len();
    let mime_type = mime_guess::from_path(&local_path).first_or_octet_stream();

    let token = tokio_util::sync::CancellationToken::new();
    {
        let mut map = state.cancel_tokens.lock().await;
        map.insert(upload_id.clone(), token.clone());
    }

    let file = tokio::fs::File::open(&local_path).await?;
    let mut framed = FramedRead::new(file, BytesCodec::new());

    let mut uploaded = 0u64;
    let app_clone = app.clone();
    let uid_clone = upload_id.clone();
    let token_clone = token.clone();

    let stream = async_stream::stream! {
        while let Some(res) = framed.next().await {
            if token_clone.is_cancelled() {
                yield Err(std::io::Error::new(std::io::ErrorKind::Interrupted, "Upload cancelled"));
                break;
            }
            match res {
                Ok(bytes) => {
                    let chunk_len = bytes.len() as u64;
                    uploaded += chunk_len;
                    let _ = app_clone.emit("upload-progress", UploadProgress {
                        upload_id: uid_clone.clone(),
                        bytes_uploaded: uploaded,
                        total_bytes,
                    });
                    yield Ok(bytes.freeze());
                }
                Err(e) => {
                    yield Err(e);
                }
            }
        }
    };

    let body = reqwest::Body::wrap_stream(stream);
    let url = format!("accounts/{}/r2/buckets/{}/objects/{}", account_id, bucket_name, urlencoding::encode(&key));
    
    let resp = client
        .put(&url)
        .header(CONTENT_TYPE, mime_type.as_ref())
        .body(body)
        .send()
        .await;

    // Cleanup token
    {
        let mut map = state.cancel_tokens.lock().await;
        map.remove(&upload_id);
    }

    if token.is_cancelled() {
        return Err(R2Error::Api("Cancelled by user".into()));
    }

    let resp = resp?;
    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(R2Error::Api(format!("Upload failed: {}", text)));
    }

    Ok(())
}

/// Cancels an active upload and optionally attempts to delete the partial file.
#[tauri::command]
pub async fn cancel_upload_r2_object(
    state: tauri::State<'_, UploadState>,
    upload_id: String,
    bucket_name: String,
    key: String,
) -> Result<(), R2Error> {
    {
        let map = state.cancel_tokens.lock().await;
        if let Some(token) = map.get(&upload_id) {
            token.cancel();
        }
    }
    // Delete the potentially partial file
    let _ = delete_r2_object(bucket_name, key).await;
    Ok(())
}

/// Downloads an object from R2 to the local disk.
#[tauri::command]
pub async fn download_r2_object(bucket_name: String, key: String, destination_path: String) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    let url = format!("accounts/{}/r2/buckets/{}/objects/{}", account_id, bucket_name, urlencoding::encode(&key));
    
    let resp = client
        .get(&url)
        .send()
        .await?;

    if !resp.status().is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(R2Error::Api(format!("Download failed: {}", text)));
    }

    let bytes = resp.bytes().await?;
    tokio::fs::write(&destination_path, bytes).await?;

    Ok(())
}

/// Retrieves the public domain of a bucket. Checks custom domains first, then the managed .r2.dev sub-domain.
#[tauri::command]
pub async fn get_r2_bucket_domain(bucket_name: String) -> Result<Option<String>, R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;

    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id {
        Some(id) => id,
        None => resolve_account_id(&client).await?,
    };

    // First, check for custom domains
    let custom_url = format!("accounts/{}/r2/buckets/{}/domains/custom", account_id, bucket_name);
    if let Ok(resp) = client.get(&custom_url).send().await {
        if let Ok(data) = resp.json::<serde_json::Value>().await {
            if let Some(domains) = data["result"]["domains"].as_array() {
                for d in domains {
                    if d["enabled"].as_bool().unwrap_or(false) {
                        if let Some(domain) = d["domain"].as_str() {
                            return Ok(Some(format!("https://{}", domain)));
                        }
                    }
                }
            }
        }
    }

    // Fallback: check managed domain
    let managed_url = format!("accounts/{}/r2/buckets/{}/domains/managed", account_id, bucket_name);
    if let Ok(resp) = client.get(&managed_url).send().await {
        if let Ok(data) = resp.json::<serde_json::Value>().await {
            if data["result"]["enabled"].as_bool().unwrap_or(false) {
                if let Some(domain) = data["result"]["domain"].as_str() {
                    return Ok(Some(format!("https://{}", domain)));
                }
            }
        }
    }

    Ok(None)
}

#[tauri::command]
pub async fn update_r2_bucket_managed_domain(bucket_name: String, enabled: bool) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id { Some(id) => id, None => resolve_account_id(&client).await? };
    let url = format!("accounts/{}/r2/buckets/{}/domains/managed", account_id, bucket_name);
    let body = serde_json::json!({ "enabled": enabled });
    let resp = client.put(&url).json(&body).send().await?;
    if !resp.status().is_success() { return Err(R2Error::Api(resp.text().await.unwrap_or_default())); }
    Ok(())
}

#[tauri::command]
pub async fn add_r2_bucket_custom_domain(bucket_name: String, domain: String, zone_id: String) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id { Some(id) => id, None => resolve_account_id(&client).await? };
    let url = format!("accounts/{}/r2/buckets/{}/domains/custom", account_id, bucket_name);
    let body = serde_json::json!({ "domain": domain, "zoneId": zone_id });
    let resp = client.post(&url).json(&body).send().await?;
    if !resp.status().is_success() { return Err(R2Error::Api(resp.text().await.unwrap_or_default())); }
    Ok(())
}

#[tauri::command]
pub async fn remove_r2_bucket_custom_domain(bucket_name: String, domain: String) -> Result<(), R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id { Some(id) => id, None => resolve_account_id(&client).await? };
    let url = format!("accounts/{}/r2/buckets/{}/domains/custom/{}", account_id, bucket_name, domain);
    let resp = client.delete(&url).send().await?;
    if !resp.status().is_success() { return Err(R2Error::Api(resp.text().await.unwrap_or_default())); }
    Ok(())
}

#[tauri::command]
pub async fn get_r2_bucket_domains_list(bucket_name: String) -> Result<BucketDomainsInfo, R2Error> {
    let creds = tokio::task::spawn_blocking(read_credentials)
        .await
        .map_err(|e| R2Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e.to_string())))??;
    let client = CloudflareClient::new(&creds.oauth_token)?;
    let account_id = match creds.account_id { Some(id) => id, None => resolve_account_id(&client).await? };
    
    let mut managed = serde_json::json!({ "enabled": false, "domain": null });
    let managed_url = format!("accounts/{}/r2/buckets/{}/domains/managed", account_id, bucket_name);
    if let Ok(resp) = client.get(&managed_url).send().await {
        if let Ok(data) = resp.json::<serde_json::Value>().await {
            managed = data["result"].clone();
        }
    }
    
    let mut custom = Vec::new();
    let custom_url = format!("accounts/{}/r2/buckets/{}/domains/custom", account_id, bucket_name);
    if let Ok(resp) = client.get(&custom_url).send().await {
        if let Ok(data) = resp.json::<serde_json::Value>().await {
            if let Some(domains) = data["result"]["domains"].as_array() {
                custom = domains.clone();
            }
        }
    }
    
    Ok(BucketDomainsInfo { managed, custom })
}
