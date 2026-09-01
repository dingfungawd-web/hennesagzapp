import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Save, Sparkles, Trash2, CheckCircle2, AlertCircle, Loader2, MapPin } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { analyzeScreenshot, type ExtractedOrder } from "@/lib/ai.functions";
import { fileToImageDataUrl } from "@/lib/image";
import { autoGeocodeOrders } from "@/lib/geocode";
import { cn } from "@/lib/utils";
import { ImportGeoReview } from "@/components/ImportGeoReview";
import { CancelImportDialog } from "@/components/CancelImportDialog";
import { useCancelImportBatch, useImportBatches } from "@/lib/queries";

export const Route = createFileRoute("/screenshot-import")({
  head: () => ({
    meta: [
      { title: "截图汇入 — 汉纱排程调度台" },
      {
        name: "description",
        content: "批量上载订单截图（支援 iPhone HEIC），AI 自动辨识客户、地址与订单内容并建立订单。",
      },
      { property: "og:title", content: "截图汇入 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "批量上载订单截图（支援 iPhone HEIC），AI 自动辨识客户、地址与订单内容并建立订单。",
      },
    ],
  }),
  component: ScreenshotImportPage,
});

const blank: ExtractedOrder = {
  orderType: "install",
  orderNo: "",
  customerName: "",
  customerPhone: "",
  rawAddress: "",
  orderContent: "",
  depositDate: "",
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
  pending: { label: "待辨识", className: "text-muted-foreground" },
  analyzing: { label: "辨识中", className: "text-primary" },
  done: { label: "已辨识", className: "text-primary" },
  error: { label: "失败", className: "text-destructive" },
  saved: { label: "已建立", className: "text-success" },
};

