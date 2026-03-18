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
import type { D1Database } from "@/hooks/useCloudflare";

export interface UserProfile {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
}

// ── KV placeholder type (populated in a future step) ─────────────────────────

export interface KVNamespace {
  id: string;
  title: string;
  supports_url_encoding?: boolean;
}

// ── Cache TTL ─────────────────────────────────────────────────────────────────

/** How long cached data is considered fresh (ms). Default: 5 minutes. */
export const CACHE_TTL_MS = 5 * 60 * 1_000;

export function isCacheStale(lastFetched: number | null): boolean {
  if (lastFetched === null) return true;
  return Date.now() - lastFetched > CACHE_TTL_MS;
}

// ── Store shape ───────────────────────────────────────────────────────────────

interface AppState {
  // ── Cached data ──
  userProfile: UserProfile | null;
  cloudflareAccountId: string | null;
  databases: D1Database[];
  kvNamespaces: KVNamespace[];

  // ── Preferences ──
  tableDensity: "compact" | "comfortable";
  isRefreshingSession: boolean;

  /** Unix timestamp (ms) of the last successful databases fetch, or null. */
  lastFetched: number | null;

  /** Unix timestamp (ms) of the last successful KV fetch, or null. */
  kvLastFetched: number | null;

  // ── Actions ──
  setUserProfile: (profile: UserProfile | null) => void;
  setCloudflareAccountId: (id: string | null) => void;
  setTableDensity: (density: "compact" | "comfortable") => void;
  setIsRefreshingSession: (isRefreshing: boolean) => void;

  /** Overwrite the databases list and stamp the fetch time. */
  setDatabases: (databases: D1Database[]) => void;

  /** Overwrite the KV namespaces list and stamp the fetch time. */
  setKvNamespaces: (namespaces: KVNamespace[]) => void;

  /**
   * Wipe all cached data and timestamps.
   * Call this when the user switches Cloudflare accounts or logs out.
   */
  clearCache: () => void;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Initial state ──
      userProfile: null,
      cloudflareAccountId: null,
      databases: [],
      kvNamespaces: [],
      tableDensity: "comfortable",
      isRefreshingSession: false,
      lastFetched: null,
      kvLastFetched: null,

      // ── Actions ──
      setUserProfile: (profile) => set({ userProfile: profile }),
      setCloudflareAccountId: (id) => set({ cloudflareAccountId: id }),
      setTableDensity: (density) => set({ tableDensity: density }),
      setIsRefreshingSession: (b) => set({ isRefreshingSession: b }),
      setDatabases: (databases) =>
        set({ databases, lastFetched: Date.now() }),

      setKvNamespaces: (namespaces) =>
        set({ kvNamespaces: namespaces, kvLastFetched: Date.now() }),

      clearCache: () =>
        set({
          userProfile: null,
          cloudflareAccountId: null,
          databases: [],
          kvNamespaces: [],
          lastFetched: null,
          kvLastFetched: null,
        }),
    }),
    {
      name: "cf-studio-cache",          // localStorage key
      storage: createJSONStorage(() => localStorage),
      // Only persist the data fields — actions are not serialisable.
      partialize: (state) => ({
        userProfile: state.userProfile,
        cloudflareAccountId: state.cloudflareAccountId,
        tableDensity: state.tableDensity,
        databases: state.databases,
        kvNamespaces: state.kvNamespaces,
        lastFetched: state.lastFetched,
        kvLastFetched: state.kvLastFetched,
      }),
    }
  )
);

// ── Convenience selectors (stable references, no re-render on unrelated changes) ──

export const selectDatabases   = (s: AppState) => s.databases;
export const selectLastFetched = (s: AppState) => s.lastFetched;
export const selectSetDatabases = (s: AppState) => s.setDatabases;
export const selectClearCache  = (s: AppState) => s.clearCache;
