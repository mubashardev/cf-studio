// SchemaVisualizer.tsx
//
// Interactive ER diagram built with React Flow (@xyflow/react).
// Renders a custom TableNode card per table with column rows and
// edge arrows for FOREIGN KEY relationships.

import "@xyflow/react/dist/style.css";
import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  type NodeProps,
  type Connection,
  type Node,
} from "@xyflow/react";
import { Key, Table2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSQLiteSchemaToGraph, type TableNodeData } from "@/utils/schemaParser";
import type { D1TableSchema } from "@/hooks/useCloudflare";
import { useTheme } from "@/components/ThemeProvider";

// ── Custom TableNode ──────────────────────────────────────────────────────────

function TableNode({ data, selected }: NodeProps<Node<TableNodeData>>) {
  const { tableName, columns, primaryKeyColumns } = data;
  const pkSet = new Set(primaryKeyColumns);

  return (
    <div
      className={cn(
        "rounded-lg border shadow-md overflow-hidden min-w-[220px] font-sans",
        "bg-card text-card-foreground",
        selected ? "border-primary shadow-primary/20 shadow-lg" : "border-border"
      )}
      style={{ fontFamily: "inherit" }}
    >
      {/* Table header */}
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 border-b border-border",
        "bg-muted text-muted-foreground"
      )}>
        <Table2 size={12} strokeWidth={2} className="text-primary shrink-0" />
        <span className="font-semibold text-xs tracking-tight truncate">
          {tableName}
        </span>
      </div>

      {/* Column rows */}
      <div className="divide-y divide-border/60">
        {columns.map((col) => {
          const isPk = col.isPrimaryKey || pkSet.has(col.name);
          return (
            <div
              key={col.name}
              className={cn(
                "relative flex items-center justify-between gap-3 px-3 py-1.5",
                isPk && "bg-amber-500/5"
              )}
            >
              {/* Target handle (incoming FK) on left */}
              <Handle
                type="target"
                position={Position.Left}
                id={`${tableName}__${col.name}`}
                style={{
                  background: "var(--primary)",
                  width: 7,
                  height: 7,
                  left: -4,
                  border: "1.5px solid var(--background)",
                }}
              />

              {/* Column name */}
              <div className="flex items-center gap-1.5 min-w-0">
                {isPk && (
                  <Key
                    size={10}
                    strokeWidth={2.5}
                    className="text-amber-400 shrink-0"
                  />
                )}
                <span
                  className={cn(
                    "text-xs truncate",
                    isPk
                      ? "font-semibold text-foreground"
                      : "font-normal text-foreground/80"
                  )}
                >
                  {col.name}
                </span>
              </div>

              {/* Column type */}
              <span className="text-[10px] text-muted-foreground/60 font-mono shrink-0 uppercase">
                {col.type}
              </span>

              {/* Source handle (outgoing FK) on right */}
              <Handle
                type="source"
                position={Position.Right}
                id={`${tableName}__${col.name}`}
                style={{
                  background: "var(--primary)",
                  width: 7,
                  height: 7,
                  right: -4,
                  border: "1.5px solid var(--background)",
                }}
              />
            </div>
          );
        })}

        {columns.length === 0 && (
          <div className="px-3 py-2 text-[11px] text-muted-foreground/40 italic">
            No columns
          </div>
        )}
      </div>
    </div>
  );
}

// Register the custom node type outside the component (stable reference)
const nodeTypes = { tableNode: TableNode };

// ── Main component ─────────────────────────────────────────────────────────────

interface SchemaVisualizerProps {
  tables: D1TableSchema[];
}

export function SchemaVisualizer({ tables }: SchemaVisualizerProps) {
  const { resolvedTheme } = useTheme();

  // Parse the schema once when tables change
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => parseSQLiteSchemaToGraph(tables),
    [tables]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Reset when tables change (e.g. refresh)
  useMemo(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNodes, initialEdges]);

  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges]
  );

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
        <div className="rounded-xl border border-border bg-muted/30 p-3 text-muted-foreground">
          <Share2 size={22} strokeWidth={1.5} />
        </div>
        <div className="space-y-1 max-w-xs">
          <p className="text-sm font-medium text-foreground">No tables to visualize</p>
          <p className="text-xs text-muted-foreground">
            Create tables in your D1 database to see the ER diagram
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ background: "var(--background)" }}>
      <ReactFlow
        colorMode={resolvedTheme}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
        minZoom={0.15}
        maxZoom={2}
        defaultEdgeOptions={{
          type: "smoothstep",
          style: { strokeWidth: 1.5, stroke: "var(--muted-foreground)" },
          markerEnd: { type: "arrowclosed", width: 12, height: 12, color: "var(--muted-foreground)" },
        }}
        proOptions={{ hideAttribution: true }}
      >
        {/* Dot-grid background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="color-mix(in oklch, var(--muted-foreground), transparent 80%)"
        />

        {/* Zoom + fit controls */}
        <Controls
          className="!shadow-none !border !border-border !bg-card !rounded-lg overflow-hidden"
          style={{ bottom: 16, left: 16 }}
          showInteractive={false}
        />

        {/* Mini-map */}
        <MiniMap
          nodeColor={() => "var(--muted)"}
          maskColor="color-mix(in oklch, var(--background), transparent 30%)"
          style={{
            background: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            bottom: 16,
            right: 16,
          }}
          nodeBorderRadius={4}
        />
      </ReactFlow>
    </div>
  );
}
