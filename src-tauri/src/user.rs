use crate::cloudflare_auth::{read_credentials, AuthError};
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
pub struct UserProfile {
    pub email: String,
    // Note: Cloudflare doesn't always have a strict 'name' field,
    // but we can extract `first_name` and `last_name` if they exist.
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub id: String,
}

#[derive(Debug, Deserialize)]
struct UserResponse {
    success: bool,
    result: Option<UserProfile>,
    errors: Vec<serde_json::Value>,
}

#[derive(Debug, thiserror::Error)]
pub enum UserError {
    #[error("Authentication failed: {0}")]
    Auth(#[from] AuthError),

    #[error("Network request failed: {0}")]
    Network(#[from] reqwest::Error),

    #[error("Cloudflare API error: {0}")]
    Api(String),
}

impl Serialize for UserError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

#[tauri::command]
pub async fn fetch_user_profile() -> Result<UserProfile, UserError> {
    // 1. Get token
    let creds = read_credentials().map_err(UserError::Auth)?;

    // 2. Make request
    let url = "https://api.cloudflare.com/client/v4/user";
    let client = Client::new();
    let res = client
        .get(url)
        .header("Authorization", format!("Bearer {}", creds.oauth_token))
        .header("Content-Type", "application/json")
        .send()
        .await?;

    if !res.status().is_success() {
        return Err(UserError::Api(format!("HTTP {}", res.status())));
    }

    let data: UserResponse = res.json().await?;
    if !data.success {
        return Err(UserError::Api("API returned success: false".into()));
    }

    data.result.ok_or_else(|| UserError::Api("No user profile in response".into()))
}
