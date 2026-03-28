use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

// ── Managed State ──────────────────────────────────────────────────────────────

pub struct DbState(pub Mutex<Connection>);

// ── Structs ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct QueryHistoryEntry {
    pub id: i64,
    pub account_id: String,
    pub database_id: String,
    pub session_id: String,
    pub execution_source: String,
    pub table_name: Option<String>,
    pub query_text: String,
    pub rows_read: i64,
    pub result_data: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct GlobalStats {
    pub total_reads: i64,
    pub total_queries: i64,
}

// ── Database Initialisation ────────────────────────────────────────────────────

pub fn init_db(app: &AppHandle) -> Result<DbState, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "Could not resolve system data directory".to_string())?;

    let app_dir = data_dir.join("dev.cfstudio.app");
    std::fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;

    let db_path = app_dir.join("query_history.db");
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("Failed to open SQLite database: {}", e))?;

    // Performance pragmas
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous  = NORMAL;
         PRAGMA foreign_keys = ON;"
    ).map_err(|e| e.to_string())?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS query_history (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id       TEXT    NOT NULL,
            database_id      TEXT    NOT NULL,
            session_id       TEXT    NOT NULL,
            execution_source TEXT    NOT NULL DEFAULT 'RAW_QUERY',
            table_name       TEXT,
            query_text       TEXT    NOT NULL,
            rows_read        INTEGER DEFAULT 0,
            result_data      TEXT,
            timestamp        DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_qh_account   ON query_history(account_id);
        CREATE INDEX IF NOT EXISTS idx_qh_session   ON query_history(session_id);
        CREATE INDEX IF NOT EXISTS idx_qh_timestamp ON query_history(timestamp DESC);"
    ).map_err(|e| e.to_string())?;

    let _ = app; // consumed for future use (e.g. path resolver)
    Ok(DbState(Mutex::new(conn)))
}

// ── Commands ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn save_query_history(
    db: State<'_, DbState>,
    account_id: String,
    database_id: String,
    session_id: String,
    execution_source: String,
    table_name: Option<String>,
    query_text: String,
    rows_read: Option<i64>,
    result_data: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO query_history
            (account_id, database_id, session_id, execution_source, table_name, query_text, rows_read, result_data)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            account_id,
            database_id,
            session_id,
            execution_source,
            table_name,
            query_text,
            rows_read.unwrap_or(0),
            result_data,
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_paginated_history(
    db: State<'_, DbState>,
    account_id: String,
    database_id: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<QueryHistoryEntry>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);
    let off = offset.unwrap_or(0);

    let mut stmt = conn.prepare(
        "SELECT id, account_id, database_id, session_id, execution_source,
                table_name, query_text, rows_read, result_data, timestamp
         FROM   query_history
         WHERE  account_id = ?1
           AND  (?2 IS NULL OR database_id = ?2)
         ORDER BY timestamp DESC
         LIMIT ?3 OFFSET ?4"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(
        params![account_id, database_id, lim, off],
        |row| {
            Ok(QueryHistoryEntry {
                id:               row.get(0)?,
                account_id:       row.get(1)?,
                database_id:      row.get(2)?,
                session_id:       row.get(3)?,
                execution_source: row.get(4)?,
                table_name:       row.get(5)?,
                query_text:       row.get(6)?,
                rows_read:        row.get(7)?,
                result_data:      row.get(8)?,
                timestamp:        row.get(9)?,
            })
        }
    ).map_err(|e| e.to_string())?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row.map_err(|e| e.to_string())?);
    }

    Ok(entries)
}

#[tauri::command]
pub async fn get_global_stats(
    db: State<'_, DbState>,
    account_id: String,
) -> Result<GlobalStats, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT COALESCE(SUM(rows_read), 0) AS total_reads,
                COUNT(id) AS total_queries
         FROM   query_history
         WHERE  account_id = ?1"
    ).map_err(|e| e.to_string())?;

    let stats = stmt.query_row(params![account_id], |row| {
        Ok(GlobalStats {
            total_reads:   row.get(0)?,
            total_queries: row.get(1)?,
        })
    }).map_err(|e| e.to_string())?;

    Ok(stats)
}

#[tauri::command]
pub async fn clear_query_history(
    db: State<'_, DbState>,
    account_id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM query_history WHERE account_id = ?1",
        params![account_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}
