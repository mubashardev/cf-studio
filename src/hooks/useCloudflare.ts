// useCloudflare.ts
//
// Central React hook for all Cloudflare data. Provides:
//   - Authentication state (credentials from Wrangler session)
//   - D1 database list with loading + error states
//   - A `refresh` function to re-fetch on demand

import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";

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

// ── D1 hook ────────────────────────────────────────────────────────────────────

export function useD1Databases() {
  const [state, setState] = useState<AsyncState<D1Database[]>>({
    status: "idle",
  });

  const fetch = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const databases = await invoke<D1Database[]>("fetch_d1_databases");
      setState({ status: "success", data: databases });
    } catch (err) {
      setState({ status: "error", message: String(err) });
    }
  }, []);

  useEffect(() => {
    fetch();
  }, [fetch]);

  return { state, refresh: fetch };
}