function ScreenshotImportPage() {
  const qc = useQueryClient();
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [cancelBatchId, setCancelBatchId] = useState<string | null>(null);
  const { data: allBatches = [] } = useImportBatches();
  const cancelBatch = useCancelImportBatch();
  const batches = allBatches.filter((batch) => batch.source === "screenshot");
  const cancelTarget = batches.find((batch) => batch.id === cancelBatchId) ?? null;

  useEffect(() => {
    if (!activeBatchId && batches[0]) setActiveBatchId(batches[0].id);
  }, [activeBatchId, batches]);

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
        toast.error(`${file.name} 读取失败：${e instanceof Error ? e.message : "未知错误"}`);
      }
    }
    setItems((prev) => [...prev, ...added]);
    setLoadingFiles(false);
    const first = added[0];
    if (first && !selectedId) setSelectedId(first.id);
    if (added.length) {
      toast.success(`已加入 ${added.length} 张截图，开始辨识…`);
      void runQueue(added);
    }
  };

  const analyzeOne = async (item: Item) => {
    patch(item.id, { status: "analyzing", error: undefined });
    try {
      const res = await analyzeScreenshot({ data: { imageDataUrl: item.preview } });
      if (!res.success || !res.order) {
        patch(item.id, { status: "error", error: res.error ?? "辨识失败" });
        return false;
      }
      patch(item.id, { status: "done", order: res.order });
      return true;
    } catch (e) {
      patch(item.id, { status: "error", error: e instanceof Error ? e.message : "辨识失败" });
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
    toast.success(`辨识完成：成功 ${ok} / ${targets.length}`);
  };

  const analyzeAll = async () => {
    const targets = items.filter((i) => i.status === "pending" || i.status === "error");
    if (targets.length === 0) {
      toast.info("冇待辨识嘅截图");
      return;
    }
    await runQueue(targets);
  };


  const saveAll = async () => {
    const targets = items.filter(
      (i) => i.status === "done" && i.order.customerName && i.order.rawAddress,
    );
    if (targets.length === 0) {
      toast.error("冇可建立嘅订单（需要客户姓名同地址）");
      return;
    }
    setSaving(true);
    const { data: batch, error: batchError } = await supabase
      .from("import_batches")
      .insert({
        batch_id: crypto.randomUUID(),
        file_name: `截图汇入 ${new Date().toLocaleString("zh-CN")}`,
        total_count: targets.length,
        status: "processing",
        source: "screenshot",
      })
      .select()
      .single();
    if (batchError || !batch) {
      setSaving(false);
      toast.error("建立截图汇入批次失败");
      return;
    }
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert(
        targets.map((i) => ({
          order_no: i.order.orderNo || null,
          order_type: i.order.orderType,
          deposit_date: i.order.depositDate || null,
          customer_name: i.order.customerName,
          customer_phone: i.order.customerPhone || null,
          raw_address: i.order.rawAddress,
          order_content: i.order.orderContent || null,
          notes: i.order.notes || null,
          import_batch_id: batch.id,
        })),
      )
      .select("id, raw_address");
    if (error) {
      await supabase.from("import_batches").delete().eq("id", batch.id);
      setSaving(false);
      toast.error("储存失败：" + error.message);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (targets.some((t) => t.id === i.id) ? { ...i, status: "saved" } : i)),
    );
    toast.success(`已建立 ${targets.length} 张订单，正在自动解析地址…`);
    await supabase
      .from("import_batches")
      .update({ status: "completed", success_count: inserted?.length ?? 0 })
      .eq("id", batch.id);
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["import_batches"] });

    const summary = await autoGeocodeOrders(
      (inserted ?? []).map((o) => ({ id: o.id, address: o.raw_address })),
    );
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["orders"] });
    setActiveBatchId(batch.id);
    if (!summary.configured) toast.error(summary.message ?? "未设定高德 API Key，地址未解析");
    else if (summary.message) toast.error(summary.message);
    else
      toast.success(
        `地址解析完成：成功 ${summary.ok}${summary.failed ? ` · 失败 ${summary.failed}` : ""}`,
      );
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
      title="截图汇入"
      subtitle={`批量上载截图（支援 HEIC），AI 自动抽取栏位 · 共 ${items.length} 张`}
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => {
            const latest = batches[0];
            if (!latest) toast.success("截图汇入未有待核对批次");
            else setActiveBatchId(latest.id);
          }}>
            核对定位
          </Button>
          <Button size="sm" variant="outline" onClick={analyzeAll} disabled={running || !pendingCount}>
            <Sparkles className="size-4" />
            {running ? "辨识中…" : `全部辨识${pendingCount ? ` (${pendingCount})` : ""}`}
          </Button>
          <Button size="sm" onClick={saveAll} disabled={saving || !readyCount}>
            <Save className="size-4" />
            {saving ? "建立中…" : `建立订单${readyCount ? ` (${readyCount})` : ""}`}
          </Button>
        </div>
      }
    >
      {activeBatchId && (
        <ImportGeoReview
          batchId={activeBatchId}
          title={`截图逐张核对定位 · ${batches.find((batch) => batch.id === activeBatchId)?.file_name ?? "汇入批次"}`}
          onClose={() => setActiveBatchId(null)}
        />
      )}

      {batches.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-card p-4">
          <p className="mb-3 font-display text-sm font-semibold">待核对截图汇入</p>
          <div className="space-y-2">
            {batches.map((batch) => (
              <div key={batch.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-surface px-3 py-2 text-sm">
                <span className="min-w-0 truncate">{batch.file_name}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{batch.success_count}/{batch.total_count} 张</Badge>
                  <Button size="sm" variant="outline" onClick={() => setActiveBatchId(batch.id)}>
                    <MapPin className="size-3.5" />继续核对
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setCancelBatchId(batch.id)}>
                    <Trash2 className="size-3.5" />取消汇入
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center transition-colors hover:border-primary/50">
            <Camera className="size-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">点击上载截图（可多选）</p>
              <p className="text-xs text-muted-foreground">
                支援 PNG / JPG / HEIC，iPhone 相片自动转档
              </p>
            </div>
            {loadingFiles && (
              <span className="flex items-center gap-1.5 text-xs text-primary">
                <Loader2 className="size-3.5 animate-spin" />
                处理档案中…
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
                    alt={`截图 ${item.name}`}
                    className="size-12 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium">
                      <span
                        className={cn(
                          "mr-1.5 rounded px-1 py-0.5 text-[10px]",
                          item.order.orderType === "followup"
                            ? "bg-warning/20 text-warning"
                            : "bg-primary/20 text-primary",
                        )}
                      >
                        {item.order.orderType === "followup" ? "跟进" : "安装"}
                      </span>
                      {item.order.customerName || item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.order.rawAddress || item.error || "尚未辨识"}
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
                未有截图，上载后可一次过批量辨识。
              </p>
            )}
          </div>
        </div>

        {selected ? (
          <div className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-sm font-semibold">辨识结果（可修改）</p>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{STATUS_META[selected.status].label}</Badge>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selected.status === "analyzing"}
                  onClick={() => void analyzeOne(selected)}
                >
                  <Sparkles className="size-4" />
                  重新辨识
                </Button>
              </div>
            </div>
            {selected.error && <p className="text-xs text-destructive">{selected.error}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <img
                src={selected.preview}
                alt={`订单截图 ${selected.name}`}
                className="max-h-[52vh] w-full rounded border border-border object-contain"
              />
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>订单类型 *</Label>
                  <div className="flex gap-2">
                    {(["install", "followup"] as const).map((t) => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant={selected.order.orderType === t ? "default" : "outline"}
                        onClick={() => updateOrder(selected.id, { orderType: t })}
                      >
                        {t === "install" ? "安装单" : "跟进单"}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    label="订单号"
                    value={selected.order.orderNo}
                    onChange={(v) => updateOrder(selected.id, { orderNo: v })}
                  />
                  <FormField
                    label="客户姓名 *"
                    value={selected.order.customerName}
                    onChange={(v) => updateOrder(selected.id, { customerName: v })}
                  />
                  <FormField
                    label="电话"
                    value={selected.order.customerPhone}
                    onChange={(v) => updateOrder(selected.id, { customerPhone: v })}
                  />
                  {selected.order.orderType === "install" && (
                    <FormField
                      label="收订日期（+7 日为死线）"
                      type="date"
                      value={selected.order.depositDate}
                      onChange={(v) => updateOrder(selected.id, { depositDate: v })}
                    />
                  )}
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
                  <Label>订单内容</Label>
                  <Textarea
                    rows={2}
                    value={selected.order.orderContent}
                    onChange={(e) => updateOrder(selected.id, { orderContent: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>备注</Label>
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
            拣左边一张截图嚟核对资料
          </div>
        )}
      </div>
      <CancelImportDialog
        open={Boolean(cancelTarget)}
        fileName={cancelTarget?.file_name ?? "截图汇入批次"}
        onOpenChange={(open) => {
          if (!open) setCancelBatchId(null);
        }}
        onConfirm={async () => {
          if (!cancelTarget) return;
          try {
            await cancelBatch.mutateAsync(cancelTarget.id);
            if (activeBatchId === cancelTarget.id) setActiveBatchId(null);
            toast.success("已取消整批汇入");
          } catch (error) {
            toast.error(`取消汇入失败：${error instanceof Error ? error.message : String(error)}`);
          }
        }}
      />
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
