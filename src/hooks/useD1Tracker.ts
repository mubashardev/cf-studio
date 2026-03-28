import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import { type D1QueryResult } from "@/hooks/useCloudflare";

export type ExecutionSource = "UI_ACTION" | "RAW_QUERY";

export interface TrackedQueryOptions {
  query: string;
  databaseId: string;
  accountId: string;
  tableName?: string | null;
  source: ExecutionSource;
}

/**
 * Unified wrapper hook for all D1 API interactions.
 * Centralizes logging to the local SQLite database.
 */
export function useD1Tracker() {
  const sessionId = useAppStore((state) => state.sessionId);

  const executeTrackedQuery = useCallback(
    async (
      options: TrackedQueryOptions,
      executeNetworkCall: () => Promise<D1QueryResult[]>
    ): Promise<D1QueryResult[]> => {
      try {
        // 1. Execute the actual Cloudflare D1 API request
        const results = await executeNetworkCall();

        // 2. Extract metrics (Cloudflare API returns these in the meta block)
        const totalRowsRead = results.reduce(
          (sum, r) => sum + (r.meta?.rows_read || 0),
          0
        );

        // 3. Fire and forget tracking log to local SQLite
        invoke("save_query_history", {
          accountId: options.accountId,
          databaseId: options.databaseId,
          sessionId: sessionId,
          executionSource: options.source,
          tableName: options.tableName || null,
          queryText: options.query,
          rowsRead: totalRowsRead,
          // Store the raw JSON results for the history view
          resultData: results[0]?.results 
            ? JSON.stringify(results[0].results) 
            : null,
        }).catch((err) => console.error("[D1Tracker] Failed to save history:", err));

        return results;
      } catch (error) {
        // Log the failed query state to history as well
        invoke("save_query_history", {
          accountId: options.accountId,
          databaseId: options.databaseId,
          sessionId: sessionId,
          executionSource: options.source,
          tableName: options.tableName || null,
          queryText: options.query,
          rowsRead: 0,
          resultData: null,
        }).catch((err) => console.error("[D1Tracker] Failed to save error history:", err));

        throw error;
      }
    },
    [sessionId]
  );

  return { executeTrackedQuery };
}
