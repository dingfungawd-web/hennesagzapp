import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, MapPin, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { LocationPreview } from "@/components/LocationPreview";
import { LocationFixDialog } from "@/components/LocationFixDialog";
import { geocodeAddresses } from "@/lib/amap.functions";
import { cn } from "@/lib/utils";

type OrderRow = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  raw_address: string;
  normalized_address: string | null;
  latitude: number | null;
  longitude: number | null;
  geo_status: string;
};

const STATUS_META: Record<string, { label: string; variant: "secondary" | "destructive" | "outline" }> = {
  confirmed: { label: "已核对", variant: "secondary" },
  review: { label: "待核对", variant: "destructive" },
  failed: { label: "解析失败", variant: "destructive" },
  pending: { label: "待解析", variant: "outline" },
};

/** 匯入后逐张核对定位：预览缩图 + 修正地址 / 修正定位 */
export function ImportGeoReview({
  orderIds,
  onClose,
  title = "逐张核对定位",
}: {
  orderIds: string[];
  onClose?: () => void;
  title?: string;
}) {
  const [rows, setRows] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [onlyProblem, setOnlyProblem] = useState(true);
  const [fixId, setFixId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (orderIds.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    const all: OrderRow[] = [];
    for (let i = 0; i < orderIds.length; i += 200) {
      const { data } = await supabase
        .from("orders")
        .select(
          "id, customer_name, customer_phone, raw_address, normalized_address, latitude, longitude, geo_status",
        )
        .in("id", orderIds.slice(i, i + 200));
      all.push(...((data ?? []) as OrderRow[]));
    }
    setRows(all);
    setLoading(false);
  }, [orderIds]);

  useEffect(() => {
    void load();
  }, [load]);

  const problem = useMemo(
    () => rows.filter((r) => r.geo_status !== "confirmed"),
    [rows],
  );
  const shown = onlyProblem ? problem : rows;
  const fixTarget = rows.find((r) => r.id === fixId) ?? null;

  const confirmOne = async (id: string) => {
    await supabase.from("orders").update({ geo_status: "confirmed" }).eq("id", id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, geo_status: "confirmed" } : r)));
  };

  return (
    <div className="mb-6 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            共 {rows.length} 张 · 需核对 {problem.length} 张
            {loading ? " · 载入中…" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOnlyProblem((v) => !v)}>
            {onlyProblem ? "显示全部" : "只显示需核对"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
            重新载入
          </Button>
          {onClose && (
            <Button size="sm" onClick={onClose}>
              <CheckCircle2 className="size-4" />
              完成核对
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
        {shown.map((r) => (
          <ReviewCard key={r.id} row={r} onFix={() => setFixId(r.id)} onChanged={load} />
        ))}
        {shown.length === 0 && (
          <p className="rounded border border-border bg-surface p-4 text-center text-xs text-muted-foreground">
            {rows.length === 0 ? "未有需要核对嘅订单" : "全部订单已定位妥当 🎉"}
          </p>
        )}
      </div>

      {fixTarget && (
        <LocationFixDialog
          orderId={fixTarget.id}
          address={fixTarget.raw_address}
          lat={fixTarget.latitude}
          lon={fixTarget.longitude}
          open={Boolean(fixId)}
          onOpenChange={(v) => {
            if (!v) setFixId(null);
          }}
          onSaved={load}
        />
      )}
    </div>
  );
}

function ReviewCard({
  row,
  onFix,
  onChanged,
}: {
  row: OrderRow;
  onFix: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [address, setAddress] = useState(row.raw_address);
  const [busy, setBusy] = useState(false);
  const meta = STATUS_META[row.geo_status] ?? STATUS_META["pending"]!;

  useEffect(() => {
    setAddress(row.raw_address);
  }, [row.raw_address]);

  const reparse = async () => {
    setBusy(true);
    try {
      if (address.trim() !== row.raw_address)
        await supabase.from("orders").update({ raw_address: address.trim() }).eq("id", row.id);
      const res = await geocodeAddresses({ data: { items: [{ id: row.id, address: address.trim() }] } });
      if (!res.configured) {
        toast.error(res.message ?? "未设定高德 API Key");
        return;
      }
      const r = res.results[0];
      if (r?.ok && typeof r.lat === "number" && typeof r.lon === "number") {
        await supabase
          .from("orders")
          .update({
            latitude: r.lat,
            longitude: r.lon,
            normalized_address: r.formatted ?? null,
            geo_status: r.suspect ? "review" : "confirmed",
          })
          .eq("id", row.id);
        toast.success(r.suspect ? "已解析，但区县可能唔一致，请核对" : "已重新解析定位");
      } else {
        await supabase.from("orders").update({ geo_status: "failed" }).eq("id", row.id);
        toast.error("解析失败，请手动修正定位");
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-surface p-3 md:grid-cols-[220px_1fr]">
      <LocationPreview
        lat={row.latitude}
        lon={row.longitude}
        className="h-[140px] w-full rounded-lg border border-border object-cover"
      />
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{row.customer_name}</span>
          {row.customer_phone && (
            <span className="tabular select-text text-xs text-muted-foreground">
              {row.customer_phone}
            </span>
          )}
          <Badge variant={meta.variant} className="text-[10px]">
            {meta.label}
          </Badge>
          {row.geo_status === "review" && (
            <span className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle className="size-3" />
              区县可能唔一致
            </span>
          )}
        </div>
        <Textarea rows={2} value={address} onChange={(e) => setAddress(e.target.value)} />
        <p className="truncate text-xs text-muted-foreground">
          地图实际位置：{row.normalized_address ?? "—"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => void reparse()} disabled={busy}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            储存并重新解析
          </Button>
          <Button size="sm" onClick={onFix}>
            <MapPin className="size-4" />
            核对／修正定位
          </Button>
        </div>
      </div>
    </div>
  );
}

/** 取得所有仍需核对定位的订单 ID（未定位／存疑／失败） */
export async function loadPendingReviewOrderIds(limit = 300) {
  const { data } = await supabase
    .from("orders")
    .select("id")
    .neq("geo_status", "confirmed")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => r.id as string);
}
