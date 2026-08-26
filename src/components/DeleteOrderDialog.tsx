import { useState } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 订单摘要，用于确认提示 */
  summary?: string;
  onConfirm: () => void;
};

/**
 * 刪除訂單確認對話框：必須主動撳「確認刪除」先會執行，
 * 防止誤按一鍵刪除。
 */
export function DeleteOrderDialog({ open, onOpenChange, summary, onConfirm }: Props) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = () => {
    setBusy(true);
    onConfirm();
    setBusy(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mb-2 flex size-11 items-center justify-center rounded-full bg-destructive/15">
            <AlertTriangle className="size-5 text-destructive" />
          </div>
          <DialogTitle>确认刪除订单</DialogTitle>
          <DialogDescription>
            呢个操作唔可以复原，订单资料会永久移除。
            {summary ? <span className="mt-1 block break-words text-sm">{summary}</span> : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={busy}>
            <Trash2 className="size-4" />
            确认刪除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
