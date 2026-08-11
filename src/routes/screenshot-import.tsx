import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Upload, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { analyzeScreenshot, type ExtractedOrder } from "@/lib/ai.functions";

export const Route = createFileRoute("/screenshot-import")({
  head: () => ({
    meta: [
      { title: "截圖匯入 — 漢紗排程調度台" },
      {
        name: "description",
        content: "上載訂單 App 截圖，AI 自動辨識客戶、地址與訂單內容並建立訂單。",
      },
      { property: "og:title", content: "截圖匯入 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "上載訂單 App 截圖，AI 自動辨識客戶、地址與訂單內容並建立訂單。",
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

function ScreenshotImportPage() {
  const qc = useQueryClient();
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState<ExtractedOrder>(blank);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleFile = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("讀取失敗"));
      reader.readAsDataURL(file);
    });
    setPreview(dataUrl);
    setAnalyzing(true);
    const res = await analyzeScreenshot({ data: { imageDataUrl: dataUrl } });
    setAnalyzing(false);
    if (!res.success || !res.order) {
      toast.error(res.error ?? "辨識失敗");
      return;
    }
    setForm(res.order);
    toast.success("已辨識，請核對資料");
  };

  const save = async () => {
    if (!form.customerName || !form.rawAddress) {
      toast.error("客戶姓名同地址係必填");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("orders").insert({
      order_no: form.orderNo || null,
      customer_name: form.customerName,
      customer_phone: form.customerPhone || null,
      raw_address: form.rawAddress,
      order_content: form.orderContent || null,
      measure_date: form.measureDate || null,
      notes: form.notes || null,
    });
    setSaving(false);
    if (error) {
      toast.error("儲存失敗：" + error.message);
      return;
    }
    toast.success("已建立訂單");
    setForm(blank);
    setPreview(null);
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <AppShell title="截圖匯入" subtitle="上載訂單截圖，AI 自動抽取欄位">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-surface p-6 text-center transition-colors hover:border-primary/50">
            {preview ? (
              <img src={preview} alt="訂單截圖預覽" className="max-h-80 rounded" />
            ) : (
              <>
                <Camera className="size-8 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">點擊上載截圖</p>
                  <p className="text-xs text-muted-foreground">支援 PNG / JPG，單張辨識</p>
                </div>
              </>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
          {analyzing && <p className="mt-3 text-sm text-primary">AI 辨識中…</p>}
          {preview && !analyzing && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setPreview(null);
                setForm(blank);
              }}
            >
              <Upload className="size-4" />
              換一張
            </Button>
          )}
        </div>

        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <p className="font-display text-sm font-semibold">辨識結果（可修改）</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="訂單號" value={form.orderNo} onChange={(v) => setForm({ ...form, orderNo: v })} />
            <FormField
              label="度尺日期"
              type="date"
              value={form.measureDate}
              onChange={(v) => setForm({ ...form, measureDate: v })}
            />
            <FormField
              label="客戶姓名 *"
              value={form.customerName}
              onChange={(v) => setForm({ ...form, customerName: v })}
            />
            <FormField
              label="電話"
              value={form.customerPhone}
              onChange={(v) => setForm({ ...form, customerPhone: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>地址 *</Label>
            <Textarea
              rows={2}
              value={form.rawAddress}
              onChange={(e) => setForm({ ...form, rawAddress: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>訂單內容</Label>
            <Textarea
              rows={2}
              value={form.orderContent}
              onChange={(e) => setForm({ ...form, orderContent: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>備註</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>
            <Save className="size-4" />
            建立訂單
          </Button>
        </div>
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
