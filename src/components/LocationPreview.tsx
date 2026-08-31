import { useEffect, useState } from "react";
import { getStaticMap } from "@/lib/amap.functions";

/** 定位预览缩图：直接睇到高德解析咗去边度 */
export function LocationPreview({
  lat,
  lon,
  className,
}: {
  lat: number | null;
  lon: number | null;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    if (lat == null || lon == null) return;
    (async () => {
      try {
        const res = await getStaticMap({ data: { lat: Number(lat), lon: Number(lon) } });
        if (!cancelled) {
          if (res.url) setUrl(res.url);
          else setFailed(true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  if (lat == null || lon == null)
    return (
      <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
        未定位，冇预览图
      </div>
    );

  if (failed)
    return (
      <div className="flex h-[140px] items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
        预览图载入失败
      </div>
    );

  return url ? (
    <img
      src={url}
      alt="订单定位预览地图"
      loading="lazy"
      className={className ?? "h-[140px] w-full rounded-lg border border-border object-cover"}
    />
  ) : (
    <div className="flex h-[140px] items-center justify-center rounded-lg border border-border text-xs text-muted-foreground">
      预览图载入中…
    </div>
  );
}
