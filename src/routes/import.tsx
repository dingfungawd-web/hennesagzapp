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
import { shiftTime, isUpcoming } from "@/lib/domain";
import { useImportBatches } from "@/lib/queries";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Excel 汇入 — 汉纱排程调度台" },
      {
        name: "description",
        content: "上载 Excel 订单表，自动对应栏位并批次建立安装订单，附汇入批次纪录。",
      },
      { property: "og:title", content: "Excel 汇入 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "上载 Excel 订单表，自动对应栏位并批次建立安装订单，附汇入批次纪录。",
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
  install_date: string | null;
  install_time: string | null;
  status: string;
  order_type: string;
  deposit_date: string | null;
  /** 只用于预览／排序，唔会写入资料库 */
  followup_date: string | null;
  followup_time: string | null;
};

type ImportType = "install" | "followup";

const HEADER_MAP: Record<string, keyof Row> = {
  订单号: "order_no",
  訂單號: "order_no",
  工程编号: "order_no",
  工程編號: "order_no",
  客户姓名: "customer_name",
  客戶姓名: "customer_name",
  姓名: "customer_name",
  电话: "customer_phone",
  電話: "customer_phone",
  联络电话: "customer_phone",
  聯絡電話: "customer_phone",
  地址: "raw_address",
  客户地址: "raw_address",
  客戶地址: "raw_address",
  单位: "raw_address",
  單位: "raw_address",
  订单内容: "order_content",
  訂單內容: "order_content",
  度尺日期: "measure_date",
  收订日期: "deposit_date",
  收訂日期: "deposit_date",
  安装日期: "install_date",
  安裝日期: "install_date",
  跟进日期: "followup_date",
  跟進日期: "followup_date",
  备注: "notes",
  備註: "notes",
};

const SURNAME_KEYS = new Set(["客户姓氏", "客戶姓氏"]);
const TITLE_KEYS = new Set(["客户称呼", "客戶稱呼"]);
const DISTRICT_KEYS = new Set(["地区", "地區"]);

/** 这些栏位属于资料栏，其余数字栏视为产品数量 */
const NON_PRODUCT_KEYS = new Set([
  ...Object.keys(HEADER_MAP),
  ...SURNAME_KEYS,
  ...TITLE_KEYS,
  ...DISTRICT_KEYS,
  "接单日期",
  "接單日期",
  "接单同事",
  "接單同事",
  "订金",
  "訂金",
  "订金收款方式",
  "訂金收款方式",
  "已付余款",
  "已付餘款",
  "已付余款方式",
  "已付餘款方式",
  "跟进余款",
  "跟進餘款",
  "跟进余款方式",
  "跟進餘款方式",
  "余款",
  "餘款",
  "营业额",
  "營業額",
  "全付折扣",
  "全单折扣",
  "全單折扣",
  "保养费",
  "保養費",
  "保养日期",
  "保養日期",
  "生意来源",
  "生意來源",
  "度尺人",
  "安装同事",
  "安裝同事",
  "Invitation Date",
  "Score",
]);

