/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { Crosshair, MapPin, Minus, Plus, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getGeocodeCandidates, getStaticMap, reverseGeocodePoint } from "@/lib/amap.functions";
import { loadAmap } from "@/lib/amap-loader";
import { supabase } from "@/integrations/supabase/client";

type Candidate = {
  lat: number;
  lon: number;
  formatted: string;
  district: string;
  source: "geocode" | "poi";
  level?: string;
  matched: boolean;
};

type Props = {
  orderId: string;
  address: string;
  lat: number | null;
  lon: number | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
};

const MIN_ZOOM = 4;
const MAX_ZOOM = 19;
/** 静态图默认覆盖嘅地图像素（scale=1，图片像素 === 地图像素） */
const DEFAULT_W = 960;
const DEFAULT_H = 560;


function project(lat: number, lon: number, zoom: number) {
  const worldSize = 256 * 2 ** zoom;
  const x = ((lon + 180) / 360) * worldSize;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
  return { x, y };
}

function unproject(x: number, y: number, zoom: number) {
  const worldSize = 256 * 2 ** zoom;
  const lon = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat, lon };
}

function offsetPoint(
  point: { lat: number; lon: number },
  dx: number,
  dy: number,
  zoom: number,
) {
  const p = project(point.lat, point.lon, zoom);
  return unproject(p.x + dx, p.y + dy, zoom);
}

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

