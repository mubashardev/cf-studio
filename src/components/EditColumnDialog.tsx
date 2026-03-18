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
import { AlertTriangle, Info, List } from "lucide-react";

export interface EditColumnDialogProps {
  tableName: string;
  column: { name: string; type: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditColumnDialog({
  tableName,
  column,
  open,
  onOpenChange,
}: EditColumnDialogProps) {
  const [colName, setColName] = useState("");
  const [colType, setColType] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [nullable, setNullable] = useState(false);
  const [isUnique, setIsUnique] = useState(false);

  useEffect(() => {
    if (column && open) {
      setColName(column.name);
      setColType(column.type || "text");
      // Reset defaults for demo
      setIsPrimary(false);
      setNullable(true);
      setIsUnique(false);
    }
  }, [column, open]);

  if (!column) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#1c1c1c] border-[#2d2d2d] text-foreground p-0 gap-0 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <DialogHeader className="p-6 pb-4 border-b border-[#2d2d2d] bg-[#1c1c1c] shrink-0">
          <DialogTitle className="text-sm font-medium font-mono text-foreground/80">
            Update column <span className="text-foreground">{column.name}</span> from <span className="text-foreground">{tableName}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-10 bg-[#151515]">
          {/* General Section */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6">
            <div className="text-sm font-medium text-foreground/80">General</div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={colName}
                  onChange={(e) => setColName(e.target.value)}
                  className="font-mono bg-[#1c1c1c] border-[#2d2d2d] focus-visible:ring-1 focus-visible:ring-primary h-9 text-sm"
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
                  className="bg-[#1c1c1c] border-[#2d2d2d] focus-visible:ring-1 focus-visible:ring-primary min-h-[60px] resize-none"
                />
              </div>
            </div>
          </div>

          <div className="h-[1px] w-full bg-[#2d2d2d]" />

          {/* Data Type Section */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6">
            <div className="space-y-2 text-sm font-medium text-foreground/80">
              Data Type
              <div className="flex flex-col gap-2 mt-4">
                <Button variant="outline" size="sm" className="h-7 text-xs bg-[#1c1c1c] border-[#2d2d2d] text-muted-foreground hover:text-foreground justify-start">
                  + Create enum types
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs bg-[#1c1c1c] border-[#2d2d2d] text-muted-foreground hover:text-foreground justify-start">
                  <Info size={12} className="mr-1.5" /> About data types
                </Button>
              </div>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={colType} onValueChange={setColType}>
                  <SelectTrigger className="w-full bg-[#1c1c1c] border-[#2d2d2d] h-9 font-mono text-sm">
                    <span className="text-muted-foreground/50 mr-2 text-xs">T</span> <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1c1c1c] border-[#2d2d2d]">
                    <SelectItem value="varchar">varchar</SelectItem>
                    <SelectItem value="text">text</SelectItem>
                    <SelectItem value="integer">integer</SelectItem>
                    <SelectItem value="boolean">boolean</SelectItem>
                    <SelectItem value="real">real</SelectItem>
                    <SelectItem value="blob">blob</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {colType === "varchar" && (
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
                      <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-500 text-white border-0" onClick={() => setColType("text")}>
                        Use text
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 pt-2">
                 <div className="mt-1 flex h-4 w-4 items-center justify-center rounded border border-[#2d2d2d] bg-[#1c1c1c]" />
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
                    className="font-mono bg-[#1c1c1c] border-[#2d2d2d] focus-visible:ring-1 focus-visible:ring-primary h-9 text-sm pr-10"
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

          <div className="h-[1px] w-full bg-[#2d2d2d]" />

          {/* Foreign Keys */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6">
            <div className="text-sm font-medium text-foreground/80 text-left">Foreign Keys</div>
            <div>
              <Button variant="outline" size="sm" className="h-7 text-xs bg-[#1c1c1c] border-[#2d2d2d] text-muted-foreground hover:text-foreground">
                Add foreign key
              </Button>
            </div>
          </div>

          <div className="h-[1px] w-full bg-[#2d2d2d]" />

          {/* Constraints Section */}
          <div className="grid grid-cols-[1fr_2.5fr] gap-6 pb-6">
             <div className="text-sm font-medium text-foreground/80">Constraints</div>
             <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Switch checked={isPrimary} onCheckedChange={setIsPrimary} className="mt-0.5 data-[state=unchecked]:bg-[#2d2d2d]" />
                  <div>
                    <Label className="text-sm font-medium">Is Primary Key</Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 hidden lg:block">A primary key indicates that a column or group of columns can be used as a unique identifier for rows in the table</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Switch checked={nullable} onCheckedChange={setNullable} className="mt-0.5 data-[state=unchecked]:bg-[#2d2d2d] data-[state=checked]:bg-emerald-500" />
                  <div>
                    <Label className="text-sm font-medium">Allow Nullable</Label>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-1 hidden lg:block">Allow the column to assume a NULL value if no value is provided</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <Switch checked={isUnique} onCheckedChange={setIsUnique} className="mt-0.5 data-[state=unchecked]:bg-[#2d2d2d]" />
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
                    className="font-mono bg-[#1c1c1c] border-[#2d2d2d] focus-visible:ring-1 focus-visible:ring-primary h-9 text-sm text-muted-foreground"
                  />
                </div>
             </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t border-[#2d2d2d] bg-[#1c1c1c] flex justify-end gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground h-8 text-xs font-medium border border-transparent hover:border-[#2d2d2d]">
            Cancel
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-medium px-4">
            Save <span className="text-emerald-200/50 font-mono ml-1 text-[10px]">⏎</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
