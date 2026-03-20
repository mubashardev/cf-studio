// DatabaseExplorer.tsx
//
// Schema Visualizer + Data Browser for a selected D1 table.
// Tabs (in order): SQL Editor | Data | Schema | Visual Schema

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Table2, RefreshCw, Database,
  ChevronRight, AlertCircle, BookOpen,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  Sheet, Code2, Terminal, Network,
  ChevronDown, ArrowUp, ArrowDown, Copy, Edit, Trash2, Download, Link2, Key
} from "lucide-react";
import { QueryEditor } from "@/components/QueryEditor";
import { SchemaVisualizer } from "@/components/SchemaVisualizer";
import { useAppStore } from "@/store/useAppStore";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditColumnDialog } from "@/components/EditColumnDialog";
import { ExportWrapper } from "@/components/ExportWrapper";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  useD1Schema,
  useD1TableData,
  type D1Database,
  type D1TableSchema,
  type D1Column,
} from "@/hooks/useCloudflare";


// ── SQL formatter ─────────────────────────────────────────────────────────────

function formatSql(raw: string): string {
  return raw
    .replace(/,\s*/g, ",\n  ")
    .replace(/\(\s*/g, "(\n  ")
    .replace(/\s*\)/g, "\n)")
    .trim();
}

const SQL_KW = new Set([
  "CREATE","TABLE","TEXT","INTEGER","REAL","BLOB","NUMERIC","NULL","NOT",
  "PRIMARY","KEY","UNIQUE","DEFAULT","REFERENCES","ON","DELETE","CASCADE",
  "CHECK","AUTOINCREMENT","IF","EXISTS","FOREIGN","CONSTRAINT",
]);

