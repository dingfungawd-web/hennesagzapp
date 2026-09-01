import { supabase } from "@/integrations/supabase/client";
import { geocodeAddresses } from "@/lib/amap.functions";

export type GeocodeSummary = {
  configured: boolean;
  ok: number;
  failed: number;
  message?: string;
};

/** 对指定订单自动做地址解析并写回资料库 */
export async function autoGeocodeOrders(
  items: { id: string; address: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<GeocodeSummary> {
  const targets = items.filter((i) => i.address?.trim());
  if (targets.length === 0) return { configured: true, ok: 0, failed: 0 };

  let ok = 0;
  let failed = 0;
  const CHUNK = 10;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const chunk = targets.slice(i, i + CHUNK);
    let res: Awaited<ReturnType<typeof geocodeAddresses>>;
    try {
      res = await geocodeAddresses({
        data: { items: chunk.map((t) => ({ id: t.id, address: t.address })) },
      });
    } catch (e) {
      return { configured: true, ok, failed, message: `解析服务呼叫失败：${String(e)}` };
    }
    if (!res.configured)
      return { configured: false, ok, failed, message: res.message ?? "服务器未设定 AMAP_API_KEY" };


    for (const r of res.results) {
      if (r.ok && typeof r.lat === "number" && typeof r.lon === "number") {
        ok += 1;
        await supabase
          .from("orders")
          .update({
            latitude: r.lat,
            longitude: r.lon,
            normalized_address: r.formatted ?? null,
            // 一律标记为「待核对」，必须人手确认先会变「已核对」
            geo_status: "review",
          })
          .eq("id", r.id);
      } else {
        failed += 1;
        await supabase.from("orders").update({ geo_status: "failed" }).eq("id", r.id);
      }
    }
    onProgress?.(Math.min(i + CHUNK, targets.length), targets.length);
  }
  return { configured: true, ok, failed };
}

