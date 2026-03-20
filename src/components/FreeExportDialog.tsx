import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataToExport: Record<string, unknown>[];
  allColumns: string[];
}

export function FreeExportDialog({ isOpen, onClose }: ExportDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pro Feature</DialogTitle>
          <DialogDescription>
            Advanced Data Export is a Pro feature. Available in the official release.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={onClose}>Understood</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
