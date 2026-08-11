import { supabase } from "@/integrations/supabase/client";
import { geocodeAddresses } from "@/lib/amap.functions";

export type GeocodeSummary = { configured: boolean; ok: number; failed: number };

/** 對指定訂單自動做地址解析並寫回資料庫 */
export async function autoGeocodeOrders(
  items: { id: string; address: string }[],
): Promise<GeocodeSummary> {
  const targets = items.filter((i) => i.address?.trim());
  if (targets.length === 0) return { configured: true, ok: 0, failed: 0 };

  const res = await geocodeAddresses({
    data: { items: targets.map((t) => ({ id: t.id, address: t.address })) },
  });
  if (!res.configured) return { configured: false, ok: 0, failed: 0 };

  let ok = 0;
  let failed = 0;
  for (const r of res.results) {
    if (r.ok && typeof r.lat === "number" && typeof r.lon === "number") {
      ok += 1;
      await supabase
        .from("orders")
        .update({
          latitude: r.lat,
          longitude: r.lon,
          normalized_address: r.formatted ?? null,
          geo_status: "confirmed",
        })
        .eq("id", r.id);
    } else {
      failed += 1;
      await supabase.from("orders").update({ geo_status: "failed" }).eq("id", r.id);
    }
  }
  return { configured: true, ok, failed };
}
