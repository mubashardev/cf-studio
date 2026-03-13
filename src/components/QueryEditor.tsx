// QueryEditor.tsx
//
// Live SQL editor tab for a D1 database.
// Runs arbitrary SQL via the `execute_d1_query` Tauri command and renders
// results as a dynamic table, mutation summary, or error alert.

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import {
  Play, Loader2, AlertCircle, CheckCircle2,
  RotateCcw, Sparkles, ChevronLeft, ChevronRight,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { type D1QueryResult } from "@/hooks/useCloudflare";

// ── Types ─────────────────────────────────────────────────────────────────────

type QueryStatus =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "select"; columns: string[]; rows: Record<string, unknown>[]; duration?: number; rowsRead?: number }
  | { kind: "mutation"; changes: number; lastRowId?: number; duration?: number }
  | { kind: "ddl"; duration?: number }
  | { kind: "error"; message: string };

// ── Starter templates ─────────────────────────────────────────────────────────

const TEMPLATES = [
  { label: "SELECT *",   sql: "SELECT * FROM your_table LIMIT 50;" },
  { label: "COUNT",      sql: 'SELECT COUNT(*) AS total FROM your_table;' },
  { label: "INSERT",     sql: 'INSERT INTO your_table (col1, col2) VALUES (\'value1\', \'value2\');' },
  { label: "PRAGMA",     sql: "PRAGMA table_list;" },
];

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1">
        <div className="overflow-x-auto min-w-full">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-10 text-center text-[10px] text-muted-foreground/40 font-mono py-2 px-2">#</TableHead>
                {columns.map((col) => (
                  <TableHead key={col} className="text-xs font-medium uppercase tracking-wider text-muted-foreground py-2 whitespace-nowrap">
                    {col}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.map((row, ri) => (
                <TableRow key={ri} className="hover:bg-accent/30 font-mono text-xs transition-colors">
                  <TableCell className="text-center text-muted-foreground/30 py-2 px-2 select-none tabular-nums">
                    {offset + ri + 1}
                  </TableCell>
                  {columns.map((col) => {
                    const val = row[col];
                    const isNull = val === null || val === undefined;
                    const isNum = typeof val === "number";
                    return (
                      <TableCell
                        key={col}
                        className={cn("py-2 max-w-[240px] truncate",
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
        </div>
      </ScrollArea>

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

// ── Main Component ────────────────────────────────────────────────────────────

interface QueryEditorProps {
  databaseId: string;
}

export function QueryEditor({ databaseId }: QueryEditorProps) {
  const [sql, setSql] = useState("SELECT * FROM sqlite_master WHERE type='table';");
  const [status, setStatus] = useState<QueryStatus>({ kind: "idle" });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const runQuery = useCallback(async () => {
    const query = sql.trim();
    if (!query) return;
    setStatus({ kind: "running" });

    try {
      const results = await invoke<D1QueryResult[]>("execute_d1_query", {
        accountId: "",         // Rust auto-resolves via GET /accounts
        databaseId,
        sqlQuery: query,
        params: null,
      });

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
        // SELECT — has actual row data
        setStatus({
          kind: "select",
          columns: Object.keys(rows[0]),
          rows: rows as Record<string, unknown>[],
          duration,
          rowsRead,
        });
      } else if (changes > 0) {
        // INSERT / UPDATE / DELETE
        setStatus({
          kind: "mutation",
          changes,
          lastRowId: first.meta?.last_row_id ?? undefined,
          duration,
        });
      } else {
        // DDL or empty SELECT
        setStatus({ kind: "ddl", duration });
      }
    } catch (err) {
      setStatus({ kind: "error", message: String(err) });
    }
  }, [sql, databaseId]);

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
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => setSql(t.sql)}
                className="text-[10px] text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 rounded px-1.5 py-0.5 transition-colors font-mono"
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <Button
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => { setSql(""); setStatus({ kind: "idle" }); textareaRef.current?.focus(); }}
            title="Clear"
          >
            <RotateCcw size={11} />
          </Button>

          <Button
            onClick={runQuery}
            disabled={isRunning || !sql.trim()}
            size="sm"
            className="h-7 gap-1.5 text-xs font-medium shrink-0"
          >
            {isRunning
              ? <Loader2 size={12} className="animate-spin" />
              : <Play size={12} strokeWidth={2.5} />}
            {isRunning ? "Running…" : "Run"}
            {!isRunning && (
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
          placeholder="SELECT * FROM your_table LIMIT 50;"
          className={cn(
            "w-full resize-none font-mono text-sm leading-6 p-4 min-h-[120px] max-h-[240px]",
            "bg-muted/10 text-foreground placeholder:text-muted-foreground/30",
            "focus:outline-none focus:bg-muted/20 transition-colors",
            "border-0 ring-0"
          )}
          rows={5}
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