function SqlCodeBlock({ sql }: { sql: string }) {
  const formatted = formatSql(sql);
  const tokens = formatted.split(
    /(\b(?:CREATE|TABLE|TEXT|INTEGER|REAL|BLOB|NUMERIC|NULL|NOT|PRIMARY|KEY|UNIQUE|DEFAULT|REFERENCES|ON|DELETE|CASCADE|CHECK|AUTOINCREMENT|IF|EXISTS|FOREIGN|CONSTRAINT)\b|"[^"]*"|'[^']*'|--[^\n]*|\d+)/gi
  );
  return (
    <pre className="select-text text-left text-sm font-mono leading-6 p-5 overflow-auto whitespace-pre-wrap break-words">
      {tokens.map((tok, i) => {
        if (SQL_KW.has(tok.toUpperCase()))
          return <span key={i} className="text-primary font-semibold">{tok}</span>;
        if (/^["']/.test(tok))
          return <span key={i} className="text-amber-400">{tok}</span>;
        if (/^--/.test(tok))
          return <span key={i} className="text-muted-foreground/60 italic">{tok}</span>;
        if (/^\d+$/.test(tok))
          return <span key={i} className="text-sky-400">{tok}</span>;
        return <span key={i} className="text-foreground">{tok}</span>;
      })}
    </pre>
  );
}

// ── Shared UI primitives ──────────────────────────────────────────────────────

function PanelMessage({
  icon: Icon, title, body, iconColor = "text-muted-foreground",
}: {
  icon: React.ElementType;
  title: string;
  body?: React.ReactNode;
  iconColor?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center min-h-[200px]">
      <div className={cn("rounded-xl border border-border bg-muted/30 p-3", iconColor)}>
        <Icon size={22} strokeWidth={1.5} />
      </div>
      <div className="space-y-1 max-w-xs">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {body && <p className="text-xs text-muted-foreground">{body}</p>}
      </div>
    </div>
  );
}

function TableListSkeleton() {
  return (
    <div className="flex flex-col gap-1 px-2 py-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="h-8 rounded-md bg-muted/50 animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

// ── Schema tab content ────────────────────────────────────────────────────────

function SchemaTab({ table }: { table: D1TableSchema }) {
  if (!table.sql) {
    return (
      <PanelMessage
        icon={AlertCircle}
        title="No schema available"
        body={`${table.name} has no recorded CREATE TABLE statement`}
      />
    );
  }
  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-muted/20">
        <div className="flex items-center gap-2">
          <Code2 size={13} strokeWidth={1.75} className="text-primary" />
          <span className="text-xs font-medium text-foreground">{table.name}</span>
        </div>
        <span className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">CREATE TABLE</span>
      </div>
      <ScrollArea className="flex-1">
        <div className="bg-muted/10 min-h-full">
          <SqlCodeBlock sql={table.sql} />
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Data tab content ──────────────────────────────────────────────────────────

function DataSkeleton({ colCount }: { colCount: number }) {
  return (
    <div className="w-full h-full">
      <div className="flex border-b border-border bg-muted/30 px-4 py-2.5 gap-6">
        {Array.from({ length: Math.max(colCount, 4) }).map((_, i) => (
          <div key={i} className="h-3 w-20 rounded bg-muted animate-pulse" />
        ))}
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex border-b border-border px-4 py-3 gap-6 last:border-0">
          {Array.from({ length: Math.max(colCount, 4) }).map((_, j) => (
            <div key={j} className="h-3 rounded bg-muted/50 animate-pulse" style={{ width: `${48 + (j * 13) % 48}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface DataTabProps {
  databaseId: string;
  table: D1TableSchema;
  allTables: D1TableSchema[];
}

function DataTab({ databaseId, table, allTables }: DataTabProps) {
  const [offset, setOffset] = useState(0);
  const [editingColumn, setEditingColumn] = useState<D1Column | null>(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [selectedRowIndices, setSelectedRowIndices] = useState<number[]>([]);
  const [sortCol, setSortCol] = useState<string | undefined>();
  const [sortAsc, setSortAsc] = useState<boolean | undefined>();
  const { state, refresh } = useD1TableData(databaseId, table.name, offset, sortCol, sortAsc);

  const page = Math.floor(offset / 100) + 1;
  const hasNext = state.status === "success" && state.data.totalFetched === 100;
  const hasPrev = offset > 0;

  const tableDensity = useAppStore(s => s.tableDensity);
  const paddingY = tableDensity === "compact" ? "py-1.5" : "py-2.5";

  const allColumns =
    state.status === "success" ? state.data.columns.map((c) => c.name) : [];

  const existingPrimaryKeyColumn =
    state.status === "success"
      ? state.data.columns.find((c) => c.isPrimary)?.name || null
      : null;

  const rowsToExport =
    state.status === "success"
      ? selectedRowIndices.length === 0 ||
        selectedRowIndices.length === state.data.rows.length
        ? state.data.rows
        : selectedRowIndices.map((i) => state.data.rows[i])
      : [];

  useEffect(() => {
    setSelectedRowIndices([]);
  }, [databaseId, table.name, offset, state.status]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-muted/20">
        <div className="flex items-center gap-2">
          <Sheet size={13} strokeWidth={1.75} className="text-primary" />
          <span className="text-xs font-medium text-foreground">{table.name}</span>
          {state.status === "success" && (
            <Badge variant="secondary" className="text-[10px] font-mono">
              {state.data.rows.length} row{state.data.rows.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline" size="sm"
            className="h-6 text-xs gap-1.5 px-2"
            onClick={() => setIsExportOpen(true)}
            disabled={state.status !== "success" || state.data.rows.length === 0}
          >
            <Download size={11} />
            {selectedRowIndices.length === 0 || (state.status === "success" && selectedRowIndices.length === state.data.rows.length)
              ? "Export All"
              : `Export ${selectedRowIndices.length} Rows`}
          </Button>
        </div>
      </div>

      {/* Table area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {(state.status === "idle" || state.status === "loading") && (
          <DataSkeleton colCount={4} />
        )}

        {state.status === "error" && (
          <PanelMessage
            icon={AlertCircle}
            title="Query failed"
            body={state.message}
            iconColor="text-destructive"
          />
        )}

        {state.status === "success" && state.data.rows.length === 0 && (
          <PanelMessage
            icon={Sheet}
            title="No rows found"
            body={`${table.name} is empty or has no data matching the current offset`}
          />
        )}

        {state.status === "success" && state.data.rows.length > 0 && (
          <div className="h-full w-full overflow-auto">
            <div className="min-w-max">

            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30 sticky top-0 z-10">
                  <TableHead className={`w-10 text-center px-2 shrink-0 border-r border-border ${paddingY}`}>
                    <Checkbox
                      checked={
                        state.data.rows.length > 0 && selectedRowIndices.length === state.data.rows.length
                          ? true
                          : selectedRowIndices.length > 0
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedRowIndices(state.data.rows.map((_, i) => i));
                        } else {
                          setSelectedRowIndices([]);
                        }
                      }}
                      aria-label="Select all rows"
                    />
                  </TableHead>
                  {/* Row number gutter */}
                  <TableHead className={`w-10 text-center text-[10px] text-muted-foreground/40 font-mono px-2 shrink-0 border-r border-border ${paddingY}`}>
                    #
                  </TableHead>
                  {state.data.columns.map((col) => (
                    <TableHead
                      key={col.name}
                      className={`text-xs font-medium text-foreground whitespace-nowrap bg-muted/40 border-r border-border last:border-r-0 ${paddingY} px-0 group`}
                    >
                      <DropdownMenu>
                        <DropdownMenuTrigger className="flex items-center justify-between gap-4 w-full h-full cursor-pointer hover:bg-muted/60 px-3 outline-none">
                          <div className="flex items-center gap-2">
                            <span>{col.name}</span>
                            <span className="text-muted-foreground/60 text-[10px] font-mono lowercase tracking-wide">
                              {col.type}
                            </span>
                            {col.isPrimary && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="h-4 px-1 py-0 gap-0 text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border-amber-500/20 shadow-none cursor-default">
                                      <Key size={11} strokeWidth={2.5} />
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs font-medium">
                                    Primary Key
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {col.foreignKeys && col.foreignKeys.length > 0 && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="secondary" className="h-4 px-1 gap-1 text-[10px] font-mono bg-muted/60 hover:bg-muted/80 text-muted-foreground cursor-help">
                                      <Link2 size={10} />
                                      {col.foreignKeys.length}
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs font-medium font-mono">
                                    <div className="flex flex-col gap-1.5 py-0.5">
                                      {col.foreignKeys.map((fk, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                          <span className="text-muted-foreground">{table.name}.{col.name}</span>
                                          <span className="text-muted-foreground/50">{"->"}</span>
                                          <span className="text-foreground">{fk.table}.{fk.column}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <ChevronDown size={13} className="text-muted-foreground/30 group-hover:text-muted-foreground/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44 font-mono text-[11px] shadow-lg border-border/60">
                          <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground focus:text-foreground" onClick={() => { setSortCol(col.name); setSortAsc(true); setOffset(0); }}>
                            <ArrowUp size={13} strokeWidth={1.5} /> Sort Ascending
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground focus:text-foreground" onClick={() => { setSortCol(col.name); setSortAsc(false); setOffset(0); }}>
                            <ArrowDown size={13} strokeWidth={1.5} /> Sort Descending
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground focus:text-foreground" onClick={() => navigator.clipboard.writeText(col.name)}>
                            <Copy size={13} strokeWidth={1.5} /> Copy name
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 cursor-pointer text-muted-foreground focus:text-foreground" onClick={() => setEditingColumn(col)}>
                            <Edit size={13} strokeWidth={1.5} /> Edit column
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Trash2 size={13} strokeWidth={1.5} /> Delete column
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.data.rows.map((row, ri) => (
                  <TableRow
                    key={ri}
                    className="hover:bg-accent/30 transition-colors font-mono text-xs"
                  >
                    <TableCell className={`text-center px-2 border-r border-border/50 ${paddingY}`}>
                      <Checkbox
                        checked={selectedRowIndices.includes(ri)}
                        onCheckedChange={(checked) => {
                          setSelectedRowIndices((prev) => {
                            if (checked) {
                              return prev.includes(ri) ? prev : [...prev, ri];
                            }
                            return prev.filter((i) => i !== ri);
                          });
                        }}
                        aria-label={`Select row ${ri + 1}`}
                      />
                    </TableCell>
                    {/* Row number */}
                    <TableCell className={`text-center text-muted-foreground/30 px-2 select-none tabular-nums border-r border-border/50 ${paddingY}`}>
                      {state.data.offset + ri + 1}
                    </TableCell>
                    {state.data.columns.map((col) => {
                      const val = row[col.name];
                      const isNull = val === null || val === undefined;
                      const isEmpty = val === "";
                      return (
                        <TableCell
                          key={col.name}
                          className={`max-w-[260px] truncate px-3 border-r border-border/50 last:border-r-0 ${paddingY}`}
                          title={isNull ? "NULL" : String(val)}
                        >
                          {isNull ? (
                            <span className="text-muted-foreground/30 italic text-xs uppercase">NULL</span>
                          ) : isEmpty ? (
                            <span className="text-muted-foreground/30 italic text-xs uppercase">EMPTY</span>
                          ) : (
                            <span className="text-foreground/90">{String(val)}</span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>{/* min-w-max */}
          </div>
        )}

      </div>

      <ExportWrapper
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        dataToExport={rowsToExport as Record<string, unknown>[]}
        allColumns={allColumns}
      />

      <EditColumnDialog
        databaseId={databaseId}
        tableName={table.name}
        column={editingColumn}
        tableColumns={state.status === "success" ? state.data.columns : []}
        open={!!editingColumn}
        onOpenChange={(open) => {
          if (!open) setEditingColumn(null);
        }}
        allTables={allTables}
        existingPrimaryKeyColumn={existingPrimaryKeyColumn}
        onSuccess={() => {
          setEditingColumn(null);
          refresh();
        }}
      />

      {/* Pagination footer */}
      {(hasPrev || hasNext || state.status === "success") && (
        <div className="flex items-center justify-between border-t border-border bg-muted/20 px-4 py-2 shrink-0">
          <span className="text-xs text-muted-foreground/50 tabular-nums">
            {state.status === "success"
              ? `Rows ${offset + 1}–${offset + (state.data?.totalFetched ?? 0)}`
              : "Loading…"}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground/40">Page {page}</span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="icon"
                className="h-6 w-6"
                disabled={!hasPrev}
                onClick={() => setOffset(Math.max(0, offset - 100))}
                aria-label="Previous page"
              >
                <ChevronLeft size={12} />
              </Button>
              <Button
                variant="outline" size="icon"
                className="h-6 w-6"
                disabled={!hasNext}
                onClick={() => setOffset(offset + 100)}
                aria-label="Next page"
              >
                <ChevronRightIcon size={12} />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Table list item ────────────────────────────────────────────────────────────

function TableListItem({
  table, active, onClick,
}: {
  table: D1TableSchema;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex items-center gap-2 w-full rounded-md px-2.5 py-1.5 text-sm text-left",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-accent text-accent-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      )}
    >
      <Table2
        size={13} strokeWidth={active ? 2 : 1.75}
        className={cn("shrink-0", active ? "text-primary" : "text-muted-foreground/50")}
      />
      <span className="flex-1 truncate">{table.name}</span>
      {active && <ChevronRight size={12} className="text-primary shrink-0" />}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DatabaseExplorerProps {
  database: D1Database;
  onBack: () => void;
}

export function DatabaseExplorer({ database, onBack }: DatabaseExplorerProps) {
  const [selectedTable, setSelectedTable] = useState<D1TableSchema | null>(null);
  const [systemOpen, setSystemOpen] = useState(false);
  const userPickedRef = useRef(false);          // true once user manually clicks a table
  const { state, refresh } = useD1Schema(database.uuid);

  const isLoading = state.status === "idle" || state.status === "loading";
  const allTables  = state.status === "success" ? state.data : [];
  const userTables = allTables.filter((t) => !t.name.startsWith("_cf_"));
  const sysTables  = allTables.filter((t) => t.name.startsWith("_cf_"));

  // Auto-select the first user table when the list loads — skip if user already picked one.
  useEffect(() => {
    if (userPickedRef.current) return;
    if (userTables.length > 0) {
      setSelectedTable(userTables[0]);
    }
  // Only run when the list content genuinely changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const handleTableSelect = (table: D1TableSchema) => {
    userPickedRef.current = true;
    setSelectedTable(table);
  };

  // Pass the full DB-level schema (user + system) to the ER visualizer.
  const tables = allTables;

  return (
    <div className="flex flex-col h-full gap-0 min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 pb-4 shrink-0">
        <Button
          variant="ghost" size="sm" onClick={onBack}
          className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2"
        >
          <ArrowLeft size={14} strokeWidth={2} />
          Databases
        </Button>

        <Separator orientation="vertical" className="h-4" />

        <div className="flex items-center gap-2 min-w-0">
          <Database size={14} strokeWidth={1.75} className="text-primary shrink-0" />
          <span className="font-semibold text-sm text-foreground truncate">{database.name}</span>
          {database.version && (
            <Badge variant="secondary" className="font-mono text-[10px] uppercase shrink-0">
              {database.version}
            </Badge>
          )}
        </div>

        <Button
          variant="ghost" size="icon" onClick={refresh} disabled={isLoading}
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label="Refresh schema"
        >
          <RefreshCw size={13} className={cn(isLoading && "animate-spin")} />
        </Button>
      </div>

      {/* Explorer body */}
      <div className="flex flex-1 min-h-0 rounded-lg border border-border overflow-hidden">

        {/* Left: table list */}
        <div className="w-[200px] shrink-0 border-r border-border flex flex-col bg-muted/20">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-medium">
              Tables
            </span>
            {state.status === "success" && (
              <span className="text-[10px] text-muted-foreground/40">{userTables.length}</span>
            )}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-1.5">
              {isLoading && <TableListSkeleton />}

              {state.status === "error" && (
                <div className="flex flex-col items-center gap-2 py-6 px-2 text-center">
                  <AlertCircle size={16} className="text-destructive" />
                  <p className="text-xs text-muted-foreground break-words">{state.message}</p>
                </div>
              )}

              {state.status === "success" && userTables.length === 0 && sysTables.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 px-2">No tables found</p>
              )}

              {/* User tables */}
              {state.status === "success" && userTables.map((table) => (
                <TableListItem
                  key={table.name}
                  table={table}
                  active={selectedTable?.name === table.name}
                  onClick={() => handleTableSelect(table)}
                />
              ))}

              {/* System / _cf_ tables — collapsible */}
              {state.status === "success" && sysTables.length > 0 && (
                <div className="mt-1">
                  <button
                    onClick={() => setSystemOpen((o) => !o)}
                    className={cn(
                      "flex items-center gap-1.5 w-full px-2 py-1 rounded-md",
                      "text-[10px] uppercase tracking-widest text-muted-foreground/40",
                      "hover:text-muted-foreground/60 transition-colors"
                    )}
                  >
                    <ChevronRight
                      size={10}
                      strokeWidth={2}
                      className={cn("transition-transform", systemOpen && "rotate-90")}
                    />
                    System ({sysTables.length})
                  </button>
                  {systemOpen && sysTables.map((table) => (
                    <TableListItem
                      key={table.name}
                      table={table}
                      active={selectedTable?.name === table.name}
                      onClick={() => handleTableSelect(table)}
                    />
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Right: tabbed content */}
        <div className="flex-1 min-w-0 flex flex-col bg-background">
          <Tabs defaultValue="data" className="flex flex-col h-full min-h-0">
            <div className="border-b border-border px-3 pt-2 pb-0 shrink-0 bg-muted/10">
              <TabsList className="h-8 bg-transparent p-0 gap-0">
                {([
                  { value: "sql",    Icon: Terminal, label: "SQL Editor"   },
                  { value: "data",   Icon: Sheet,    label: "Data"         },
                  { value: "schema", Icon: Code2,    label: "Schema"       },
                  { value: "visual", Icon: Network,  label: "Visual Schema" },
                ] as const).map(({ value, Icon, label }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className={cn(
                      "rounded-none h-8 px-4 text-xs font-medium border-b-2 border-transparent",
                      "data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent",
                      "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
                      "transition-colors"
                    )}
                  >
                    <Icon size={12} strokeWidth={2} className="mr-1.5" />
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* SQL Editor — always available */}
            <TabsContent value="sql" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <QueryEditor databaseId={database.uuid} />
            </TabsContent>

            {/* Data — requires a selected table */}
            <TabsContent value="data" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              {selectedTable
                ? <DataTab databaseId={database.uuid} table={selectedTable} allTables={tables} />
                : <PanelMessage icon={Sheet} title="Select a table" body="Click a table name on the left to browse its rows" />}
            </TabsContent>

            {/* Schema — requires a selected table */}
            <TabsContent value="schema" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              {selectedTable
                ? <SchemaTab table={selectedTable} />
                : <PanelMessage icon={BookOpen} title="Select a table" body="Click a table name on the left to view its CREATE TABLE statement" />}
            </TabsContent>

            {/* Visual Schema — always available, shows entire DB graph */}
            <TabsContent value="visual" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
              <SchemaVisualizer tables={tables} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
