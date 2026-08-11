import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Download, Save } from "lucide-react";
import * as XLSX from "xlsx";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { autoGeocodeOrders } from "@/lib/geocode";
import { useImportBatches } from "@/lib/queries";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Excel 匯入 — 漢紗排程調度台" },
      {
        name: "description",
        content: "上載 Excel 訂單表，自動對應欄位並批次建立安裝訂單，附匯入批次紀錄。",
      },
      { property: "og:title", content: "Excel 匯入 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "上載 Excel 訂單表，自動對應欄位並批次建立安裝訂單，附匯入批次紀錄。",
      },
    ],
  }),
  component: ImportPage,
});

type Row = {
  order_no: string | null;
  customer_name: string;
  customer_phone: string | null;
  raw_address: string;
  order_content: string | null;
  measure_date: string | null;
  notes: string | null;
};

const HEADER_MAP: Record<string, keyof Row> = {
  訂單號: "order_no",
  订单号: "order_no",
  客戶姓名: "customer_name",
  客户姓名: "customer_name",
  姓名: "customer_name",
  電話: "customer_phone",
  电话: "customer_phone",
  聯絡電話: "customer_phone",
  地址: "raw_address",
  客戶地址: "raw_address",
  客户地址: "raw_address",
  訂單內容: "order_content",
  订单内容: "order_content",
  度尺日期: "measure_date",
  備註: "notes",
  备注: "notes",
};

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

function ImportPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const { data: batches = [] } = useImportBatches();

  const parseFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      toast.error("Excel 冇工作表");
      return;
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      toast.error("讀取工作表失敗");
      return;
    }
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const parsed: Row[] = [];
    for (const raw of json) {
      const row: Row = {
        order_no: null,
        customer_name: "",
        customer_phone: null,
        raw_address: "",
        order_content: null,
        measure_date: null,
        notes: null,
      };
      for (const [key, value] of Object.entries(raw)) {
        const field = HEADER_MAP[key.trim()];
        if (!field) continue;
        if (field === "measure_date") row.measure_date = normalizeDate(value);
        else if (field === "customer_name" || field === "raw_address")
          row[field] = String(value ?? "").trim();
        else row[field] = String(value ?? "").trim() || null;
      }
      if (row.customer_name && row.raw_address) parsed.push(row);
    }
    setFileName(file.name);
    setRows(parsed);
    toast.success(`解析到 ${parsed.length} 行有效資料`);
  };

  const save = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    const { data: batch, error: batchErr } = await supabase
      .from("import_batches")
      .insert({
        batch_id: crypto.randomUUID(),
        file_name: fileName,
        total_count: rows.length,
        status: "processing",
      })
      .select()
      .single();
    if (batchErr || !batch) {
      setSaving(false);
      toast.error("建立匯入批次失敗");
      return;
    }
    const { data: inserted, error } = await supabase
      .from("orders")
      .insert(rows.map((r) => ({ ...r, import_batch_id: batch.id })))
      .select("id, raw_address");
    await supabase
      .from("import_batches")
      .update({
        status: error ? "failed" : "completed",
        success_count: error ? 0 : rows.length,
        failed_count: error ? rows.length : 0,
      })
      .eq("id", batch.id);
    setSaving(false);
    if (error) {
      toast.error("匯入失敗：" + error.message);
      return;
    }
    toast.success(`已匯入 ${rows.length} 張訂單，正在自動解析地址…`);
    setRows([]);
    setFileName("");
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["import_batches"] });

    const summary = await autoGeocodeOrders(
      (inserted ?? []).map((o) => ({ id: o.id, address: o.raw_address })),
    );
    qc.invalidateQueries({ queryKey: ["orders"] });
    if (!summary.configured) toast.error("未設定高德 API Key，地址未解析");
    else toast.success(`地址解析完成：成功 ${summary.ok}${summary.failed ? ` · 失敗 ${summary.failed}` : ""}`);
  };


  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["訂單號", "客戶姓名", "電話", "地址", "訂單內容", "度尺日期", "備註"],
      ["A001", "陳先生", "13800000000", "廣州市天河區某小區1棟101", "紗窗 3 樘", "2026-01-10", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "訂單");
    XLSX.writeFile(wb, "訂單匯入範本.xlsx");
  };

  return (
    <AppShell
      title="Excel 匯入"
      subtitle="批次上載訂單表格"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            下載範本
          </Button>
          <Button size="sm" onClick={save} disabled={saving || rows.length === 0}>
            <Save className="size-4" />
            匯入 {rows.length || ""} 張
          </Button>
        </>
      }
    >
      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center transition-colors hover:border-primary/50">
        <FileSpreadsheet className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{fileName || "點擊上載 Excel（.xlsx / .csv）"}</p>
          <p className="text-xs text-muted-foreground">
            欄位需包含：客戶姓名、地址（其餘可選）
          </p>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) parseFile(f);
          }}
        />
      </label>

      {rows.length > 0 && (
        <div className="mb-6 overflow-auto rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">客戶</th>
                <th className="px-3 py-2">電話</th>
                <th className="px-3 py-2">地址</th>
                <th className="px-3 py-2">內容</th>
                <th className="px-3 py-2">度尺</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{r.customer_name}</td>
                  <td className="tabular px-3 py-2 text-muted-foreground">{r.customer_phone ?? "—"}</td>
                  <td className="max-w-80 truncate px-3 py-2 text-muted-foreground">{r.raw_address}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.order_content ?? "—"}</td>
                  <td className="tabular px-3 py-2 text-muted-foreground">{r.measure_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">只預覽首 50 行…</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 font-display text-sm font-semibold">匯入紀錄</p>
        <div className="space-y-2">
          {batches.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2 text-sm"
            >
              <span className="truncate">{b.file_name}</span>
              <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {b.success_count}/{b.total_count} 成功
                <Badge variant="outline">{b.status}</Badge>
              </span>
            </div>
          ))}
          {batches.length === 0 && <p className="text-xs text-muted-foreground">未有匯入紀錄</p>}
        </div>
      </div>
    </AppShell>
  );
}
