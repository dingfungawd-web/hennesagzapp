import { useEffect, useState } from "react";
import { Maximize2 } from "lucide-react";
import { getStaticMap } from "@/lib/amap.functions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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
  const [open, setOpen] = useState(false);

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
    <>
      <div className="group relative">
        <button
          type="button"
          className="block w-full cursor-zoom-in"
          onClick={() => setOpen(true)}
          aria-label="放大定位预览图"
        >
          <img
            src={url}
            alt="订单定位预览地图"
            loading="lazy"
            className={className ?? "h-[140px] w-full rounded-lg border border-border object-cover"}
          />
        </button>
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="absolute right-2 top-2 size-8 shadow"
          onClick={() => setOpen(true)}
          aria-label="放大地图"
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] max-w-5xl p-3 sm:p-4">
          <DialogTitle className="px-1 text-base">定位预览</DialogTitle>
          <img
            src={url}
            alt="订单定位放大地图"
            className="max-h-[80vh] w-full rounded border border-border object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  ) : (
    <div className="flex h-[140px] items-center justify-center rounded-lg border border-border text-xs text-muted-foreground">
      预览图载入中…
    </div>
  );
}
