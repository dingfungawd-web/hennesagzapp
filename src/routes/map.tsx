import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Flag, MapPin, Navigation, Route as RouteIcon } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useOrders } from "@/lib/queries";
import { getAmapConfig, drivingDuration } from "@/lib/amap.functions";
import type { Order } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/map")({
  head: () => ({
    meta: [
      { title: "地圖路線 — 漢紗排程調度台" },
      {
        name: "description",
        content: "高德地圖檢視所有已定位訂單，設定起點終點即時計算駕車時間與距離。",
      },
      { property: "og:title", content: "地圖路線 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "高德地圖檢視所有已定位訂單，設定起點終點即時計算駕車時間與距離。",
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

  const located = orders.filter((o) => o.latitude && o.longitude);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await getAmapConfig();
      if (cancelled) return;
      setConfigured(cfg.configured);
      if (!cfg.configured) return;
      if (cfg.securityCode) window._AMapSecurityConfig = { securityJsCode: cfg.securityCode };
      if (!window.AMap) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = `https://webapi.amap.com/maps?v=2.0&key=${cfg.jsKey}`;
          s.async = true;
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("地圖載入失敗"));
          document.head.appendChild(s);
        }).catch(() => toast.error("高德地圖載入失敗"));
      }
      if (cancelled || !mapEl.current || !window.AMap) return;
      const AMap = window.AMap as any;
      mapRef.current = new AMap.Map(mapEl.current, {
        zoom: 11,
        center: [113.264, 23.129],
        mapStyle: "amap://styles/dark",
      });
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current || !window.AMap) return;
    const AMap = window.AMap as any;
    mapRef.current.clearMap();
    const markers = located.map((o) => {
      const marker = new AMap.Marker({
        position: [Number(o.longitude), Number(o.latitude)],
        title: `${o.customer_name} · ${o.raw_address}`,
      });
      marker.on("click", () => setDest(o));
      return marker;
    });
    if (markers.length) {
      mapRef.current.add(markers);
      mapRef.current.setFitView(markers, false, [60, 60, 60, 60]);
    }
  }, [ready, located.length]);

  const focus = (o: Order) => {
    if (mapRef.current && o.latitude && o.longitude) {
      mapRef.current.setZoomAndCenter(15, [Number(o.longitude), Number(o.latitude)]);
    }
  };

  const calcRoute = async () => {
    if (!origin || !dest) {
      toast.error("請先設定起點同終點");
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
      toast.error(res.message ?? "計算失敗");
    }
  };

  return (
    <AppShell
      title="地圖路線"
      subtitle={`${located.length} / ${orders.length} 張訂單已定位`}
      actions={
        <Button size="sm" onClick={calcRoute} disabled={calculating || !origin || !dest}>
          <RouteIcon className="size-4" />
          {calculating ? "計算中…" : "計算駕車時間"}
        </Button>
      }
    >
      {configured === false && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          未設定高德地圖 JS Key，地圖無法顯示。請提供 AMAP_JS_KEY 後再試。
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border border-border bg-card">
          <div className="space-y-2 border-b border-border p-3">
            <RoutePoint label="起點" order={origin} onClear={() => setOrigin(null)} />
            <RoutePoint label="終點" order={dest} onClear={() => setDest(null)} />
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
                  <p className="truncate text-sm font-medium">{o.customer_name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{o.raw_address}</p>
                </button>
                <div className="mt-1.5 flex gap-1.5">
                  <Button
                    size="sm"
                    variant={origin?.id === o.id ? "default" : "outline"}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setOrigin(o)}
                  >
                    <Navigation className="size-3" />
                    設起點
                  </Button>
                  <Button
                    size="sm"
                    variant={dest?.id === o.id ? "default" : "outline"}
                    className="h-7 flex-1 text-xs"
                    onClick={() => setDest(o)}
                  >
                    <Flag className="size-3" />
                    設終點
                  </Button>
                </div>
              </div>
            ))}
            {located.length === 0 && (
              <p className="p-4 text-center text-xs text-muted-foreground">
                未有已定位訂單，先去訂單列表做地址解析。
              </p>
            )}
          </div>
        </aside>

        <div className="relative h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border border-border bg-surface">
          <div ref={mapEl} className="absolute inset-0" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">地圖載入中…</span>
            </div>
          )}
        </div>

      </div>
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
        {order ? `${order.customer_name} · ${order.raw_address}` : "未設定"}
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
