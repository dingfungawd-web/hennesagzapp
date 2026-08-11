import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Save, Sparkles, Trash2, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { analyzeScreenshot, type ExtractedOrder } from "@/lib/ai.functions";
import { fileToImageDataUrl } from "@/lib/image";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/screenshot-import")({
  head: () => ({
    meta: [
      { title: "截圖匯入 — 漢紗排程調度台" },
      {
        name: "description",
        content: "批量上載訂單截圖（支援 iPhone HEIC），AI 自動辨識客戶、地址與訂單內容並建立訂單。",
      },
      { property: "og:title", content: "截圖匯入 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "批量上載訂單截圖（支援 iPhone HEIC），AI 自動辨識客戶、地址與訂單內容並建立訂單。",
      },
    ],
  }),
  component: ScreenshotImportPage,
});

const blank: ExtractedOrder = {
  orderNo: "",
  customerName: "",
  customerPhone: "",
  rawAddress: "",
  orderContent: "",
  measureDate: "",
  notes: "",
};

type Status = "pending" | "analyzing" | "done" | "error" | "saved";

type Item = {
  id: string;
  name: string;
  preview: string;
  status: Status;
  error?: string | undefined;
  order: ExtractedOrder;
};

const STATUS_META: Record<Status, { label: string; className: string }> = {
  pending: { label: "待辨識", className: "text-muted-foreground" },
  analyzing: { label: "辨識中", className: "text-primary" },
  done: { label: "已辨識", className: "text-primary" },
  error: { label: "失敗", className: "text-destructive" },
  saved: { label: "已建立", className: "text-success" },
};

