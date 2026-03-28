// QueryEditor.tsx
//
// Live SQL editor tab for a D1 database.
// Runs arbitrary SQL via the `execute_d1_query` Tauri command and renders
// results as a dynamic table, mutation summary, or error alert.

import { useState, useRef, useCallback, useMemo, useEffect, type KeyboardEvent } from "react";
import {
  Play, Loader2, AlertCircle, CheckCircle2,
  RotateCcw, Sparkles, ChevronLeft, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type D1QueryResult, type D1TableSchema } from "@/hooks/useCloudflare";
import { useAppStore } from "@/store/useAppStore";
import { useQueryExecutor } from "@/hooks/useQueryExecutor";
import { IntelligencePanel } from "@/components/IntelligencePanel";

// ── Types ─────────────────────────────────────────────────────────────────────

type QueryStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "select"; columns: string[]; rows: Record<string, unknown>[]; duration?: number; rowsRead?: number }
  | { kind: "mutation"; changes: number; lastRowId?: number; duration?: number }
  | { kind: "ddl"; duration?: number }
  | { kind: "error"; message: string };

function getColumnsFromSql(sql: string | null): [string, string] {
  if (!sql) return ["col1", "col2"];
  // SQLite CREATE TABLE schema usually contains body inside parenthesis
  const bodyMatch = sql.match(/\(([\s\S]+)\)/);
  if (!bodyMatch) return ["col1", "col2"];
  
  // split lines by comma, but naive to nested commas (good enough for 2 column names)
  const lines = bodyMatch[1].split(",").map(s => s.trim()).filter(s => s.length > 0);
  
  const cols: string[] = [];
  for (const line of lines) {
    // skip common table constraints
    if (line.toUpperCase().startsWith("PRIMARY KEY") || line.toUpperCase().startsWith("FOREIGN KEY") || line.toUpperCase().startsWith("UNIQUE")) {
      continue;
    }
    const nameMatch = line.match(/^[`"']?(\w+)[`"']?/);
    if (nameMatch && nameMatch[1]) {
      cols.push(nameMatch[1]);
    }
    if (cols.length >= 2) break;
  }
  return [cols[0] || "col1", cols[1] || cols[0] || "col2"];
}

const PRAGMA_TOOLTIPS: Record<string, string> = {
  ncol: "Number of columns in the table",
  wr: "WITHOUT ROWID (1 if true, 0 if false)",
  strict: "STRICT table (1 if true, 0 if false)",
  cid: "Column ID",
  notnull: "NOT NULL constraint (1 if true, 0 if false)",
  dflt_value: "Default value",
  pk: "Primary Key (1 if true, 0 if false)",
  schema: "The database schema (usually 'main')",
  type: "Object type (e.g. table, view, index)",
};

// ── Result data table (shared display component) ───────────────────────────────

const PAGE = 50;

function ResultTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Record<string, unknown>[];
}) {
  const [offset, setOffset] = useState(0);

  const page = rows.slice(offset, offset + PAGE);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE < rows.length;

  const tableDensity = useAppStore(s => s.tableDensity);
  const paddingY = tableDensity === "compact" ? "py-1" : "py-2";

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-auto">
        <div className="min-w-max">
        <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className={`w-10 text-center text-[10px] text-muted-foreground/40 font-mono px-2 ${paddingY}`}>#</TableHead>
                {columns.map((col) => {
                  const tooltipText = PRAGMA_TOOLTIPS[col.toLowerCase()];
                  return (
                    <TableHead key={col} className={`text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap ${paddingY}`}>
                      {tooltipText ? (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-help border-b border-dotted border-muted-foreground/60 transition-colors hover:text-foreground">
                                {col}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs font-sans normal-case tracking-normal">
                              {tooltipText}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : (
                        col
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.map((row, ri) => (
                <TableRow key={ri} className="hover:bg-accent/30 font-mono text-xs transition-colors">
                  <TableCell className={`text-center text-muted-foreground/30 px-2 select-none tabular-nums ${paddingY}`}>
                    {offset + ri + 1}
                  </TableCell>
                  {columns.map((col) => {
                    const val = row[col];
                    const isNull = val === null || val === undefined;
                    const isNum = typeof val === "number";
                    return (
                      <TableCell
                        key={col}
                        className={cn(`max-w-[240px] truncate ${paddingY}`,
                          isNull && "text-muted-foreground/30 italic",
                          isNum && "text-sky-400 tabular-nums",
                          !isNull && !isNum && "text-foreground"
                        )}
                        title={isNull ? "NULL" : String(val)}
                      >
                        {isNull ? "NULL" : String(val)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>{/* min-w-max */}
        </div>

      {/* Pagination */}
      <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-1.5 shrink-0">
        <span className="text-xs text-muted-foreground/50 tabular-nums">
          {rows.length} row{rows.length !== 1 ? "s" : ""} · showing {offset + 1}–{Math.min(offset + PAGE, rows.length)}
        </span>
        {(hasPrev || hasNext) && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-6 w-6" disabled={!hasPrev} onClick={() => setOffset(Math.max(0, offset - PAGE))} aria-label="Prev">
              <ChevronLeft size={11} />
            </Button>
            <Button variant="outline" size="icon" className="h-6 w-6" disabled={!hasNext} onClick={() => setOffset(offset + PAGE)} aria-label="Next">
              <ChevronRight size={11} />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const templates = [
  { label: "Select All", sql: "SELECT * FROM your_table LIMIT 50;" },
  { label: "List Tables", sql: "SELECT name FROM sqlite_master WHERE type='table';" },
  { label: "Table Schema", sql: "PRAGMA table_info(your_table);" },
];

// ── Main Component ────────────────────────────────────────────────────────────

interface QueryEditorProps {
  databaseId: string;
  tables?: D1TableSchema[];
}

export function QueryEditor({ databaseId, tables }: QueryEditorProps) {
  const dynamicTemplateData = useMemo(() => {
    if (!tables || tables.length === 0) return { table: "your_table", col1: "col1", col2: "col2" };
    // Prefer user tables over system tables
    const userTables = tables.filter(t => !t.name.startsWith("_cf_") && !t.name.startsWith("sqlite_"));
    const list = userTables.length > 0 ? userTables : tables;
    const randomTable = list[Math.floor(Math.random() * list.length)];
    const [c1, c2] = getColumnsFromSql(randomTable.sql);
    return { table: randomTable.name, col1: c1, col2: c2 };
  }, [tables]);

  const [sql, setSql] = useState(`SELECT * FROM ${dynamicTemplateData.table} LIMIT 50;`);
  const [status, setStatus] = useState<QueryStatus>({ kind: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeAccount = useAppStore(state => state.activeAccount);
  const executor = useQueryExecutor(databaseId);

  const handleQueryResults = useCallback((results: D1QueryResult[]) => {
    const first = results[0];
    if (!first) {
      setStatus({ kind: "ddl" });
      return;
    }

    const rows = first.results ?? [];
    const changes = first.meta?.changes ?? 0;
    const duration = first.meta?.duration;
    const rowsRead = first.meta?.rows_read;

    if (rows.length > 0) {
      setStatus({
        kind: "select",
        columns: Object.keys(rows[0]),
        rows: rows as Record<string, unknown>[],
        duration,
        rowsRead,
      });
    } else if (changes > 0) {
      setStatus({
        kind: "mutation",
        changes,
        lastRowId: first.meta?.last_row_id ?? undefined,
        duration,
      });
    } else {
      setStatus({ kind: "ddl", duration });
    }
  }, [sql, databaseId, activeAccount?.id]);

  const runQuery = useCallback(async () => {
    const query = sql.trim();
    if (!query) return;
    setStatus({ kind: "running" });

    try {
      const results = await executor.execute(sql);
      if (!results) {
        // Confirmation was required, reset status to idle so button is clickable again
        setStatus({ kind: "idle" });
        return;
      }
      handleQueryResults(results);
      if (!executor.showSafeModeModal) {
        // If results IS null and modal is NOT shown, it means it's idle or still analyzing
        // which we handle via hook state if we want to show "Analyzing...", 
        // but for now we just don't set status back to idle yet.
      }
    } catch (err) {
      setStatus({ kind: "error", message: String(err) });
    }
  }, [sql, executor, handleQueryResults, databaseId]);

  const handleConfirmDestructiveQuery = async () => {
    setStatus({ kind: "running" });
    try {
      const results = await executor.confirmExecution();
      if (results) {
        handleQueryResults(results);
      }
    } catch (err) {
      setStatus({ kind: "error", message: String(err) });
    }
  };

  // Real-time Validation (Debounced)
  useEffect(() => {
    const trimmedSql = sql.trim();
    
    // Reset confirmation state if user changes the query significantly
    if (executor.requiresConfirmation && !executor.checkMutation(trimmedSql) && !executor.checkBlindSelect(trimmedSql)) {
      executor.cancelConfirmation();
    }

    const timer = setTimeout(() => {
      if (!trimmedSql) {
        executor.setValidationError(null);
        return;
      }
      
      const tableName = executor.getTableNameFromSql(trimmedSql);
      if (tableName && tables && tables.length > 0) {
        const exists = tables.some(t => t.name.toLowerCase() === tableName.toLowerCase());
        if (!exists) {
          executor.setValidationError(`Table "${tableName}" not found in database.`);
        } else {
          executor.setValidationError(null);
        }
      } else {
        executor.setValidationError(null);
      }
    }, 150); // Faster debounce for instant feel

    return () => clearTimeout(timer);
  }, [sql, tables, executor.checkMutation, executor.getTableNameFromSql, executor.setValidationError, executor.requiresConfirmation, executor.cancelConfirmation]);

  // Cmd/Ctrl + Enter submits
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  };

  const isRunning = status.kind === "running";

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Editor area ── */}
      <div className="flex flex-col shrink-0 border-b border-border">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
          {/* Template buttons */}
          <div className="flex items-center gap-1 flex-1 min-w-0 flex-wrap">
            <Sparkles size={11} strokeWidth={1.75} className="text-muted-foreground/40 shrink-0" />
            {templates.map((t: { label: string; sql: string }) => (
              <button
                key={t.label}
                onClick={() => setSql(t.sql)}
                className="text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded px-1.5 py-0.5 transition-colors font-mono"
              >
                {t.label}
              </button>
            ))}
          </div>


          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => { setSql(""); setStatus({ kind: "idle" }); textareaRef.current?.focus(); }}
            title="Clear"
          >
            <RotateCcw size={11} />
          </Button>

          <Button
            onClick={executor.requiresConfirmation ? handleConfirmDestructiveQuery : runQuery}
            onDoubleClick={executor.requiresConfirmation ? handleConfirmDestructiveQuery : runQuery}
            disabled={isRunning || executor.isAnalyzing || !sql.trim()}
            size="sm"
            className={cn(
              "h-7 gap-1.5 text-xs font-bold shrink-0 transition-all duration-300",
              executor.requiresConfirmation 
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse" 
                : ""
            )}
          >
            {isRunning || executor.isAnalyzing
              ? <Loader2 size={12} className="animate-spin" />
              : executor.requiresConfirmation 
                ? <AlertCircle size={12} strokeWidth={3} />
                : <Play size={12} strokeWidth={2.5} />}
            {executor.isAnalyzing 
              ? "Analyzing…" 
              : isRunning 
                ? "Running…" 
                : executor.requiresConfirmation 
                  ? "CONFIRM EXECUTION" 
                  : "Run"}
            {!isRunning && !executor.isAnalyzing && !executor.requiresConfirmation && (
              <kbd className="hidden sm:inline text-[9px] bg-primary-foreground/20 px-1 py-px rounded font-sans leading-none">
                ⌘↵
              </kbd>
            )}
          </Button>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          placeholder={`SELECT * FROM ${dynamicTemplateData.table} LIMIT 50;`}
          className={cn(
            "w-full resize-none font-mono text-sm leading-6 p-4 min-h-[120px] max-h-[240px]",
            "bg-muted/10 text-foreground placeholder:text-muted-foreground/30",
            "focus:outline-none focus:bg-muted/20 transition-colors",
            "border-0 ring-0"
          )}
          rows={5}
        />

        {/* Intelligence Panel */}
        <IntelligencePanel 
          analysis={executor.analysis}
          requiresConfirmation={executor.requiresConfirmation}
          isMutationPreview={executor.checkMutation(sql) && !executor.requiresConfirmation}
          isBlindSelectPreview={executor.checkBlindSelect(sql) && !executor.requiresConfirmation}
          previewTableName={executor.getTableNameFromSql(sql)}
          validationError={executor.validationError}
          onCancelConfirmation={executor.cancelConfirmation}
          onApplyFix={(fixSql) => {
            setSql(prev => {
              const trimmed = prev.trim();
              if (!trimmed) return fixSql;
              const suffix = trimmed.endsWith(";") ? "" : ";";
              return `${trimmed}${suffix}\n\n${fixSql}`;
            });
          }}
        />
      </div>

      {/* ── Results area ── */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Idle */}
        {status.kind === "idle" && (
          <div className="flex items-center justify-center h-full text-center px-6 gap-2 text-muted-foreground/30">
            <Play size={14} strokeWidth={1.5} />
            <span className="text-xs">Run a query to see results</span>
          </div>
        )}

        {/* Running */}
        {status.kind === "running" && (
          <div className="flex items-center justify-center h-full gap-2 text-muted-foreground/50">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-xs">Executing…</span>
          </div>
        )}

        {/* Error */}
        {status.kind === "error" && (
          <div className="p-4">
            <Alert variant="destructive" className="border-destructive/40 bg-destructive/5">
              <AlertCircle size={14} />
              <AlertDescription className="font-mono text-xs break-all select-text">
                {status.message}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* DDL / empty result */}
        {status.kind === "ddl" && (
          <div className="p-4">
            <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
              <CheckCircle2 size={14} />
              <AlertDescription className="text-xs flex items-center gap-3">
                <span>Query executed successfully</span>
                {status.duration != null && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {status.duration.toFixed(2)} ms
                  </Badge>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Mutation result */}
        {status.kind === "mutation" && (
          <div className="p-4">
            <Alert className="border-emerald-500/30 bg-emerald-500/5 text-emerald-400">
              <CheckCircle2 size={14} />
              <AlertDescription className="text-xs flex flex-wrap items-center gap-3">
                <span>
                  {status.changes} row{status.changes !== 1 ? "s" : ""} affected
                </span>
                {status.lastRowId != null && (
                  <span className="text-emerald-400/60">
                    Last row ID: <span className="font-mono">{status.lastRowId}</span>
                  </span>
                )}
                {status.duration != null && (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {status.duration.toFixed(2)} ms
                  </Badge>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* SELECT results */}
        {status.kind === "select" && (
          <div className="flex flex-col h-full min-h-0">
            {/* Results header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-muted/20 shrink-0">
              <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
              <span className="text-xs text-muted-foreground">
                <span className="text-foreground font-medium tabular-nums">{status.rows.length}</span> row{status.rows.length !== 1 ? "s" : ""} returned
              </span>

              {status.duration != null && (
                <Badge variant="secondary" className="font-mono text-[10px] ml-auto">
                  {status.duration.toFixed(2)} ms
                </Badge>
              )}
              {status.rowsRead != null && (
                <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                  {status.rowsRead} rows scanned
                </span>
              )}
            </div>
            <div className="flex-1 min-h-0">
              <ResultTable columns={status.columns} rows={status.rows} />
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
