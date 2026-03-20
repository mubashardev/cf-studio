import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Info, List, ArrowRight, Expand, BookOpen, X, Check, Table2, Trash2 } from "lucide-react";
import type { D1Column, D1TableSchema, D1ForeignKey, D1QueryResult } from "@/hooks/useCloudflare";
import { invokeCloudflare } from "@/hooks/useCloudflare";
import { useToast } from "@/components/ui/use-toast";

type DraftColumn = {
  name: string;
  type: string;
  isPrimary: boolean;
  isNullable: boolean;
  isUnique: boolean;
  defaultValue: string;
};

export interface EditColumnDialogProps {
  databaseId: string;
  tableName: string;
  column: D1Column | null;
  tableColumns: D1Column[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allTables: D1TableSchema[];
  existingPrimaryKeyColumn?: string | null;
  onSuccess: () => void;
}

function generateTableRecreationSQL(
  tableName: string,
  oldColumns: D1Column[],
  draftOldColumnName: string,
  draftColumn: DraftColumn,
  draftRelations: D1ForeignKey[]
): string[] {
  const newTableName = `${tableName}_new`;
  
  const columnDefs = oldColumns.map(col => {
    if (col.name === draftOldColumnName) {
      const typeStr = draftColumn.type || "text";
      const pkStr = draftColumn.isPrimary ? " PRIMARY KEY" : "";
      const nullStr = draftColumn.isNullable ? "" : " NOT NULL";
      const uniqueStr = draftColumn.isUnique ? " UNIQUE" : "";
      const defaultStr = draftColumn.defaultValue ? ` DEFAULT ${draftColumn.defaultValue}` : "";
      return `"${draftColumn.name}" ${typeStr}${pkStr}${nullStr}${uniqueStr}${defaultStr}`;
    } else {
      const typeStr = col.type || "text";
      const pkStr = col.isPrimary ? " PRIMARY KEY" : "";
      const nullStr = col.isNullable ? "" : " NOT NULL";
      const defaultStr = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : "";
      return `"${col.name}" ${typeStr}${pkStr}${nullStr}${defaultStr}`;
    }
  });

  draftRelations.forEach(fk => {
    columnDefs.push(`FOREIGN KEY ("${draftColumn.name}") REFERENCES "${fk.table}" ("${fk.column}") ON UPDATE ${fk.updateAction.toUpperCase()} ON DELETE ${fk.deleteAction.toUpperCase()}`);
  });

  oldColumns.forEach(col => {
    if (col.name !== draftOldColumnName && col.foreignKeys) {
      col.foreignKeys.forEach(fk => {
        columnDefs.push(`FOREIGN KEY ("${col.name}") REFERENCES "${fk.table}" ("${fk.column}") ON UPDATE ${fk.updateAction.toUpperCase()} ON DELETE ${fk.deleteAction.toUpperCase()}`);
      });
    }
  });

  const createTableSql = `CREATE TABLE "${newTableName}" (\n  ${columnDefs.join(",\n  ")}\n);`;

  const insertColsRaw = oldColumns.map(col => `"${col.name === draftOldColumnName ? draftColumn.name : col.name}"`).join(", ");
  const selectColsRaw = oldColumns.map(col => `"${col.name}"`).join(", ");
  const insertSql = `INSERT INTO "${newTableName}" (${insertColsRaw}) SELECT ${selectColsRaw} FROM "${tableName}";`;

  const dropSql = `DROP TABLE "${tableName}";`;
  const renameSql = `ALTER TABLE "${newTableName}" RENAME TO "${tableName}";`;

  return [
    createTableSql,
    insertSql,
    dropSql,
    renameSql
  ];
}

export function EditColumnDialog({
  databaseId,
  tableName,
  column,
  tableColumns,
  open,
  onOpenChange,
  allTables,
  existingPrimaryKeyColumn,
  onSuccess,
}: EditColumnDialogProps) {
  const { toast } = useToast();
  const [draftColumn, setDraftColumn] = useState({
    name: "",
    type: "",
    isPrimary: false,
    isNullable: false,
    isUnique: false,
    defaultValue: "",
    // Foreign Key Dialog State
    fkTable: "",
    fkColumn: "",
    fkUpdateAction: "No action",
    fkDeleteAction: "No action",
    draftRelations: [] as D1ForeignKey[],
  });
  const [fkOpen, setFkOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [changesList, setChangesList] = useState<string[]>([]);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (column && open) {
      setDraftColumn({
        name: column.name,
        type: column.type || "text",
        isPrimary: !!column.isPrimary,
        isNullable: !!column.isNullable,
        isUnique: false, // We don't have unique from PRAGMA easily
        defaultValue: column.defaultValue || "",
        fkTable: "",
        fkColumn: "",
        fkUpdateAction: "No action",
        fkDeleteAction: "No action",
        draftRelations: column.foreignKeys || [],
      });
    }
  }, [column, open]);

