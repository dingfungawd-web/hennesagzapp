import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Eye, EyeOff, Flag, MapPin, Navigation, Phone, Route as RouteIcon, Users, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { supabase } from "@/integrations/supabase/client";
import { useOrders, useTeams } from "@/lib/queries";
import { drivingDuration } from "@/lib/amap.functions";
import { formatTimeRange, isUpcoming, STATUS_LABEL, type Order } from "@/lib/domain";


export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "地图路线 — 汉纱排程调度台" },
      {
        name: "description",
        content: "高德地图检视所有已定位订单，设定起点终点即时计算驾车时间与距离。",
      },
      { property: "og:title", content: "地图路线 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "高德地图检视所有已定位订单，设定起点终点即时计算驾车时间与距离。",
      },
    ],
  }),
  component: MapPage,
});

declare global {
  interface Window {
    AMap?: unknown;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}

function MapPage() {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [origin, setOrigin] = useState<Order | null>(null);
  const [dest, setDest] = useState<Order | null>(null);
  const [routeText, setRouteText] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const { data: orders = [] } = useOrders();
  const { data: teams = [] } = useTeams();
  const qc = useQueryClient();

  const [draft, setDraft] = useState<Order | null>(null);
  const [dDate, setDDate] = useState("");
  const [dTime, setDTime] = useState<string | null>(null);
  const [dTeam, setDTeam] = useState("none");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const openSchedule = (o: Order) => {
    setDraft(o);
    setDDate(o.install_date ?? "");
    setDTime(o.install_time ?? null);
    setDTeam(o.team_id ?? "none");
  };

  const saveSchedule = async () => {
    if (!draft) return;
    if (!dDate) {
      toast.error("请拣安装日期");
      return;
    }
    setSavingSchedule(true);
    const { error } = await supabase
      .from("orders")
      .update({
        install_date: dDate,
        install_time: dTime,
        team_id: dTeam === "none" ? null : dTeam,
        status: "scheduled",
      })
      .eq("id", draft.id);
    setSavingSchedule(false);
    if (error) {
      toast.error("排期失败");
      return;
    }
    qc.invalidateQueries({ queryKey: ["orders"] });
    toast.success("已确定排期");
    setDraft(null);
  };

  const cancelSchedule = async (o: Order) => {
    const { error } = await supabase
      .from("orders")
      .update({ install_date: null, install_time: null, team_id: null, status: "unscheduled" })
      .eq("id", o.id);
    if (error) {
      toast.error("取消失败");
      return;
    }
    qc.invalidateQueries({ queryKey: ["orders"] });
    toast.success("已取消约期");
    setDraft(null);
  };

  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const hiddenCount = Object.values(hidden).filter(Boolean).length;

  const located = orders.filter(
    (o) => o.latitude && o.longitude && isUpcoming(o) && !hidden[o.id],
  );


  useEffect(() => {
    let cancelled = false;
    (async () => {
      const jsKey = import.meta.env["VITE_AMAP_JS_KEY"] as string | undefined;
      const securityCode = import.meta.env["VITE_AMAP_JS_SECURITY_CODE"] as string | undefined;
      if (cancelled) return;
      setConfigured(Boolean(jsKey));
      if (!jsKey) return;
      if (securityCode) {
        window._AMapSecurityConfig = { securityJsCode: securityCode };
      }
      if (!window.AMap) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = `https://webapi.amap.com/maps?v=2.0&key=${jsKey}`;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("地图载入失败"));
          document.head.appendChild(s);
        }).catch(() => toast.error("高德地图载入失败"));
      }
      if (cancelled || !mapEl.current || !window.AMap) return;
      const AMap = window.AMap as any;
      mapRef.current = new AMap.Map(mapEl.current, {
        zoom: 11,
        center: [113.264, 23.129],
        mapStyle: "amap://styles/dark",
      });
      setReady(true);
      setTimeout(() => mapRef.current?.resize?.(), 200);
      const onResize = () => mapRef.current?.resize?.();
      window.addEventListener("resize", onResize);

    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const originRef = useRef<Order | null>(null);
  const destRef = useRef<Order | null>(null);
  const infoRef = useRef<any>(null);
  useEffect(() => {
    originRef.current = origin;
  }, [origin]);
  useEffect(() => {
    destRef.current = dest;
  }, [dest]);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.AMap) return;
    const AMap = window.AMap as any;
    mapRef.current.clearMap();
    if (!infoRef.current) {
      infoRef.current = new AMap.InfoWindow({
        isCustom: true,
        autoMove: false,
        offset: new AMap.Pixel(0, -32),
      });
    }
    const markers = located.map((o) => {
      const isScheduled = o.status !== "unscheduled";
      const marker = new AMap.Marker({
        position: [Number(o.longitude), Number(o.latitude)],
        offset: new AMap.Pixel(-11, -11),
        content: isScheduled
          ? `<div style="width:22px;height:22px;border-radius:4px;background:#38bdf8;border:2px solid #0f172a;box-shadow:0 0 0 1px #38bdf8;display:flex;align-items:center;justify-content:center;color:#0f172a;font-size:11px;font-weight:700">约</div>`
          : `<div style="width:22px;height:22px;border-radius:9999px;background:#f59e0b;border:2px solid #0f172a;box-shadow:0 0 0 1px #f59e0b"></div>`,
      });
      marker.on("click", () => {
        if (!destRef.current) setDest(o);
        else if (!originRef.current) setOrigin(o);
      });
      marker.on("mouseover", () => {
        infoRef.current.setContent(
          `<div style="max-width:260px;padding:8px 10px;border-radius:8px;background:#111827;color:#f8fafc;border:1px solid #334155;font-size:12px;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.4)">
             <div style="font-weight:600;margin-bottom:2px">${escapeHtml(o.customer_name ?? "")}</div>
             <div style="color:#cbd5e1">${escapeHtml(o.raw_address ?? "")}</div>
             ${o.customer_phone ? `<div style="color:#fbbf24;margin-top:2px">☎ ${escapeHtml(o.customer_phone)}</div>` : ""}
             ${o.install_date ? `<div style="color:#94a3b8;margin-top:2px">${escapeHtml(o.install_date)} ${escapeHtml(formatTimeRange(o.install_time))}</div>` : ""}
           </div>`,
        );
        infoRef.current.open(mapRef.current, marker.getPosition());
      });
      marker.on("mouseout", () => infoRef.current?.close());
      return marker;
    });
    if (markers.length) {
      mapRef.current.add(markers);
      mapRef.current.setFitView(markers, false, [60, 60, 60, 60]);
    }
  }, [ready, located.map((o) => `${o.id}:${o.status}`).join(",")]);

  const focus = (o: Order) => {
    if (mapRef.current && o.latitude && o.longitude) {
      mapRef.current.setZoomAndCenter(15, [Number(o.longitude), Number(o.latitude)]);
    }
  };

  const calcRoute = async () => {
    if (!origin || !dest) {
      toast.error("请先设定起点同终点");
      return;
    }
    setCalculating(true);
    const res = await drivingDuration({
      data: {
        originLat: Number(origin.latitude),
        originLon: Number(origin.longitude),
        destLat: Number(dest.latitude),
        destLon: Number(dest.longitude),
      },
    });
    setCalculating(false);
    if (res.success && res.text) {
      setRouteText(res.text);
    } else {
      toast.error(res.message ?? "计算失败");
    }
  };

  return (
    <AppShell
      title="地图路线"
      subtitle={`显示 ${located.length} 张（未约＋今天或之后已约）${hiddenCount ? ` · 已隐藏 ${hiddenCount}` : ""}`}
      actions={
        <div className="flex gap-2">
          {hiddenCount > 0 && (
            <Button size="sm" variant="outline" onClick={() => setHidden({})}>
              <Eye className="size-4" />
              取消隐藏（{hiddenCount}）
            </Button>
          )}
          <Button size="sm" onClick={calcRoute} disabled={calculating || !origin || !dest}>
            <RouteIcon className="size-4" />
            {calculating ? "计算中…" : "计算驾车时间"}
          </Button>
        </div>
      }
    >
      {configured === false && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          未设定高德地图 JS Key，地图无法显示。请提供 VITE_AMAP_JS_KEY 后再试。
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-border bg-card">
          <div className="space-y-2 border-b border-border p-3">
            <RoutePoint label="起点" order={origin} onClear={() => setOrigin(null)} />
            <RoutePoint label="终点" order={dest} onClear={() => setDest(null)} />
            {routeText && (
              <div className="rounded border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                {routeText}
              </div>
            )}
          </div>
          <div className="max-h-[62vh] overflow-auto p-2">
            {located.map((o) => (
              <div
                key={o.id}
                className="rounded p-2 transition-colors hover:bg-accent/40"
              >
                <button className="w-full text-left" onClick={() => focus(o)}>
                  <p className="truncate text-sm font-medium">
                    {o.customer_name}
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      {STATUS_LABEL[o.status] ?? o.status}
                    </Badge>
                  </p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{o.raw_address}</p>
                </button>
                {o.customer_phone && (
                  <a
                    href={`tel:${o.customer_phone}`}
                    className="mt-0.5 inline-flex items-center gap-1 font-display text-xs text-primary hover:underline"
                  >
                    <Phone className="size-3" />
                    {o.customer_phone}
                  </a>
                )}
                {o.install_date && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {o.install_date} {formatTimeRange(o.install_time)}
                  </p>
                )}
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant={origin?.id === o.id ? "default" : "outline"}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setOrigin(o)}
                  >
                    <Navigation className="size-3" />
                    设起点
                  </Button>
                  <Button
                    size="sm"
                    variant={dest?.id === o.id ? "default" : "outline"}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setDest(o)}
                  >
                    <Flag className="size-3" />
                    设终点
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 text-xs"
                    onClick={() => openSchedule(o)}
                  >
                    <CalendarPlus className="size-3" />
                    {o.status === "unscheduled" ? "排期" : "改期"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    title="隐藏（更新页面后回复）"
                    onClick={() => setHidden((h) => ({ ...h, [o.id]: true }))}
                  >
                    <EyeOff className="size-3" />
                  </Button>
                </div>
              </div>
            ))}
            {located.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                未有已定位订单，先去订单列表做地址解析。
              </p>
            )}
          </div>
        </aside>

        <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border border-border bg-surface">
          <div ref={mapEl} style={{ width: "100%", height: "100%" }} />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">地图载入中…</span>
            </div>
          )}
        </div>

      </div>

      <Dialog open={!!draft} onOpenChange={(v) => !v && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确定排期</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="rounded border border-border bg-surface p-3 text-sm">
                <p className="font-medium">{draft.customer_name}</p>
                <p className="text-xs text-muted-foreground">{draft.raw_address}</p>
                {draft.customer_phone && (
                  <a
                    href={`tel:${draft.customer_phone}`}
                    className="mt-1 inline-flex items-center gap-1 font-display text-xs text-primary hover:underline"
                  >
                    <Phone className="size-3" />
                    {draft.customer_phone}
                  </a>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">安装日期</p>
                <Input type="date" value={dDate} onChange={(e) => setDDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">到达时段</p>
                <TimeRangeSelect value={dTime} onChange={setDTime} />
              </div>
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">安装队伍</p>
                <Select value={dTeam} onValueChange={setDTeam}>
                  <SelectTrigger>
                    <SelectValue placeholder="未分配" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">未分配</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="flex items-center gap-2">
                          <Users className="size-3.5" />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.status === "scheduled" ? (
              <Button variant="outline" onClick={() => draft && cancelSchedule(draft)}>
                <X className="size-4" />
                取消约期
              </Button>
            ) : (
              <span />
            )}
            <Button onClick={saveSchedule} disabled={savingSchedule}>
              <CalendarPlus className="size-4" />
              确定排期
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>

  );
}

function RoutePoint({
  label,
  order,
  onClear,
}: {
  label: string;
  order: Order | null;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded border border-border bg-surface px-3 py-2">
      <Badge variant="outline" className="shrink-0">
        {label}
      </Badge>
      <span className="min-w-0 flex-1 truncate text-xs">
        {order
          ? `${order.customer_name} · ${order.raw_address}${order.customer_phone ? ` · ${order.customer_phone}` : ""}`
          : "未设定"}
      </span>
      {order && (
        <button className="text-xs text-muted-foreground hover:text-foreground" onClick={onClear}>
          清除
        </button>
      )}
      {!order && <MapPin className="size-3.5 text-muted-foreground" />}
    </div>
  );
}
