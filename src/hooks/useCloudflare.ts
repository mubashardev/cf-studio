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
  selectR2Buckets,
  selectR2LastFetched,
  selectSetR2Buckets,
  CACHE_TTL_MS,
} from "@/store/useAppStore";
import { type R2Bucket, fetchR2Buckets } from "@/lib/r2";

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

export interface CloudflareAccount {
  id: string;
  name: string;
}

export interface D1TableSummary {
  name: string;
  ncol: number;
}

export interface D1Database {
  uuid: string;
  name: string;
  created_at?: string;
  version?: string;
  num_tables?: number;
  file_size?: number;
  tables?: D1TableSummary[];
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
  columnsCount?: number;
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

// ── Accounts hook ──────────────────────────────────────────────────────────────

export function useCloudflareAccounts() {
  const accounts = useAppStore((s) => s.accounts);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const setAccounts = useAppStore((s) => s.setAccounts);
  const setActiveAccount = useAppStore((s) => s.setActiveAccount);

  useEffect(() => {
    if (accounts.length > 0) {
      if (!activeAccount) {
        setActiveAccount(accounts[0]);
      }
      return;
    }

    invokeCloudflare<CloudflareAccount[]>("fetch_cloudflare_accounts")
      .then((list) => {
        setAccounts(list);
        setActiveAccount(list[0] ?? null);
      })
      .catch(console.error);
  }, [accounts.length, activeAccount, setAccounts, setActiveAccount]);
}

// ── D1 Databases hook ──────────────────────────────────────────────────────────

export function useD1Databases() {
  const cached     = useAppStore(selectDatabases) || [];
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

// ── R2 Buckets hook ────────────────────────────────────────────────────────────

export function useR2Buckets() {
  const cached = useAppStore(selectR2Buckets) || [];
  const lastFetched = useAppStore(selectR2LastFetched);
  const setBuckets = useAppStore(selectSetR2Buckets);

  // Seed local state from cache immediately
  const [state, setState] = useState<AsyncState<R2Bucket[]>>(() =>
    cached.length > 0 && !isCacheStale(lastFetched)
      ? { status: "success", data: cached }
      : { status: "idle" }
  );

  const [isFromCache, setIsFromCache] = useState(
    cached.length > 0 && !isCacheStale(lastFetched)
  );

  const fetchFromApi = useCallback(async () => {
    setState({ status: "loading" });
    setIsFromCache(false);
    try {
      // fetchR2Buckets is in r2.ts and uses invokeCloudflare under the hood
      const buckets = await fetchR2Buckets();
      setBuckets(buckets);
      setState({ status: "success", data: buckets });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, [setBuckets]);

  useEffect(() => {
    if (cached.length > 0 && !isCacheStale(lastFetched)) return;
    fetchFromApi();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

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
  const cacheKey = `schema_${databaseId}`;
  const [state, setState] = useState<AsyncState<D1TableSchema[]>>(() => {
    const cached = useAppStore.getState().queryCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { status: "success", data: cached.data };
    }
    return { status: "idle" };
  });

  const fetch = useCallback(async (force = false) => {
    if (!databaseId) return;

    if (!force) {
      const cached = useAppStore.getState().queryCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setState({ status: "success", data: cached.data });
        return;
      }
    }

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

      // Look up column counts from the cached database list
      const allDb = useAppStore.getState().databases;
      const currentDb = allDb.find(d => d.uuid === databaseId);
      const tableSummaries = currentDb?.tables ?? [];

      const rows = queryResults[0]?.results ?? [];
      const tables: D1TableSchema[] = rows.map((r) => {
        const name = String(r["name"] ?? "");
        const summary = tableSummaries.find(s => s.name === name);
        return {
          name,
          sql: r["sql"] != null ? String(r["sql"]) : null,
          columnsCount: summary?.ncol,
        };
      });

      useAppStore.getState().setQueryCacheItem(cacheKey, tables);
      setState({ status: "success", data: tables });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, [databaseId, cacheKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { state, refresh: () => fetch(true) };
}

// Module-level store for the resolved account ID — set by useD1Databases
// so useD1Schema can access it without an extra API call.
let resolvedAccountId = "";

export function setResolvedAccountId(id: string) {
  resolvedAccountId = id;
}

// ── D1 Table Data hook ─────────────────────────────────────────────────────────

const PAGE_LIMIT = 100;

export interface D1ForeignKey {
  table: string;
  column: string;
  updateAction: string;
  deleteAction: string;
}

export interface D1Column {
  name: string;
  type: string;
  isPrimary?: boolean;
  isNullable?: boolean;
  defaultValue?: string | null;
  foreignKeys?: D1ForeignKey[];
}

export interface D1TableData {
  columns: D1Column[];
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
  offset: number = 0,
  sortCol?: string,
  sortAsc?: boolean
) {
  const cacheKey = `data_${databaseId}_${tableName}_${offset}_${sortCol}_${sortAsc}`;
  const [state, setState] = useState<AsyncState<D1TableData>>(() => {
    const cached = useAppStore.getState().queryCache[cacheKey];
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { status: "success", data: cached.data };
    }
    return { status: "idle" };
  });

  const fetch = useCallback(async (force = false) => {
    if (!databaseId || !tableName) return;

    if (!force) {
      const cached = useAppStore.getState().queryCache[cacheKey];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        setState({ status: "success", data: cached.data });
        return;
      }
    }

    setState({ status: "loading" });
    try {
      const accountId = resolvedAccountId;
      let orderClause = "";
      if (sortCol) {
        orderClause = ` ORDER BY "${sortCol}" ${sortAsc ? 'ASC' : 'DESC'}`;
      }
      const sql = `PRAGMA table_info("${tableName}"); PRAGMA foreign_key_list("${tableName}"); SELECT * FROM "${tableName}"${orderClause} LIMIT ${PAGE_LIMIT} OFFSET ${offset};`;

      const queryResults = await invokeCloudflare<D1QueryResult[]>("execute_d1_query", {
        accountId,
        databaseId,
        sqlQuery: sql,
        params: null,
      });

      const pragmaRows = queryResults[0]?.success ? queryResults[0].results : [];
      const fkRows = queryResults[1]?.success ? queryResults[1].results : [];
      const dataRows = queryResults.length > 2 ? queryResults[2].results : (queryResults[0]?.results ?? []);

      const fksByColumn = fkRows.reduce((acc, row) => {
        const colName = String(row.from);
        if (!acc[colName]) acc[colName] = [];
        acc[colName].push({
          table: String(row.table),
          column: String(row.to),
          updateAction: String(row.on_update),
          deleteAction: String(row.on_delete),
        });
        return acc;
      }, {} as Record<string, D1ForeignKey[]>);

      const columns: D1Column[] = pragmaRows.map(r => ({
        name: String(r.name),
        type: String(r.type || "unknown").toLowerCase(),
        isPrimary: r.pk === 1,
        isNullable: r.notnull === 0,
        defaultValue: r.dflt_value != null ? String(r.dflt_value) : null,
        foreignKeys: fksByColumn[String(r.name)] || []
      }));

      // Fallback if PRAGMA fails
      if (columns.length === 0 && dataRows.length > 0) {
        Object.keys(dataRows[0]).forEach(k => columns.push({ name: k, type: "unknown" }));
      }

      const resultData = { columns, rows: dataRows, totalFetched: dataRows.length, offset, limit: PAGE_LIMIT };
      useAppStore.getState().setQueryCacheItem(cacheKey, resultData);
      
      setState({
        status: "success",
        data: resultData,
      });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, [databaseId, tableName, offset, sortCol, sortAsc, cacheKey]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { state, refresh: () => fetch(true) };
}