  if (!column) return null;

  const handleReviewChanges = () => {
    if (!column) return;
    const diffs: string[] = [];

    if (draftColumn.name !== column.name) {
      diffs.push(`Renamed column from "${column.name}" to "${draftColumn.name}"`);
    }
    if (draftColumn.type !== (column.type || "text")) {
      diffs.push(`Changed type from "${column.type || "text"}" to "${draftColumn.type}"`);
    }
    if (draftColumn.isNullable !== !!column.isNullable) {
      diffs.push(`Changed nullable from ${!!column.isNullable ? "TRUE" : "FALSE"} to ${draftColumn.isNullable ? "TRUE" : "FALSE"}`);
    }
    if (draftColumn.isPrimary !== !!column.isPrimary) {
      if (draftColumn.isPrimary) diffs.push(`Added Primary Key constraint`);
      else diffs.push(`Removed Primary Key constraint`);
    }
    if (draftColumn.defaultValue !== (column.defaultValue || "")) {
      diffs.push(`Changed default value from "${column.defaultValue || "NULL"}" to "${draftColumn.defaultValue || "NULL"}"`);
    }

    const originalFks = column.foreignKeys || [];
    const draftFks = draftColumn.draftRelations;

    draftFks.forEach(newFk => {
      const exists = originalFks.some(oldFk => oldFk.table === newFk.table && oldFk.column === newFk.column);
      if (!exists) {
        diffs.push(`Added Foreign Key referencing ${newFk.table}.${newFk.column}`);
      }
    });

    originalFks.forEach(oldFk => {
      const exists = draftFks.some(newFk => newFk.table === oldFk.table && newFk.column === oldFk.column);
      if (!exists) {
        diffs.push(`Removed Foreign Key referencing ${oldFk.table}.${oldFk.column}`);
      }
    });

    if (diffs.length === 0) {
      onOpenChange(false);
    } else {
      setChangesList(diffs);
      setConfirmOpen(true);
    }
  };