export function LocationFixDialog({
  orderId,
  address,
  lat,
  lon,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const amapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [interactive, setInteractive] = useState(false);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null,
  );
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null,
  );
  const [zoom, setZoom] = useState(16);
  const [nearby, setNearby] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCand, setLoadingCand] = useState(false);
  const [keyword, setKeyword] = useState(address);
  const [saving, setSaving] = useState(false);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapSize, setMapSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [mapLoading, setMapLoading] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [loadedView, setLoadedView] = useState<{
    center: { lat: number; lon: number };
    zoom: number;
  } | null>(null);


  // 尝试用高德 JS API 嵌入真互动地图；失败（例如域名白名单）就用静态图后备。
  const hasPoint = point != null;
  const initedRef = useRef(false);
  useEffect(() => {
    if (!open || !hasPoint || initedRef.current) return;
    initedRef.current = true;
    let cancelled = false;
    const start = point!;
    void (async () => {
      const AMap = (await loadAmap()) as any;
      if (cancelled || !AMap || !containerRef.current) {
        initedRef.current = false;
        return;
      }
      try {
        const map = new AMap.Map(containerRef.current, {
          zoom,
          center: [start.lon, start.lat],
          resizeEnable: true,
});
        const marker = new AMap.Marker({
          position: [start.lon, start.lat],
          draggable: true,
          cursor: "move",
        });
        map.add(marker);
        marker.on("dragend", () => {
          const p = marker.getPosition();
          setPoint({ lat: p.getLat(), lon: p.getLng() });
        });
        amapRef.current = map;
        markerRef.current = marker;
        setInteractive(true);
      } catch {
        initedRef.current = false;
        setInteractive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, hasPoint]);

  // 关闭对话框时清走地图实例
  useEffect(() => {
    if (open) return;
    try {
      amapRef.current?.destroy?.();
    } catch {
      /* ignore */
    }
    amapRef.current = null;
    markerRef.current = null;
    initedRef.current = false;
    setInteractive(false);
  }, [open]);

  // 互动地图存在时，选点变更（例如撳候选）同步过去；地图中心只喺拣候选时先跟住郁
  useEffect(() => {
    if (!interactive || !point) return;
    markerRef.current?.setPosition?.([point.lon, point.lat]);
  }, [interactive, point]);

  useEffect(() => {
    if (!interactive || !center) return;
    amapRef.current?.setCenter?.([center.lon, center.lat]);
  }, [interactive, center]);


  // 静态图后备：跟住 center / zoom 载入
  useEffect(() => {
    if (!open || interactive || !center) return;
    let cancelled = false;
    setMapLoading(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await getStaticMap({
            data: { lat: center.lat, lon: center.lon, zoom, marker: false },
          });
          if (cancelled) return;
          setMapUrl(result.url);
          setMapSize({ w: result.width ?? DEFAULT_W, h: result.height ?? DEFAULT_H });
          setMapFailed(!result.url);
          if (result.url) setLoadedView({ center, zoom });
        } catch {
          if (!cancelled) {
            setMapUrl(null);
            setMapFailed(true);
          }
        } finally {
          if (!cancelled) setMapLoading(false);
        }
      })();
    }, 90);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, interactive, center, zoom]);

  useEffect(() => {
    if (!open) return;
    const p = lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null;
    setPoint(p);
    setCenter(p);
    setZoom(16);
  }, [open, lat, lon]);

  // 反查地址核对
  useEffect(() => {
    if (!open || !point) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await reverseGeocodePoint({ data: { lat: point.lat, lon: point.lon } });
      if (!cancelled) setNearby(res.formatted);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [point, open]);

  const search = async (q: string) => {
    if (!q.trim()) return;
    setLoadingCand(true);
    try {
      const res = await getGeocodeCandidates({ data: { address: q.trim() } });
      if (!res.configured) {
        toast.error(res.message ?? "未设定高德 API Key");
        setCandidates([]);
        return;
      }
      setCandidates(res.candidates as Candidate[]);
      if (res.candidates.length === 0) toast.info("搵唔到候选地点，可以直接喺地图上撳低位置");
    } finally {
      setLoadingCand(false);
    }
  };

  useEffect(() => {
    if (open) {
      setKeyword(address);
      void search(address);
    }
  }, [open, address]);

  const pick = (c: Candidate) => {
    setPoint({ lat: c.lat, lon: c.lon });
    setCenter({ lat: c.lat, lon: c.lon });
  };

  const draggingRef = useRef({ active: false, x: 0, y: 0 });
  const pinDragRef = useRef(false);

  /** 图片显示尺寸 ↔ 地图像素换算：图片係 object-fill，故此按容器阔高线性对应 */
  const toMapPx = (rect: DOMRect, clientX: number, clientY: number) => ({
    dx: ((clientX - rect.left) / rect.width - 0.5) * mapSize.w,
    dy: ((clientY - rect.top) / rect.height - 0.5) * mapSize.h,
  });

  const onPointerDown = (e: MouseEvent<HTMLDivElement>) => {
    if (pinDragRef.current) return;
    draggingRef.current = { active: true, x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!center) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (pinDragRef.current) {
      const { dx, dy } = toMapPx(rect, e.clientX, e.clientY);
      setPoint(offsetPoint(center, dx, dy, zoom));
      return;
    }
    const d = draggingRef.current;
    if (!d.active) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) < 2) return;
    d.x = e.clientX;
    d.y = e.clientY;
    setCenter(
      offsetPoint(center, (-dx / rect.width) * mapSize.w, (-dy / rect.height) * mapSize.h, zoom),
    );
  };

  const endDrag = () => {
    draggingRef.current.active = false;
    pinDragRef.current = false;
  };

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => clampZoom(z + delta));
  }, []);

  /** 以游标为锚点缩放：游标下嘅位置保持唔郁 */
  const zoomAtRef = useRef<(nextZoom: number, dx: number, dy: number) => void>(() => {});
  zoomAtRef.current = (nextZoom, dx, dy) => {
    const z = clampZoom(nextZoom);
    if (!center || z === zoom) {
      setZoom(z);
      return;
    }
    // 游标喺旧 zoom 对应嘅地理点，喺新 zoom 之下要留返喺同一屏幕位置
    const anchor = offsetPoint(center, dx, dy, zoom);
    const a = project(anchor.lat, anchor.lon, z);
    const nc = unproject(a.x - dx, a.y - dy, z);
    setCenter({ lat: nc.lat, lon: nc.lon });
    setZoom(z);
  };

  // 滚轮／触控板缩放（非 passive，先至可以阻止页面滚动同页面级 pinch）
  useEffect(() => {
    const el = overlayRef.current;
    if (!el || interactive) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const dyRaw = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - rect.left) / rect.width - 0.5) * mapSize.w;
      const dy = ((e.clientY - rect.top) / rect.height - 0.5) * mapSize.h;
      zoomAtRef.current(zoom - dyRaw * 0.004, dx, dy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [interactive, open, mapUrl, zoom, mapSize.w, mapSize.h]);


  /** 未等到新图返嚟之前，用 CSS transform 即时预览缩放／平移，减少「反应慢」感觉 */
  const imgTransform = (() => {
    if (!center || !loadedView) return undefined;
    const scale = 2 ** (zoom - loadedView.zoom);
    const c = project(center.lat, center.lon, zoom);
    const l = project(loadedView.center.lat, loadedView.center.lon, zoom);
    const tx = l.x - c.x;
    const ty = l.y - c.y;
    if (scale === 1 && tx === 0 && ty === 0) return undefined;
    return `translate(${tx}px, ${ty}px) scale(${scale})`;
  })();

  // 静态图上嘅针位（相对容器百分比）
  const markerPos = (() => {
    if (!center || !point) return null;
    const c = project(center.lat, center.lon, zoom);
    const p = project(point.lat, point.lon, zoom);
    const left = 50 + ((p.x - c.x) / mapSize.w) * 100;
    const top = 50 + ((p.y - c.y) / mapSize.h) * 100;

    if (left < -5 || left > 105 || top < -5 || top > 105) return null;
    return { left, top };
  })();

  const save = async () => {
    if (!point) {
      toast.error("请先喺地图上拣位置");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .update({
        latitude: point.lat,
        longitude: point.lon,
        normalized_address: nearby || null,
        geo_status: "confirmed",
      })
      .eq("id", orderId);
    setSaving(false);
    if (error) {
      toast.error("储存失败：" + error.message);
      return;
    }
    toast.success("已修正定位");
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[96vw] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>核对／修正定位</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">订单地址：{address}</p>

        <div className="flex gap-2">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void search(keyword);
            }}
            placeholder="搜寻地址／小区名（可加上区县，例如 番禺区 越秀万博）"
          />
          <Button variant="outline" onClick={() => void search(keyword)} disabled={loadingCand}>
            <Search className="size-4" />
            搜寻
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_260px]">
          <div className="relative aspect-[12/7] w-full overflow-hidden rounded-lg border border-border bg-surface">
            {/* 高德 JS 地图容器；载入唔到就用下面嘅静态图 */}
            <div ref={containerRef} className="absolute inset-0 h-full w-full" />

            {!interactive && (
              <div
                ref={overlayRef}
                className="absolute inset-0 select-none"
                onMouseDown={onPointerDown}
                onMouseMove={onPointerMove}
                onMouseUp={endDrag}
                onMouseLeave={endDrag}
                onClick={pickOnMap}
                style={{ cursor: mapUrl ? "crosshair" : "default", touchAction: "none" }}
              >

                {mapUrl ? (
                  <>
                    <img
                      src={mapUrl}
                      alt="可点击修正的订单定位地图"
                      draggable={false}
                      className="pointer-events-none h-full w-full object-fill"
                    />
                    {markerPos && (
                      <MapPin
                        className="pointer-events-none absolute size-7 -translate-x-1/2 -translate-y-full fill-primary text-primary drop-shadow"
                        style={{ left: `${markerPos.left}%`, top: `${markerPos.top}%` }}
                      />
                    )}
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
                    {mapLoading
                      ? "地图载入中…"
                      : mapFailed
                        ? "地图暂时无法载入，请先选择右方候选地点"
                        : "请先选择一个候选地点"}
                  </div>
                )}

                <div className="absolute right-2 top-2 flex flex-col gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-8"
                    aria-label="放大"
                    onClick={(e) => {
                      e.stopPropagation();
                      zoomBy(1);
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="size-8"
                    aria-label="缩小"
                    onClick={(e) => {
                      e.stopPropagation();
                      zoomBy(-1);
                    }}
                  >
                    <Minus className="size-4" />
                  </Button>
                </div>
                {mapUrl && (
                  <span className="absolute bottom-2 left-2 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    撳地图放针 · 拖曳平移 · 滚轮／±缩放（zoom {Math.round(zoom)}）
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="max-h-[360px] space-y-1.5 overflow-auto pr-1">
            {candidates.length === 0 && (
              <div className="text-xs text-muted-foreground">
                {loadingCand ? "搜寻中…" : "冇候选结果，可直接喺地图撳低正确位置。"}
              </div>
            )}
            {candidates.map((c, i) => (
              <button
                key={`${c.lat}-${c.lon}-${i}`}
                type="button"
                onClick={() => pick(c)}
                className="w-full rounded border border-border bg-surface p-2 text-left hover:border-primary"
              >
                <p className="flex items-center gap-1.5 text-xs">
                  <MapPin className="size-3 shrink-0 text-primary" />
                  <span className="truncate">{c.formatted}</span>
                </p>
                <p className="mt-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {c.district || "—"}
                  </Badge>
                  <Badge variant={c.matched ? "secondary" : "destructive"} className="text-[10px]">
                    {c.matched ? "区县吻合" : "区县唔一致"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {c.source === "poi" ? "地点搜寻" : c.level || "地址解析"}
                  </span>
                </p>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded border border-border bg-surface p-2 text-xs">
          <p className="flex items-center gap-1.5">
            <Crosshair className="size-3.5 text-primary" />
            现时选点：
            {point ? `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}` : "未选"}
          </p>
          <p className="mt-1 text-muted-foreground">地图实际位置：{nearby || "—"}</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={save} disabled={saving || !point}>
            储存定位
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
