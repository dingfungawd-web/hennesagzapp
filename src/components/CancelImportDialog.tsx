import { useState } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function CancelImportDialog({
  open,
  fileName,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  fileName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <DialogTitle>确认取消整批汇入</DialogTitle>
          <DialogDescription>
            「{fileName}」建立嘅全部订单都会永久删除，呢个操作无法复原。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            保留汇入
          </Button>
          <Button variant="destructive" onClick={() => void confirm()} disabled={busy}>
            <Trash2 className="size-4" />
            {busy ? "取消中…" : "确认取消汇入"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}