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
import { loadAmap } from "@/lib/amap-loader";
import { getGeocodeCandidates, reverseGeocodePoint } from "@/lib/amap.functions";
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

export function LocationFixDialog({
  orderId,
  address,
  lat,
  lon,
  open,
  onOpenChange,
  onSaved,
}: Props) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(
    lat != null && lon != null ? { lat: Number(lat), lon: Number(lon) } : null,
  );
  const [nearby, setNearby] = useState<string>("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loadingCand, setLoadingCand] = useState(false);
  const [keyword, setKeyword] = useState(address);
  const [saving, setSaving] = useState(false);

  // 载入地图
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const AMapAny = await loadAmap();
      if (cancelled || !AMapAny || !mapEl.current) return;
      const AMap = AMapAny as any;
      const center = point ? [point.lon, point.lat] : [113.264, 23.129];
      const map = new AMap.Map(mapEl.current, {
        zoom: point ? 16 : 11,
        center,
        mapStyle: "amap://styles/dark",
      });
      mapRef.current = map;
      const marker = new AMap.Marker({ position: center, draggable: true, cursor: "move" });
      map.add(marker);
      markerRef.current = marker;
      marker.on("dragend", (e: any) => {
        const p = e.lnglat;
        setPoint({ lat: p.getLat(), lon: p.getLng() });
      });
      map.on("click", (e: any) => {
        const p = e.lnglat;
        marker.setPosition([p.getLng(), p.getLat()]);
        setPoint({ lat: p.getLat(), lon: p.getLng() });
      });
      setTimeout(() => map.resize?.(), 200);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    if (mapRef.current && markerRef.current) {
      markerRef.current.setPosition([c.lon, c.lat]);
      mapRef.current.setZoomAndCenter(16, [c.lon, c.lat]);
    }
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
          <div className="h-[360px] w-full overflow-hidden rounded-lg border border-border">
            <div ref={mapEl} style={{ width: "100%", height: "100%" }} />
          </div>
          <div className="max-h-[360px] space-y-1.5 overflow-auto pr-1">
            {candidates.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {loadingCand ? "搜寻中…" : "冇候选结果，可直接喺地图撳低正确位置。"}
              </p>
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
