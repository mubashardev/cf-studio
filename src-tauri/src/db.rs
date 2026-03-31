use rusqlite::Connection;
use std::sync::Mutex;
use tauri::AppHandle;
use tauri::Manager;

// ── Managed State ──────────────────────────────────────────────────────────────

pub struct DbState(pub Mutex<Connection>);

// ── Database Initialisation ────────────────────────────────────────────────────

pub fn init_db(app: &AppHandle) -> Result<DbState, String> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Could not resolve app data directory: {}", e))?;

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

    // The basic table schema remains in the core to avoid breaking the DB 
    // initialization if the pro module is absent.
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
        CREATE INDEX IF NOT EXISTS idx_qh_timestamp ON query_history(timestamp DESC);
        CREATE TABLE IF NOT EXISTS r2_workers (
            bucket_name  TEXT PRIMARY KEY,
            worker_url   TEXT NOT NULL,
            auth_secret  TEXT NOT NULL,
            last_used    DATETIME DEFAULT CURRENT_TIMESTAMP
        );"
    ).map_err(|e| e.to_string())?;

    println!("Database initialized at: {:?}", db_path);

    Ok(DbState(Mutex::new(conn)))
}
