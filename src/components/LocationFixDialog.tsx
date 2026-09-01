import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Crosshair, MapPin, Search } from "lucide-react";
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

const MAP_ZOOM = 16;

function movePointByPixels(
  point: { lat: number; lon: number },
  offsetX: number,
  offsetY: number,
  zoom: number,
) {
  const worldSize = 256 * 2 ** zoom;
  const x = ((point.lon + 180) / 360) * worldSize + offsetX;
  const sinLat = Math.sin((point.lat * Math.PI) / 180);
  const y =
    (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize +
    offsetY;
  const lon = (x / worldSize) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const nextLat = (180 / Math.PI) * Math.atan(Math.sinh(n));
  return { lat: nextLat, lon };
}

export function LocationFixDialog({
  orderId,
  address,
  lat,
  lon,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null,
  );
  const [nearby, setNearby] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCand, setLoadingCand] = useState(false);
  const [keyword, setKeyword] = useState(address);
  const [saving, setSaving] = useState(false);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

  // 使用 Web 服务静态地图，避免 Web 端 Key 的域名白名单令修正地图变成空白。
  useEffect(() => {
    if (!open || !point) return;
    let cancelled = false;
    setMapLoading(true);
    setMapFailed(false);
    (async () => {
      try {
        const result = await getStaticMap({ data: { lat: point.lat, lon: point.lon, zoom: MAP_ZOOM } });
        if (cancelled) return;
        setMapUrl(result.url);
        setMapFailed(!result.url);
      } catch {
        if (!cancelled) {
          setMapUrl(null);
          setMapFailed(true);
        }
      } finally {
        if (!cancelled) setMapLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, point]);

  useEffect(() => {
    if (!open) return;
    setPoint(lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, address]);

  const pick = (c: Candidate) => {
    setPoint({ lat: c.lat, lon: c.lon });
  };

  const pickOnMap = (event: React.MouseEvent<HTMLImageElement>) => {
    if (!point || !mapImageRef.current) return;
    const rect = mapImageRef.current.getBoundingClientRect();
    const sourceWidth = mapImageRef.current.naturalWidth || 960;
    const sourceHeight = mapImageRef.current.naturalHeight || 560;
    const offsetX = ((event.clientX - rect.left) / rect.width - 0.5) * sourceWidth;
    const offsetY = ((event.clientY - rect.top) / rect.height - 0.5) * sourceHeight;
    setPoint(movePointByPixels(point, offsetX, offsetY, MAP_ZOOM));
  };

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
      <DialogContent className="max-w-3xl">
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
          <div className="flex aspect-[12/7] w-full items-center justify-center overflow-hidden rounded-lg border border-border bg-surface">
            {mapUrl ? (
              <img
                ref={mapImageRef}
                src={mapUrl}
                alt="可点击修正的订单定位地图"
                className="h-full w-full cursor-crosshair object-fill"
                onClick={pickOnMap}
              />
            ) : (
              <p className="px-4 text-center text-xs text-muted-foreground">
                {mapLoading ? "地图载入中…" : mapFailed ? "地图暂时无法载入，请先选择右方候选地点" : "请先选择一个候选地点"}
              </p>
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
