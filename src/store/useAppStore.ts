// useAppStore.ts
//
// Global Zustand store with localStorage persistence.
// Caches D1 databases (and KV namespaces when implemented) so the UI
// renders immediately on startup without waiting for an API round-trip.
//
// Cache TTL: 5 minutes. After expiry the next mount re-fetches in the
// background and silently updates the cache.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { D1Database, CloudflareAccount } from "@/hooks/useCloudflare";
import type { R2Bucket } from "@/lib/r2";

export interface UserProfile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

export interface PrivacySettings {
  enabled: boolean;
  accountInfo: boolean;
  databaseNames: boolean;
  databaseIds: boolean;
  tableNames: boolean;
  r2BucketNames: boolean;
  r2FileNames: boolean;
}

// ── KV placeholder type (populated in a future step) ─────────────────────────

export interface KVNamespace {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
}

// ── Cache TTL ─────────────────────────────────────────────────────────────────

/** How long cached data is considered fresh (ms). Default: 10 minutes. */
export const CACHE_TTL_MS = 10 * 60 * 1_000;

export function isCacheStale(lastFetched: number | null): boolean {
  if (lastFetched === null) return true;
  return Date.now() - lastFetched > CACHE_TTL_MS;
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface AppState {
  // ── Cached data ──
  userProfile: UserProfile | null;
  cloudflareAccountId: string | null;
  accounts: CloudflareAccount[];
  activeAccount: CloudflareAccount | null;
  databases: D1Database[];
  kvNamespaces: KVNamespace[];
  r2Buckets: R2Bucket[];

  // ── Preferences ──
  tableDensity: "compact" | "comfortable";
  showTableColumnCounts: boolean;
  autoUpdate: boolean;
  isRefreshingSession: boolean;
  privacySettings: PrivacySettings;

  // ── Updater State ──
  updateStatus: "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error";
  updateData: any | null;
  downloadProgress: number;
  updateError: string | null;

  /** Unix timestamp (ms) of the last successful databases fetch, or null. */
  lastFetched: number | null;

  /** Unix timestamp (ms) of the last successful KV fetch, or null. */
  kvLastFetched: number | null;

  /** Unix timestamp (ms) of the last successful R2 buckets fetch, or null. */
  r2LastFetched: number | null;

  // ── Session Cache (Volatile, not persisted) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queryCache: Record<string, { data: any; timestamp: number }>;
  sessionId: string;

  // ── Actions ──
  setUserProfile: (profile: UserProfile | null) => void;
  setCloudflareAccountId: (id: string | null) => void;
  setAccounts: (accounts: CloudflareAccount[]) => void;
  setActiveAccount: (account: CloudflareAccount | null) => void;
  setTableDensity: (density: "compact" | "comfortable") => void;
  setIsRefreshingSession: (isRefreshing: boolean) => void;
  setShowTableColumnCounts: (show: boolean) => void;
  setAutoUpdate: (enabled: boolean) => void;
  setPrivacySettings: (settings: Partial<PrivacySettings>) => void;
  setSessionId: (id: string) => void;
  refreshSession: () => void;
  
  setUpdateStatus: (status: "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error") => void;
  setUpdateData: (data: any | null) => void;
  setDownloadProgress: (progress: number) => void;
  setUpdateError: (error: string | null) => void;

  /** Overwrite the databases list and stamp the fetch time. */
  setDatabases: (databases: D1Database[]) => void;

  /** Overwrite the KV namespaces list and stamp the fetch time. */
  setKvNamespaces: (namespaces: KVNamespace[]) => void;

  /** Overwrite the R2 buckets list and stamp the fetch time. */
  setR2Buckets: (buckets: R2Bucket[]) => void;

  /**
   * Wipe all cached data and timestamps.
   * Call this when the user switches Cloudflare accounts or logs out.
   */
  clearCache: () => void;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setQueryCacheItem: (key: string, data: any) => void;
  clearQueryCache: (prefix?: string) => void;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Initial state ──
      userProfile: null,
      cloudflareAccountId: null,
      accounts: [],
      activeAccount: null,
      databases: [],
      kvNamespaces: [],
      r2Buckets: [],
      tableDensity: "comfortable",
      showTableColumnCounts: true,
      autoUpdate: true,
      isRefreshingSession: false,
      privacySettings: {
        enabled: false,
        accountInfo: true,
        databaseNames: true,
        databaseIds: true,
        tableNames: true,
        r2BucketNames: true,
        r2FileNames: true,
      },
      updateStatus: "idle",
      updateData: null,
      downloadProgress: 0,
      updateError: null,
      lastFetched: null,
      kvLastFetched: null,
      r2LastFetched: null,
      queryCache: {},
      sessionId: crypto.randomUUID(),

      // ── Actions ──
      setUserProfile: (profile) => set({ userProfile: profile }),
      setCloudflareAccountId: (id) => set({ cloudflareAccountId: id }),
      setAccounts: (accounts) => set({ accounts }),
      setActiveAccount: (account) => set({ activeAccount: account }),
      setTableDensity: (density) => set({ tableDensity: density }),
      setIsRefreshingSession: (b) => set({ isRefreshingSession: b }),
      setShowTableColumnCounts: (show) => set({ showTableColumnCounts: show }),
      setAutoUpdate: (enabled) => set({ autoUpdate: enabled }),
      setPrivacySettings: (settings) => set((s) => ({ privacySettings: { ...s.privacySettings, ...settings } })),
      setSessionId: (id) => set({ sessionId: id }),
      refreshSession: () => set({ sessionId: crypto.randomUUID() }),
      setUpdateStatus: (status) => set({ updateStatus: status }),
      setUpdateData: (data) => set({ updateData: data }),
      setDownloadProgress: (progress) => set({ downloadProgress: progress }),
      setUpdateError: (error) => set({ updateError: error }),
      setDatabases: (databases) =>
        set({ databases, lastFetched: Date.now() }),

      setKvNamespaces: (namespaces) =>
        set({ kvNamespaces: namespaces, kvLastFetched: Date.now() }),

      setR2Buckets: (buckets) =>
        set({ r2Buckets: buckets, r2LastFetched: Date.now() }),

      clearCache: () =>
        set({
          userProfile: null,
          cloudflareAccountId: null,
          accounts: [],
          activeAccount: null,
          databases: [],
          kvNamespaces: [],
          r2Buckets: [],
          lastFetched: null,
          kvLastFetched: null,
          r2LastFetched: null,
          queryCache: {},
        }),

      setQueryCacheItem: (key, data) =>
        set((state) => ({
          queryCache: {
            ...state.queryCache,
            [key]: { data, timestamp: Date.now() },
          },
        })),

      clearQueryCache: (prefix) =>
        set((state) => {
          if (!prefix) return { queryCache: {} };
          const next = { ...state.queryCache };
          for (const k of Object.keys(next)) {
            if (k.startsWith(prefix)) delete next[k];
          }
          return { queryCache: next };
        }),
    }),
    {
      name: "cf-studio-cache",          // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist the data fields — actions are not serialisable.
      partialize: (state) => ({
        userProfile: state.userProfile,
        cloudflareAccountId: state.cloudflareAccountId,
        accounts: state.accounts,
        activeAccount: state.activeAccount,
        tableDensity: state.tableDensity,
        autoUpdate: state.autoUpdate,
        privacySettings: state.privacySettings,
        databases: state.databases,
        kvNamespaces: state.kvNamespaces,
        r2Buckets: state.r2Buckets,
        lastFetched: state.lastFetched,
        kvLastFetched: state.kvLastFetched,
        r2LastFetched: state.r2LastFetched,
      }),
    }
  )
);

// ── Convenience selectors (stable references, no re-render on unrelated changes) ──

export const selectDatabases   = (s: AppState) => s.databases;
export const selectLastFetched = (s: AppState) => s.lastFetched;
export const selectSetDatabases = (s: AppState) => s.setDatabases;

export const selectR2Buckets   = (s: AppState) => s.r2Buckets;
export const selectR2LastFetched = (s: AppState) => s.r2LastFetched;
export const selectSetR2Buckets = (s: AppState) => s.setR2Buckets;

export const selectClearCache  = (s: AppState) => s.clearCache;