  const handleApplyChanges = async () => {
    if (!column) return;
    setIsApplying(true);
    try {
      const statements = generateTableRecreationSQL(tableName, tableColumns, column.name, draftColumn, draftColumn.draftRelations);
      
      for (const statement of statements) {
        if (!statement.trim()) continue;
        const results = await invokeCloudflare<D1QueryResult[]>("execute_d1_query", {
          accountId: "",
          databaseId,
          sqlQuery: statement,
          params: null
        });
        
        const failed = results.find(r => !r.success);
        if (failed) {
          throw new Error(failed.error || "Query failed to execute successfully.");
        }
      }
      
      toast({
        title: "Success",
        description: "Schema updated successfully.",
      });
      
      setConfirmOpen(false);
      onSuccess();
    } catch (error: any) {
      console.error(error);
      toast({
        title: "Error applying changes",
        description: error.message || String(error),
        variant: "destructive"
      });
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(val) => {
      if (!isApplying) onOpenChange(val);
    }}>
      <DialogContent className="max-w-2xl p-0 gap-0 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-border bg-muted/30 shrink-0">
          <DialogTitle className="text-sm font-medium font-mono text-foreground">
            Update column <span className="text-foreground">{column.name}</span> from <span className="text-foreground">{tableName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-background">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Column editing is preview-only right now. Support for real schema changes is coming soon.
            </p>
          </div>

          {/* General Section */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6">
            <div className="text-sm font-medium text-foreground/80">General</div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={draftColumn.name}
                  onChange={(e) => setDraftColumn({ ...draftColumn, name: e.target.value })}
                  className="font-mono h-9 text-sm"
                />
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                  Recommended to use lowercase and use an underscore to separate words e.g. column_name
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <span className="text-[10px] text-muted-foreground/60 uppercase">Optional</span>
                </div>
                <Textarea
                  className="min-h-[60px] resize-none"
                />
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-border/60" />

          {/* Data Type Section */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6">
            <div className="space-y-2 text-sm font-medium text-foreground/80">
              Data Type
              <div className="flex flex-col gap-2 mt-4">
                <Button variant="outline" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground justify-start">
                  + Create enum types
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground justify-start">
                  <Info size={12} className="mr-1.5" /> About data types
                </Button>
              </div>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={draftColumn.type} onValueChange={(val) => setDraftColumn({ ...draftColumn, type: val })}>
                  <SelectTrigger className="w-full h-9 font-mono text-sm">
                    <span className="text-muted-foreground/50 mr-2 text-xs">T</span> <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="varchar">varchar</SelectItem>
                    <SelectItem value="text">text</SelectItem>
                    <SelectItem value="integer">integer</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="real">real</SelectItem>
                    <SelectItem value="blob">blob</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draftColumn.type === "varchar" && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-amber-500/90 leading-none">It is recommended to use <code className="bg-amber-500/20 px-1 py-0.5 rounded text-amber-400">text</code> instead</h4>
                    <p className="text-xs text-amber-500/70 leading-relaxed">
                      SQLite recommends against using the data type <code className="bg-amber-500/20 px-1 rounded">varchar</code> unless you have a very specific use case.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" size="sm" className="h-7 text-xs border-amber-500/30 text-amber-500/90 bg-transparent hover:bg-amber-500/10">
                        Read more
                      </Button>
                      <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white border-0" onClick={() => setDraftColumn({ ...draftColumn, type: "text" })}>
                        Use text
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 pt-2">
                 <div className="mt-1 flex h-4 w-4 items-center justify-center rounded border border-border bg-muted/30" />
                 <div>
                   <Label className="text-xs text-foreground font-medium">Define as Array</Label>
                   <p className="text-[10px] text-muted-foreground">Allow column to be defined as variable-length multidimensional arrays</p>
                 </div>
              </div>

              <div className="space-y-2 pt-4">
                <Label className="text-xs text-muted-foreground">Default Value</Label>
                <div className="relative">
                  <Input
                    placeholder="NULL"
                    value={draftColumn.defaultValue}
                    onChange={(e) => setDraftColumn({ ...draftColumn, defaultValue: e.target.value })}
                    className="font-mono h-9 text-sm pr-10"
                  />
                  <div className="absolute right-2 top-2 text-muted-foreground/40">
                    <List size={14} />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                  Can either be a literal or an expression. When using an expression wrap your expression in brackets, e.g. (gen_random_uuid())
                </p>
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-border/60" />

          {/* Foreign Keys */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6">
            <div className="text-sm font-medium text-foreground/80 text-left">Foreign Keys</div>
            <div className="space-y-4">
              <Button variant="outline" size="sm" onClick={() => setFkOpen(true)} className="h-7 text-xs text-muted-foreground hover:text-foreground">
                Add foreign key
              </Button>
              {draftColumn.draftRelations.length > 0 && (
                <div className="space-y-2">
                  {draftColumn.draftRelations.map((rel, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2">
                      <span className="text-xs font-mono text-muted-foreground truncate mr-2">
                        References <span className="text-foreground">{rel.table}.{rel.column}</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                        onClick={() => {
                          const newRels = [...draftColumn.draftRelations];
                          newRels.splice(i, 1);
                          setDraftColumn({ ...draftColumn, draftRelations: newRels });
                        }}
                      >
                         <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="h-px w-full bg-border/60" />

          {/* Constraints Section */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6 pb-6">
             <div className="text-sm font-medium text-foreground/80">Constraints</div>
             <div className="space-y-6">
                 <div className="flex items-start gap-4">
                   <Switch
                     checked={draftColumn.isPrimary}
                     onCheckedChange={(val) => setDraftColumn({ ...draftColumn, isPrimary: val })}
                     disabled={!!existingPrimaryKeyColumn && existingPrimaryKeyColumn !== column.name}
                     className="mt-0.5"
                   />
                   <div>
                     <Label className="text-sm font-medium">Is Primary Key</Label>
                     <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 hidden lg:block">A primary key indicates that a column or group of columns can be used as a unique identifier for rows in the table</p>
                     {!!existingPrimaryKeyColumn && existingPrimaryKeyColumn !== column.name && (
                       <p className="text-[10px] text-muted-foreground mt-1.5">
                         Table already has a primary key: {existingPrimaryKeyColumn}
                       </p>
                     )}
                     {!!existingPrimaryKeyColumn && existingPrimaryKeyColumn === column.name && !draftColumn.isPrimary && (
                       <p className="text-[10px] text-amber-500 mt-1.5">
                         Warning: This table will not have any primary key.
                       </p>
                     )}
                   </div>
                 </div>

                 <div className="flex items-start gap-4">
                   <Switch checked={draftColumn.isNullable} onCheckedChange={(val) => setDraftColumn({ ...draftColumn, isNullable: val })} className="mt-0.5" />
                   <div>
                     <Label className="text-sm font-medium">Allow Nullable</Label>
                     <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 hidden lg:block">Allow the column to assume a NULL value if no value is provided</p>
                   </div>
                 </div>

                 <div className="flex items-start gap-4">
                   <Switch checked={draftColumn.isUnique} onCheckedChange={(val) => setDraftColumn({ ...draftColumn, isUnique: val })} className="mt-0.5" />
                   <div>
                     <Label className="text-sm font-medium">Is Unique</Label>
                     <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 hidden lg:block">Enforce values in the column to be unique across rows</p>
                   </div>
                 </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs text-muted-foreground">CHECK Constraint</Label>
                    <span className="text-[10px] text-muted-foreground/60 uppercase">Optional</span>
                  </div>
                  <Input
                    placeholder={`length("${column.name}") < 500`}
                    className="font-mono h-9 text-sm text-muted-foreground"
                  />
                </div>
             </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-border bg-muted/20 flex justify-end gap-2 shrink-0">
          <Button variant="ghost" size="sm" disabled={isApplying} onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground h-8 text-xs font-medium">
            Cancel
          </Button>
          <Button size="sm" disabled={isApplying} onClick={handleReviewChanges} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-medium px-4">
            Save <span className="text-emerald-200/50 font-mono ml-1 text-[10px]">⏎</span>
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* foreign key dialog stack */}
      <Dialog open={fkOpen} onOpenChange={setFkOpen}>
        <DialogContent className="max-w-xl p-0 gap-0 shadow-2xl overflow-hidden flex flex-col bg-background border-border text-foreground h-[80vh]">
          <DialogHeader className="p-5 pb-4 border-b border-border bg-background shrink-0">
            <DialogTitle className="text-sm font-medium text-foreground/90">
              Add foreign key relationship to {tableName}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-muted/10">
            <div className="rounded-lg border border-border bg-background px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground/60 text-xs font-bold font-serif italic cursor-help">
                  ?
                </div>
                <span className="text-sm font-medium text-foreground/90">What are foreign keys?</span>
              </div>
              <Expand size={14} className="text-muted-foreground/50" />
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-xs text-muted-foreground">Select a table to reference to</Label>
              <Select value={draftColumn.fkTable} onValueChange={(val) => setDraftColumn({ ...draftColumn, fkTable: val })}>
                <SelectTrigger className="w-full bg-background border-border h-10 text-sm">
                  <div className="flex items-center gap-2">
                    <Table2 size={14} className="text-muted-foreground/60" />
                    <SelectValue placeholder="---" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-background border-border">
                  {allTables && allTables.map(t => (
                    <SelectItem key={t.name} value={t.name} className="gap-2">
                       <span className="text-muted-foreground/50 text-xs">public</span> <span className="font-medium text-foreground">{t.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-2">
               <Label className="text-xs text-muted-foreground">
                 Select columns from <code className="bg-muted px-1 py-0.5 rounded text-foreground/80">public.{tableName}</code> to reference to
               </Label>
               
               <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 space-y-1.5">
                     <p className="text-[10px] text-muted-foreground">public.{tableName}</p>
                     <Select value={column.name} disabled>
                       <SelectTrigger className="w-full bg-background border-border h-9 text-xs">
                         <SelectValue>{column.name}</SelectValue>
                       </SelectTrigger>
                     </Select>
                  </div>
                  <ArrowRight size={14} className="text-muted-foreground/60 mt-5 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                     <p className="text-[10px] text-muted-foreground">{draftColumn.fkTable ? `public.${draftColumn.fkTable}` : "..."}</p>
                     <Select value={draftColumn.fkColumn} onValueChange={(val) => setDraftColumn({ ...draftColumn, fkColumn: val })} disabled={!draftColumn.fkTable}>
                       <SelectTrigger className="w-full bg-background border-border h-9 text-xs relative">
                         <SelectValue placeholder="---" />
                         {draftColumn.fkColumn && <Check size={12} className="absolute right-8 text-emerald-500" />}
                       </SelectTrigger>
                       <SelectContent className="bg-accent border-border shadow-lg">
                         <SelectItem value="id" className="text-xs hover:bg-muted/80 cursor-pointer">
                           <div className="flex items-center justify-between w-full">
                             <span><span className="font-medium text-foreground">id</span> <span className="text-muted-foreground/60">integer</span></span>
                           </div>
                         </SelectItem>
                         {/* We can just hardcode a common option like ID since we don't fetch the ref table schema here */}
                       </SelectContent>
                     </Select>
                  </div>
                  <Button variant="ghost" size="icon" className="h-9 w-9 mt-5 shrink-0 bg-background border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30">
                     <X size={14} />
                  </Button>
               </div>
               
               <Button variant="outline" size="sm" className="h-7 text-xs bg-background border-border text-muted-foreground hover:text-foreground">
                 Add another column
               </Button>
            </div>

            <div className="h-px w-full bg-border my-4" />

            <div className="rounded-lg border border-border bg-background px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-muted-foreground/30 text-muted-foreground/60 text-xs font-bold font-serif italic cursor-help">
                  ?
                </div>
                <span className="text-sm font-medium text-foreground/90">Which action is most appropriate?</span>
              </div>
              <Expand size={14} className="text-muted-foreground/50" />
            </div>

            <div className="space-y-6 pt-2">
              <div className="space-y-2">
                 <Label className="text-xs text-muted-foreground leading-relaxed">Action if referenced row is updated</Label>
                 <Select value={draftColumn.fkUpdateAction} onValueChange={(val) => setDraftColumn({ ...draftColumn, fkUpdateAction: val })}>
                   <SelectTrigger className="w-full bg-background border-border h-10 text-sm">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent className="bg-background border-border">
                     {["No action", "Cascade", "Restrict", "Set NULL", "Set default"].map(a => (
                       <SelectItem key={a} value={a}>{a}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                   {draftColumn.fkUpdateAction}: Updating a record from <code className="bg-muted px-1 rounded text-foreground/80 font-mono">public.{tableName}</code> will <span className="text-amber-500 font-medium">raise an error</span> if there are records existing in this table that reference it
                 </p>
              </div>

              <div className="space-y-2">
                 <div className="flex items-center justify-between">
                   <Label className="text-xs text-muted-foreground leading-relaxed">Action if referenced row is removed</Label>
                   <Button variant="outline" size="sm" className="h-6 text-[10px] bg-background border-border text-foreground/70">
                     <BookOpen size={10} className="mr-1.5" /> Docs
                   </Button>
                 </div>
                 <Select value={draftColumn.fkDeleteAction} onValueChange={(val) => setDraftColumn({ ...draftColumn, fkDeleteAction: val })}>
                   <SelectTrigger className="w-full bg-background border-border h-10 text-sm">
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent className="bg-background border-border">
                     {["No action", "Cascade", "Restrict", "Set NULL", "Set default"].map(a => (
                       <SelectItem key={a} value={a}>{a}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
                 <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                   {draftColumn.fkDeleteAction}: Deleting a record from <code className="bg-muted px-1 rounded text-foreground/80 font-mono">public.{tableName}</code> will <span className="text-amber-500 font-medium">raise an error</span> if there are records existing in this table that reference it
                 </p>
              </div>
            </div>

          </div>

          <DialogFooter className="p-4 border-t border-border bg-background flex justify-end gap-2 shrink-0">
            <Button variant="ghost" size="sm" onClick={() => setFkOpen(false)} className="text-muted-foreground hover:text-foreground h-8 text-xs font-medium border border-transparent hover:border-border">
              Cancel
            </Button>
            <Button size="sm" onClick={() => {
              if (draftColumn.fkTable && draftColumn.fkColumn) {
                setDraftColumn({
                  ...draftColumn,
                  draftRelations: [...draftColumn.draftRelations, {
                    table: draftColumn.fkTable,
                    column: draftColumn.fkColumn,
                    updateAction: draftColumn.fkUpdateAction,
                    deleteAction: draftColumn.fkDeleteAction
                  }],
                  fkTable: "", fkColumn: "", fkUpdateAction: "No action", fkDeleteAction: "No action"
                });
              }
              setFkOpen(false);
            }} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-medium px-4 border-0">
              Save <span className="text-emerald-200/50 font-mono ml-1 text-[10px]">⏎</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={(val) => {
        if (!isApplying) setConfirmOpen(val);
      }}>
        <AlertDialogContent className="max-w-md p-6 overflow-hidden">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Review Schema Changes</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-sm leading-relaxed mt-2">
              You are about to make critical changes to the schema of this column. Please review them below:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <ul className="list-disc pl-4 space-y-1 text-sm text-foreground/80 font-mono">
              {changesList.map((change, i) => (
                <li key={i}>{change}</li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter className="mt-6 flex gap-2">
            <AlertDialogCancel disabled={isApplying} onClick={() => setConfirmOpen(false)} className="h-8 text-xs font-medium mt-0">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isApplying}
              onClick={(e) => {
                e.preventDefault();
                handleApplyChanges();
              }}
              className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white border-0 mt-0"
            >
              {isApplying ? "Applying..." : "Apply Changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
