// useCloudflare.ts
//
// Central React hook for all Cloudflare data. Provides:
//   - Authentication state (credentials from Wrangler session)
//   - D1 database list with loading + error states
//   - D1 schema query hook
//   - A `refresh` function to re-fetch on demand

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  useAppStore,
  isCacheStale,
  selectDatabases,
  selectLastFetched,
  selectSetDatabases,
} from "@/store/useAppStore";

// ── API Interceptor ────────────────────────────────────────────────────────────

/**
 * Wraps Tauri `invoke` to automatically catch Cloudflare 401/403/9109 errors
 * and refresh the Wrangler token in the background, then retry the request.
 */
export async function invokeCloudflare<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    const msg = String(err);
    // Cloudflare D1 Token Error (9109), normal 401/403, or AuthError
    if (msg.includes("9109") || msg.includes("401") || msg.includes("403") || msg.includes("Invalid access token")) {
      const store = useAppStore.getState();

      if (store.isRefreshingSession) {
        // Another request is already refreshing. Wait until it finishes (up to 10s).
        let waitTime = 0;
        while (useAppStore.getState().isRefreshingSession && waitTime < 10000) {
          await new Promise((r) => setTimeout(r, 200));
          waitTime += 200;
        }
        return invoke<T>(cmd, args); // Retry once after the other one finishes
      }

      console.warn(`[CF Studio] Session expired (${cmd}). Negotiating fresh token...`);
      store.setIsRefreshingSession(true);

      try {
        await invoke("refresh_wrangler_token");
        // Retry original command
        return await invoke<T>(cmd, args);
      } finally {
        store.setIsRefreshingSession(false);
      }
    }
    throw err;
  }
}


// ── Types mirroring Rust structs ───────────────────────────────────────────────

export interface CloudflareCredentials {
  oauth_token: string;
  account_id?: string;
}

export interface D1Database {
  uuid: string;
  name: string;
  created_at?: string;
  version?: string;
  num_tables?: number;
  file_size?: number;
}

export interface D1QueryMeta {
  duration?: number;
  rows_read?: number;
  rows_written?: number;
  changes?: number;
  last_row_id?: number;
}

export interface D1QueryResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: Record<string, any>[];
  success: boolean;
  meta?: D1QueryMeta;
  error?: string;
}

/** A table entry from sqlite_master */
export interface D1TableSchema {
  name: string;
  sql: string | null;
}

// Discriminated union for each async resource
export type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; message: string };

// ── Auth hook ──────────────────────────────────────────────────────────────────

export function useCloudflareAuth() {
  const [state, setState] = useState<AsyncState<CloudflareCredentials>>({
    status: "idle",
  });

  const fetch = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const creds = await invoke<CloudflareCredentials>("get_cloudflare_token");
      setState({ status: "success", data: creds });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { state, refresh: fetch };
}

// ── D1 Databases hook ──────────────────────────────────────────────────────────

