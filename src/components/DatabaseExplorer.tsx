// DatabaseExplorer.tsx
//
// Schema Visualizer + Data Browser for a selected D1 table.
// Tabs: Schema (CREATE TABLE SQL) | Data (paginated row grid)

import { useState } from "react";
import {
  ArrowLeft, Table2, RefreshCw, Database,
  ChevronRight, AlertCircle, BookOpen,
  ChevronLeft, ChevronRight as ChevronRightIcon,
  Sheet, Code2, Terminal,
} from "lucide-react";
import { QueryEditor } from "@/components/QueryEditor";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  useD1Schema,
  useD1TableData,
  type D1Database,
  type D1TableSchema,
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
}

function DataTab({ databaseId, table }: DataTabProps) {
  const [offset, setOffset] = useState(0);
  const { state, refresh } = useD1TableData(databaseId, table.name, offset);

  const page = Math.floor(offset / 100) + 1;
  const hasNext = state.status === "success" && state.data.totalFetched === 100;
  const hasPrev = offset > 0;

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
            variant="ghost" size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={refresh}
            disabled={state.status === "loading" || state.status === "idle"}
          >
            <RefreshCw size={11} className={cn((state.status === "loading" || state.status === "idle") && "animate-spin")} />
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
                  {/* Row number gutter */}
                  <TableHead className="w-10 text-center text-[10px] text-muted-foreground/40 font-mono py-2.5 px-2 shrink-0">
                    #
                  </TableHead>
                  {state.data.columns.map((col) => (
                    <TableHead
                      key={col}
                      className="text-xs font-medium uppercase tracking-wider text-muted-foreground py-2.5 whitespace-nowrap"
                    >
                      {col}
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
                    {/* Row number */}
                    <TableCell className="text-center text-muted-foreground/30 py-2.5 px-2 select-none tabular-nums">
                      {state.data.offset + ri + 1}
                    </TableCell>
                    {state.data.columns.map((col) => {
                      const val = row[col];
                      const isNull = val === null || val === undefined;
                      const isNum = typeof val === "number";
                      return (
                        <TableCell
                          key={col}
                          className={cn(
                            "py-2.5 max-w-[260px] truncate",
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
        )}

      </div>

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
  const { state, refresh } = useD1Schema(database.uuid);

  const isLoading = state.status === "idle" || state.status === "loading";
  const tables = state.status === "success" ? state.data : [];

  // Reset selected table when navigating back and forth
  const handleTableSelect = (table: D1TableSchema) => {
    setSelectedTable(table);
  };

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
              <span className="text-[10px] text-muted-foreground/40">{tables.length}</span>
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

              {state.status === "success" && tables.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 px-2">No tables found</p>
              )}

              {state.status === "success" && tables.map((table) => (
                <TableListItem
                  key={table.name}
                  table={table}
                  active={selectedTable?.name === table.name}
                  onClick={() => handleTableSelect(table)}
                />
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right: tabbed content */}
        <div className="flex-1 min-w-0 flex flex-col bg-background">
          {!selectedTable ? (
            <PanelMessage
              icon={BookOpen}
              title="Select a table"
              body="Click a table name to view its schema and data"
            />
          ) : (
            <Tabs defaultValue="schema" className="flex flex-col h-full min-h-0">
              <div className="border-b border-border px-3 pt-2 pb-0 shrink-0 bg-muted/10">
                <TabsList className="h-8 bg-transparent p-0 gap-0">
                  {([
                    { value: "schema", Icon: Code2,    label: "Schema"     },
                    { value: "data",   Icon: Sheet,     label: "Data"       },
                    { value: "sql",    Icon: Terminal,  label: "SQL Editor" },
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

              <TabsContent value="schema" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                <SchemaTab table={selectedTable} />
              </TabsContent>

              <TabsContent value="data" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                <DataTab databaseId={database.uuid} table={selectedTable} />
              </TabsContent>

              <TabsContent value="sql" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
                <QueryEditor databaseId={database.uuid} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}