function normalizeDate(v: unknown): string | null {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    return `${y}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return null;
  const date = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return date === "1970-01-01" ? null : date;
}

function normalizeTime(v: unknown): string | null {
  if (!v) return null;
  let hh: number;
  let mm: number;
  if (v instanceof Date) {
    hh = v.getHours();
    mm = v.getMinutes();
  } else {
    const m = String(v).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    hh = Number(m[1]);
    mm = Number(m[2]);
  }
  if (hh === 0 && mm === 0) return null;
  const start = `${String(hh).padStart(2, "0")}:${mm >= 30 ? "30" : "00"}`;
  return `${start}-${shiftTime(start, 2)}`;
}

/** 按今次汇入嘅单类型，决定用跟进日期定安装日期做排期日期 */
function applyType(r: Row, type: ImportType): Row {
  const date = type === "followup" ? r.followup_date : r.install_date;
  const time = type === "followup" ? r.followup_time : r.install_time;
  return {
    ...r,
    order_type: type,
    install_date: date,
    install_time: date ? time : null,
    status: date ? "scheduled" : "unscheduled",
  };
}

function ImportPage() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [importType, setImportType] = useState<ImportType>("followup");
  const [fileName, setFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const { data: batches = [] } = useImportBatches();

  const parseFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    // cellStyles is required for SheetJS to retain Excel row visibility metadata.
    const wb = XLSX.read(buf, { cellDates: true, cellStyles: true });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) {
      toast.error("Excel 冇工作表");
      return;
    }
    const sheet = wb.Sheets[sheetName];
    if (!sheet) {
      toast.error("读取工作表失败");
      return;
    }
    // Respect both manually hidden rows and rows hidden by a saved Excel filter.
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      skipHidden: true,
    });
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
        install_date: null,
        install_time: null,
        status: "unscheduled",
        order_type: "install",
        deposit_date: null,
        followup_date: null,
        followup_time: null,
      };
      let surname = "";
      let title = "";
      let district = "";
      const products: string[] = [];

      for (const [rawKey, value] of Object.entries(raw)) {
        const key = rawKey.trim();
        const field = HEADER_MAP[key];
        if (SURNAME_KEYS.has(key)) surname = String(value ?? "").trim();
        else if (TITLE_KEYS.has(key)) title = String(value ?? "").trim();
        else if (DISTRICT_KEYS.has(key)) district = String(value ?? "").trim();
        else if (!field && !NON_PRODUCT_KEYS.has(key)) {
          const n = Number(String(value ?? "").trim());
          if (Number.isFinite(n) && n > 0) products.push(`${key} x${n}`);
        }
        if (!field) continue;
        if (field === "measure_date") row.measure_date = normalizeDate(value);
        else if (field === "deposit_date") row.deposit_date = normalizeDate(value);
        else if (field === "install_date") {
          row.install_date = normalizeDate(value);
          row.install_time = row.install_date ? normalizeTime(value) : null;
        } else if (field === "followup_date") {
          row.followup_date = normalizeDate(value);
          row.followup_time = row.followup_date ? normalizeTime(value) : null;
        } else if (field === "customer_name" || field === "raw_address")
          row[field] = String(value ?? "").trim();
        else if (field === "status" || field === "order_type") continue;
        else row[field] = String(value ?? "").trim() || null;

      }

      if (!row.customer_name) row.customer_name = `${surname}${title}`.trim();
      if (row.raw_address && district && !row.raw_address.includes(district))
        row.raw_address = `${district} ${row.raw_address}`;
      if (!row.order_content && products.length) row.order_content = products.join("、");


      if (row.customer_name && row.raw_address) parsed.push(row);
    }
    setFileName(file.name);
    setRows(parsed);
    toast.success(`解析到 ${parsed.length} 行有效资料`);
  };


  const finalRows = useMemo(() => {
    const list = rows.map((r) => applyType(r, importType));
    return list.sort((a, b) => (a.install_date ?? "9999").localeCompare(b.install_date ?? "9999"));
  }, [rows, importType]);

  const save = async () => {
    if (finalRows.length === 0) return;
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
      toast.error("建立汇入批次失败");
      return;
    }
    const inserted: { id: string; raw_address: string; status: string; install_date: string | null }[] = [];
    let error: { message: string } | null = null;
    for (let i = 0; i < rows.length; i += 300) {
      const chunk = rows.slice(i, i + 300).map((r) => ({ ...r, import_batch_id: batch.id }));
      const res = await supabase.from("orders").insert(chunk).select("id, raw_address, status, install_date");
      if (res.error) {
        error = res.error;
        break;
      }
      inserted.push(...(res.data ?? []));
    }
    await supabase
      .from("import_batches")
      .update({
        status: error ? "failed" : "completed",
        success_count: inserted.length,
        failed_count: rows.length - inserted.length,
      })
      .eq("id", batch.id);
    setSaving(false);
    if (error) {
      toast.error("汇入失败：" + error.message);
      return;
    }
    toast.success(`已汇入 ${rows.length} 张订单，正在自动解析地址…`);

    setRows([]);
    setFileName("");
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["import_batches"] });

    const summary = await autoGeocodeOrders(
      inserted.filter(isUpcoming).map((o) => ({ id: o.id, address: o.raw_address })),
      (done, total) => setProgress(`地址解析中… ${done}/${total}`),
    );
    setProgress("");
    qc.invalidateQueries({ queryKey: ["orders"] });
    if (!summary.configured) toast.error("未设定高德 API Key，地址未解析");
    else toast.success(`地址解析完成：成功 ${summary.ok}${summary.failed ? ` · 失败 ${summary.failed}` : ""}`);
  };


  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["订单号", "客户姓名", "电话", "地址", "订单内容", "度尺日期", "备注"],
      ["A001", "陈先生", "13800000000", "广州市天河区某小区1栋101", "纱窗 3 樘", "2026-01-10", ""],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "订单");
    XLSX.writeFile(wb, "订单汇入范本.xlsx");
  };

  return (
    <AppShell
      title="Excel 汇入"
      subtitle="批次上载订单表格"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            下载范本
          </Button>
          <Button size="sm" onClick={save} disabled={saving || rows.length === 0}>
            <Save className="size-4" />
            {progress || `汇入 ${rows.length || ""} 张`}
          </Button>
        </>
      }
    >
      <label className="mb-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card p-10 text-center transition-colors hover:border-primary/50">
        <FileSpreadsheet className="size-8 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">{fileName || "点击上载 Excel（.xlsx / .csv）"}</p>
          <p className="text-xs text-muted-foreground">
            栏位需包含：客户姓名、地址（只汇入 Excel 内可见的资料行）
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
                <th className="px-3 py-2">客户</th>
                <th className="px-3 py-2">电话</th>
                <th className="px-3 py-2">地址</th>
                <th className="px-3 py-2">内容</th>
                <th className="px-3 py-2">度尺</th>
                <th className="px-3 py-2">安装</th>
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
                  <td className="tabular px-3 py-2 text-muted-foreground">
                    {r.install_date ? `${r.install_date}${r.install_time ? ` ${r.install_time}` : ""}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 50 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">只预览首 50 行…</p>
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 font-display text-sm font-semibold">汇入纪录</p>
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
          {batches.length === 0 && <p className="text-xs text-muted-foreground">未有汇入纪录</p>}
        </div>
      </div>
    </AppShell>
  );
}