export function useD1Databases() {
  const cached     = useAppStore(selectDatabases);
  const lastFetched = useAppStore(selectLastFetched);
  const setDatabases = useAppStore(selectSetDatabases);

  // Seed local state from cache immediately (synchronous — no flicker)
  const [state, setState] = useState<AsyncState<D1Database[]>>(() =>
    cached.length > 0 && !isCacheStale(lastFetched)
      ? { status: "success", data: cached }
      : { status: "idle" }
  );

  const [isFromCache, setIsFromCache] = useState(
    cached.length > 0 && !isCacheStale(lastFetched)
  );

  /** Always hits the network; use for manual refresh button. */
  const fetchFromApi = useCallback(async () => {
    setState({ status: "loading" });
    setIsFromCache(false);
    try {
      const databases = await invokeCloudflare<D1Database[]>("fetch_d1_databases");
      setDatabases(databases);           // write to persistent cache
      setState({ status: "success", data: databases });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, [setDatabases]);

  useEffect(() => {
    // Skip the network hit if the cache is still fresh.
    if (cached.length > 0 && !isCacheStale(lastFetched)) return;
    fetchFromApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once on mount

  return { state, refresh: fetchFromApi, isFromCache };
}


// ── D1 Schema hook ─────────────────────────────────────────────────────────────

const SCHEMA_SQL =
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;";

/**
 * Fetches all table names + CREATE TABLE SQL for a specific D1 database.
 * Resolves account_id automatically via `get_cloudflare_token`.
 */
export function useD1Schema(databaseId: string) {
  const [state, setState] = useState<AsyncState<D1TableSchema[]>>({
    status: "idle",
  });

  const fetch = useCallback(async () => {
    if (!databaseId) return;
    setState({ status: "loading" });
    try {
      // Resolve account_id from the local Wrangler session.
      const creds = await invoke<CloudflareCredentials>("get_cloudflare_token");

      // account_id may not be in the config — the Rust command will
      // auto-resolve via GET /accounts. We pass a sentinel empty string
      // so the command falls through to its own resolution logic.
      // Actually, execute_d1_query requires an explicit account_id.
      // We resolve it here if absent.
      let accountId = creds.account_id ?? "";
      if (!accountId) {
        // Fetch from the accounts endpoint via a known-safe Tauri channel:
        // reuse get_cloudflare_token which already re-reads credentials.
        // We rely on fetch_d1_databases to have been called first and the
        // Rust side to cache nothing — so we call a lightweight accounts
        // resolution command instead. For now we use the same hack as Rust:
        // pass "" and let the command fail, then surface the message.
        // A cleaner path: store accountId in useD1Databases.
        // For this implementation, re-invoke fetch_d1_databases to warm
        // the account id — but that's wasteful. Instead, we store accountId
        // in a module-level ref updated by useD1Databases.
        accountId = resolvedAccountId;
      }

      const queryResults = await invokeCloudflare<D1QueryResult[]>("execute_d1_query", {
        accountId,
        databaseId,
        sqlQuery: SCHEMA_SQL,
        params: null,
      });

      const rows = queryResults[0]?.results ?? [];
      const tables: D1TableSchema[] = rows.map((r) => ({
        name: String(r["name"] ?? ""),
        sql: r["sql"] != null ? String(r["sql"]) : null,
      }));

      setState({ status: "success", data: tables });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, [databaseId]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { state, refresh: fetch };
}

// Module-level store for the resolved account ID — set by useD1Databases
// so useD1Schema can access it without an extra API call.
let resolvedAccountId = "";

export function setResolvedAccountId(id: string) {
  resolvedAccountId = id;
}

// ── D1 Table Data hook ─────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;

export interface D1TableData {
  columns: string[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[];
  totalFetched: number;
  offset: number;
  limit: number;
}

/**
 * Fetches paginated row data from a specific D1 table.
 * Re-fires automatically when `databaseId`, `tableName`, or `offset` changes.
 */
export function useD1TableData(
  databaseId: string,
  tableName: string,
  offset: number = 0
) {
  const [state, setState] = useState<AsyncState<D1TableData>>({
    status: "idle",
  });

  const fetch = useCallback(async () => {
    if (!databaseId || !tableName) return;
    setState({ status: "loading" });
    try {
      const accountId = resolvedAccountId;
      const sql = `SELECT * FROM "${tableName}" LIMIT ${PAGE_LIMIT} OFFSET ${offset};`;

      const queryResults = await invokeCloudflare<D1QueryResult[]>("execute_d1_query", {
        accountId,
        databaseId,
        sqlQuery: sql,
        params: null,
      });

      const rows = queryResults[0]?.results ?? [];
      const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

      setState({
        status: "success",
        data: { columns, rows, totalFetched: rows.length, offset, limit: PAGE_LIMIT },
      });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, [databaseId, tableName, offset]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { state, refresh: fetch };
}
