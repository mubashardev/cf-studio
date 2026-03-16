// schemaParser.ts
//
// Parses raw sqlite_master CREATE TABLE statements into React Flow
// nodes (tables with columns) and edges (foreign-key relationships).
//
// Supported column/constraint forms:
//   col_name TYPE [NOT NULL] [UNIQUE] [DEFAULT x] [PRIMARY KEY] [AUTOINCREMENT]
//   PRIMARY KEY (col, ...)
//   FOREIGN KEY (col) REFERENCES other_table (other_col) [ON DELETE ...]

import type { Node, Edge } from "@xyflow/react";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ColumnDef {
  name: string;
  type: string;           // e.g. "INTEGER", "TEXT", "REAL"
  isPrimaryKey: boolean;
  isNotNull: boolean;
  isUnique: boolean;
  defaultValue: string | null;
}

export interface ForeignKeyDef {
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface TableDef {
  name: string;
  columns: ColumnDef[];
  foreignKeys: ForeignKeyDef[];
  primaryKeyColumns: string[];   // compound PKs declared with PK constraint
}

export interface SchemaGraph {
  nodes: Node<TableNodeData>[];
  edges: Edge[];
  tables: TableDef[];
}

export interface TableNodeData {
  tableName: string;
  columns: ColumnDef[];
  primaryKeyColumns: string[];
  [key: string]: unknown;  // satisfy React Flow's Record<string,unknown> constraint
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strip block and line comments from a SQL string. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")   // /* block */
    .replace(/--[^\n]*/g, " ");           // -- line
}

/** Extract the content inside the outermost parentheses of a CREATE TABLE. */
function extractParenBody(sql: string): string | null {
  const start = sql.indexOf("(");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < sql.length; i++) {
    if (sql[i] === "(") depth++;
    else if (sql[i] === ")") {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  return end === -1 ? null : sql.slice(start + 1, end);
}

/**
 * Split the body of a CREATE TABLE into individual definition clauses,
 * respecting nested parentheses (e.g. DEFAULT (expr)).
 */
function splitTableBody(body: string): string[] {
  const clauses: string[] = [];
  let current = "";
  let depth = 0;
  for (const ch of body) {
    if (ch === "(") { depth++; current += ch; }
    else if (ch === ")") { depth--; current += ch; }
    else if (ch === "," && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) clauses.push(trimmed);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) clauses.push(last);
  return clauses;
}

// SQLite type affinity words (order matters — longest match first)
const TYPE_WORDS = [
  "INTEGER", "INT", "TINYINT", "SMALLINT", "MEDIUMINT", "BIGINT",
  "UNSIGNED BIG INT", "INT2", "INT8",
  "TEXT", "CLOB", "CHARACTER", "VARCHAR", "NVARCHAR", "NCHAR",
  "REAL", "DOUBLE", "FLOAT",
  "NUMERIC", "DECIMAL", "BOOLEAN", "DATE", "DATETIME",
  "BLOB",
];

function extractType(typeStr: string): string {
  const upper = typeStr.toUpperCase().trim();
  for (const t of TYPE_WORDS) {
    if (upper.startsWith(t)) return t;
  }
  // Fall back to first word
  return upper.split(/\s+/)[0] ?? "TEXT";
}

// ── Core parsers ──────────────────────────────────────────────────────────────

function parseTableName(sql: string): string | null {
  const m = sql.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(/i
  );
  return m?.[1] ?? null;
}

function parseColumnClause(clause: string): ColumnDef | null {
  // Column definitions start with an identifier (not a keyword like PRIMARY/FOREIGN/UNIQUE/CHECK)
  const kws = /^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i;
  if (kws.test(clause.trim())) return null;

  // col_name [type] [constraints...]
  const m = clause.match(/^[`"']?(\w+)[`"']?\s*(.*)/s);
  if (!m) return null;

  const name = m[1];
  const rest = m[2].trim();

  // Try to pull the type (everything up to the first keyword constraint)
  const typeMatch = rest.match(
    /^([A-Z][A-Z0-9 ()]*?)(?:\s+(NOT\s+NULL|NULL|PRIMARY|UNIQUE|DEFAULT|REFERENCES|GENERATED|AS|CHECK|COLLATE)|$)/i
  );
  const rawType = typeMatch?.[1]?.trim() ?? rest.split(/\s+/)[0] ?? "";
  const type = extractType(rawType) || "TEXT";

  const upper = rest.toUpperCase();
  const isPrimaryKey = /\bPRIMARY\s+KEY\b/.test(upper);
  const isNotNull = /\bNOT\s+NULL\b/.test(upper);
  const isUnique = /\bUNIQUE\b/.test(upper);

  let defaultValue: string | null = null;
  const defMatch = rest.match(/\bDEFAULT\s+([^\s,]+)/i);
  if (defMatch) defaultValue = defMatch[1];

  return { name, type, isPrimaryKey, isNotNull, isUnique, defaultValue };
}

function parseForeignKeyClause(clause: string): ForeignKeyDef | null {
  // FOREIGN KEY (col) REFERENCES other_table (other_col)
  const m = clause.match(
    /FOREIGN\s+KEY\s*\(\s*[`"']?(\w+)[`"']?\s*\)\s+REFERENCES\s+[`"']?(\w+)[`"']?\s*(?:\(\s*[`"']?(\w+)[`"']?\s*\))?/i
  );
  if (!m) return null;
  return { fromColumn: m[1], toTable: m[2], toColumn: m[3] ?? "id" };
}

function parsePrimaryKeyConstraint(clause: string): string[] {
  // PRIMARY KEY (col1, col2, ...)
  const m = clause.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
  if (!m) return [];
  return m[1].split(",").map((c) => c.trim().replace(/[`"']/g, ""));
}

// ── Table parser ──────────────────────────────────────────────────────────────

export function parseCreateTable(sql: string): TableDef | null {
  const clean = stripSqlComments(sql).trim();
  const tableName = parseTableName(clean);
  if (!tableName) return null;

  const body = extractParenBody(clean);
  if (!body) return null;

  const clauses = splitTableBody(body);

  const columns: ColumnDef[] = [];
  const foreignKeys: ForeignKeyDef[] = [];
  let primaryKeyColumns: string[] = [];

  for (const clause of clauses) {
    const trimmed = clause.trim();
    const upper = trimmed.toUpperCase();

    if (/^FOREIGN\s+KEY/i.test(upper)) {
      const fk = parseForeignKeyClause(trimmed);
      if (fk) foreignKeys.push(fk);
    } else if (/^PRIMARY\s+KEY/i.test(upper) || /^CONSTRAINT\s+\w+\s+PRIMARY\s+KEY/i.test(upper)) {
      primaryKeyColumns = parsePrimaryKeyConstraint(trimmed);
    } else if (/^UNIQUE|^CHECK|^CONSTRAINT/i.test(upper)) {
      // skip — not a column
    } else {
      const col = parseColumnClause(trimmed);
      if (col) columns.push(col);
    }
  }

  // Merge inline PK flags with compound PK constraint
  if (primaryKeyColumns.length > 0) {
    for (const col of columns) {
      if (primaryKeyColumns.includes(col.name)) col.isPrimaryKey = true;
    }
  } else {
    // collect any inline PKs
    primaryKeyColumns = columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
  }

  return { name: tableName, columns, foreignKeys, primaryKeyColumns };
}

// ── Layout algorithms ─────────────────────────────────────────────────────────

const NODE_WIDTH  = 240;
const NODE_GAP_X  = 80;
const NODE_GAP_Y  = 60;

/**
 * Grid layout — tables are placed left-to-right, top-to-bottom.
 * Column count ≈ √(n), so the grid is roughly square.
 */
function gridLayout(tables: TableDef[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const cols = Math.max(1, Math.ceil(Math.sqrt(tables.length)));

  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);

    // Node height scales with column count (header + rows)
    const nodeHeight = 44 + t.columns.length * 30 + 16;
    const maxRowHeight = Math.max(
      ...tables
        .slice(row * cols, (row + 1) * cols)
        .map((tt) => 44 + tt.columns.length * 30 + 16)
    );

    const x = col * (NODE_WIDTH + NODE_GAP_X);
    // Accumulate y offset for all previous rows
    let y = 0;
    for (let r = 0; r < row; r++) {
      const rowTables = tables.slice(r * cols, (r + 1) * cols);
      const rHeight = Math.max(...rowTables.map((tt) => 44 + tt.columns.length * 30 + 16));
      y += rHeight + NODE_GAP_Y;
    }
    void nodeHeight; // unused — we use maxRowHeight for alignment within a row
    void maxRowHeight;

    positions.set(t.name, { x, y });
  });

  return positions;
}

// ── Graph builder ─────────────────────────────────────────────────────────────

let edgeCounter = 0;

export function parseSQLiteSchemaToGraph(
  // Raw sqlite_master rows — each has { name: string; sql: string | null }
  rawRows: Array<{ name: string; sql: string | null }>
): SchemaGraph {
  edgeCounter = 0;

  // 1. Parse every CREATE TABLE statement
  const tables: TableDef[] = rawRows
    .map((row) => (row.sql ? parseCreateTable(row.sql) : null))
    .filter((t): t is TableDef => t !== null);

  // 2. Compute positions
  const positions = gridLayout(tables);

  // 3. Build React Flow nodes
  const nodes: Node<TableNodeData>[] = tables.map((table) => {
    const pos = positions.get(table.name) ?? { x: 0, y: 0 };
    return {
      id: table.name,
      type: "tableNode",        // custom node type registered in the diagram component
      position: pos,
      data: {
        tableName: table.name,
        columns: table.columns,
        primaryKeyColumns: table.primaryKeyColumns,
      },
    };
  });

  // 4. Build React Flow edges from FK relationships
  const tableNames = new Set(tables.map((t) => t.name));
  const edges: Edge[] = [];

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      if (!tableNames.has(fk.toTable)) continue;   // skip dangling refs
      edges.push({
        id: `fk-${edgeCounter++}`,
        source: table.name,
        target: fk.toTable,
        sourceHandle: `${table.name}__${fk.fromColumn}`,
        targetHandle: `${fk.toTable}__${fk.toColumn}`,
        label: `${fk.fromColumn} → ${fk.toColumn}`,
        type: "smoothstep",
        animated: false,
        style: { strokeWidth: 1.5 },
        labelStyle: { fontSize: 10, fill: "hsl(var(--muted-foreground))" },
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.85 },
        markerEnd: { type: "arrowclosed" as const, width: 12, height: 12 },
      });
    }
  }

  return { nodes, edges, tables };
}
