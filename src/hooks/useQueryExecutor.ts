import { useState, useCallback } from "react";
import { invokeCloudflare, type D1QueryResult } from "./useCloudflare";
import { useAppStore } from "@/store/useAppStore";
import { useD1Tracker } from "./useD1Tracker";
import { invoke } from "@tauri-apps/api/core";

export interface D1AnalysisResult {
  is_full_scan: boolean;
  cost_tier: "High" | "Medium" | "Low";
  scanned_tables: string[];
  raw_plan: any[];
}

export function useQueryExecutor(databaseId: string) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [analysis, setAnalysis] = useState<D1AnalysisResult | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showSafeModeModal, setShowSafeModeModal] = useState(false);
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [pendingQuery, setPendingQuery] = useState("");
  const activeAccount = useAppStore(state => state.activeAccount);
  const { executeTrackedQuery } = useD1Tracker();

  const checkMutation = useCallback((sql: string) => {
    return /^\s*(UPDATE|DELETE|DROP|ALTER|TRUNCATE|INSERT)\b/i.test(sql);
  }, []);

  const checkBlindSelect = useCallback((sql: string) => {
    const normalized = sql.trim().toUpperCase();
    return normalized.startsWith("SELECT") && !normalized.includes("WHERE") && !normalized.includes("LIMIT");
  }, []);

  const getTableNameFromSql = useCallback((sql: string) => {
    const match = sql.match(/\b(FROM|UPDATE|INTO|TABLE|TRUNCATE)\s+["`']?(\w+)["`']?/i);
    return match ? match[2] : null;
  }, []);

  const executeActual = useCallback(async (sql: string) => {
    if (!activeAccount?.id) return null;
    setIsExecuting(true);
    try {
      const results = await executeTrackedQuery(
        {
          accountId: activeAccount.id,
          databaseId,
          query: sql,
          source: "RAW_QUERY",
          tableName: getTableNameFromSql(sql),
        },
        () =>
          invokeCloudflare<D1QueryResult[]>("execute_d1_query", {
            accountId: activeAccount.id,
            databaseId,
            sqlQuery: sql,
            params: null,
          })
      );
      return results;
    } finally {
      setIsExecuting(false);
      setShowSafeModeModal(false);
      setPendingQuery("");
    }
  }, [databaseId, activeAccount?.id, executeTrackedQuery, getTableNameFromSql]);

  const execute = useCallback(async (sql: string) => {
    setAnalysis(null);
    const isMutation = checkMutation(sql);

    if (isMutation && !requiresConfirmation) {
      setPendingQuery(sql);
      setRequiresConfirmation(true);
      return null;
    }

    const isSelect = /^\s*SELECT\b/i.test(sql);
    if (isSelect) {
      setIsAnalyzing(true);
      try {
        // Automatic analysis before execution for SELECT queries
        const analysisResult = await invoke<D1AnalysisResult>("analyze_d1_query", {
          accountId: "", // This should ideally be passed from a context or config
          databaseId,
          sqlQuery: sql,
        });
        setAnalysis(analysisResult);
      } catch (err) {
        console.warn("SQL Analysis failed:", err);
        setAnalysis(null);
      } finally {
        setIsAnalyzing(false);
      }
    } else {
      setAnalysis(null);
    }

    return await executeActual(sql);
  }, [databaseId, executeActual, checkMutation, requiresConfirmation]);

  const confirmExecution = useCallback(async () => {
    if (!pendingQuery) return null;
    const result = await executeActual(pendingQuery);
    setRequiresConfirmation(false);
    return result;
  }, [pendingQuery, executeActual]);

  const cancelConfirmation = useCallback(() => {
    setRequiresConfirmation(false);
    setPendingQuery("");
  }, []);

  return {
    execute,
    confirmExecution,
    analysis,
    isAnalyzing,
    isExecuting,
    showSafeModeModal,
    setShowSafeModeModal,
    requiresConfirmation,
    setRequiresConfirmation,
    cancelConfirmation,
    pendingQuery,
    validationError,
    setValidationError,
    checkMutation,
    checkBlindSelect,
    getTableNameFromSql,
  };
}