function ScreenshotImportPage() {
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = items.find((i) => i.id === selectedId) ?? null;

  const patch = (id: string, next: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...next } : i)));

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setLoadingFiles(true);
    const added: Item[] = [];
    for (const file of files) {
      try {
        const preview = await fileToImageDataUrl(file);
        added.push({
          id: crypto.randomUUID(),
          name: file.name,
          preview,
          status: "pending",
          order: { ...blank },
        });
      } catch (e) {
        toast.error(`${file.name} 讀取失敗：${e instanceof Error ? e.message : "未知錯誤"}`);
      }
    }
    setItems((prev) => [...prev, ...added]);
    setLoadingFiles(false);
    const first = added[0];
    if (first && !selectedId) setSelectedId(first.id);
    if (added.length) {
      toast.success(`已加入 ${added.length} 張截圖，開始辨識…`);
      void runQueue(added);
    }
  };

  const analyzeOne = async (item: Item) => {
    patch(item.id, { status: "analyzing", error: undefined });
    try {
      const res = await analyzeScreenshot({ data: { imageDataUrl: item.preview } });
      if (!res.success || !res.order) {
        patch(item.id, { status: "error", error: res.error ?? "辨識失敗" });
        return false;
      }
      patch(item.id, { status: "done", order: res.order });
      return true;
    } catch (e) {
      patch(item.id, { status: "error", error: e instanceof Error ? e.message : "辨識失敗" });
      return false;
    }
  };

  const runQueue = async (targets: Item[]) => {
    if (targets.length === 0) return;
    setRunning(true);
    let ok = 0;
    for (const item of targets) {
      if (await analyzeOne(item)) ok += 1;
    }
    setRunning(false);
    toast.success(`辨識完成：成功 ${ok} / ${targets.length}`);
  };

  const analyzeAll = async () => {
    const targets = items.filter((i) => i.status === "pending" || i.status === "error");
    if (targets.length === 0) {
      toast.info("冇待辨識嘅截圖");
      return;
    }
    await runQueue(targets);
  };


  const saveAll = async () => {
    const targets = items.filter(
      (i) => i.status === "done" && i.order.customerName && i.order.rawAddress,
    );
    if (targets.length === 0) {
      toast.error("冇可建立嘅訂單（需要客戶姓名同地址）");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("orders").insert(
      targets.map((i) => ({
        order_no: i.order.orderNo || null,
        customer_name: i.order.customerName,
        customer_phone: i.order.customerPhone || null,
        raw_address: i.order.rawAddress,
        order_content: i.order.orderContent || null,
        measure_date: i.order.measureDate || null,
        notes: i.order.notes || null,
      })),
    );
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (targets.some((t) => t.id === i.id) ? { ...i, status: "saved" } : i)),
    );
    toast.success(`已建立 ${targets.length} 張訂單`);
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const updateOrder = (id: string, next: Partial<ExtractedOrder>) =>
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, order: { ...i.order, ...next } } : i)),
    );

  const remove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const pendingCount = items.filter((i) => i.status === "pending" || i.status === "error").length;
  const readyCount = items.filter(
    (i) => i.status === "done" && i.order.customerName && i.order.rawAddress,
  ).length;

  return (
    <AppShell
      title="截圖匯入"
      subtitle={`批量上載截圖（支援 HEIC），AI 自動抽取欄位 · 共 ${items.length} 張`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={analyzeAll} disabled={running || !pendingCount}>
            <Sparkles className="size-4" />
            {running ? "辨識中…" : `全部辨識${pendingCount ? ` (${pendingCount})` : ""}`}
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving || !readyCount}>
            <Save className="size-4" />
            {saving ? "建立中…" : `建立訂單${readyCount ? ` (${readyCount})` : ""}`}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center transition-colors hover:border-primary/50">
            <Camera className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">點擊上載截圖（可多選）</p>
              <p className="text-xs text-muted-foreground">
                支援 PNG / JPG / HEIC，iPhone 相片自動轉檔
              </p>
            </div>
            {loadingFiles && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                處理檔案中…
              </span>
            )}
            <input
              type="file"
              accept="image/*,.heic,.heif"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void addFiles(files);
              }}
            />
          </label>

          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {items.map((item) => {
              const meta = STATUS_META[item.status];
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary/40",
                    selectedId === item.id && "border-primary/70 bg-accent/30",
                  )}
                >
                  <img
                    src={item.preview}
                    alt={`截圖 ${item.name}`}
                    className="size-12 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      {item.order.customerName || item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.order.rawAddress || item.error || "尚未辨識"}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-xs", meta.className)}>
                    {item.status === "analyzing" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : item.status === "saved" ? (
                      <CheckCircle2 className="size-4" />
                    ) : item.status === "error" ? (
                      <AlertCircle className="size-4" />
                    ) : (
                      meta.label
                    )}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label="移除"
                    className="shrink-0 rounded p-1 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(item.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.stopPropagation();
                        remove(item.id);
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </span>
                </button>
              );
            })}
            {items.length === 0 && (
              <p className="rounded-lg border border-border bg-card p-4 text-center text-xs text-muted-foreground">
                未有截圖，上載後可一次過批量辨識。
              </p>
            )}
          </div>
        </div>

        {selected ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-sm font-semibold">辨識結果（可修改）</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{STATUS_META[selected.status].label}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.status === "analyzing"}
                  onClick={() => void analyzeOne(selected)}
                >
                  <Sparkles className="size-4" />
                  重新辨識
                </Button>
              </div>
            </div>
            {selected.error && <p className="text-xs text-destructive">{selected.error}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <img
                src={selected.preview}
                alt={`訂單截圖 ${selected.name}`}
                className="max-h-[52vh] w-full rounded border border-border object-contain"
              />
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="訂單號"
                    value={selected.order.orderNo}
                    onChange={(v) => updateOrder(selected.id, { orderNo: v })}
                  />
                  <FormField
                    label="度尺日期"
                    type="date"
                    value={selected.order.measureDate}
                    onChange={(v) => updateOrder(selected.id, { measureDate: v })}
                  />
                  <FormField
                    label="客戶姓名 *"
                    value={selected.order.customerName}
                    onChange={(v) => updateOrder(selected.id, { customerName: v })}
                  />
                  <FormField
                    label="電話"
                    value={selected.order.customerPhone}
                    onChange={(v) => updateOrder(selected.id, { customerPhone: v })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>地址 *</Label>
                  <Textarea
                    rows={2}
                    value={selected.order.rawAddress}
                    onChange={(e) => updateOrder(selected.id, { rawAddress: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>訂單內容</Label>
                  <Textarea
                    rows={2}
                    value={selected.order.orderContent}
                    onChange={(e) => updateOrder(selected.id, { orderContent: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>備註</Label>
                  <Textarea
                    rows={2}
                    value={selected.order.notes}
                    onChange={(e) => updateOrder(selected.id, { notes: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            揀左邊一張截圖嚟核對資料
          </div>
        )}
      </div>
    </AppShell>
  );
}

function FormField({
  label,
  value,
  onChange,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
