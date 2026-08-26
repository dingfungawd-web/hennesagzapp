import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocodeOne, fetchDrivingRoute, type GeoResult } from "./amap.server";

</antml :parameter>


export const geocodeAddresses = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        items: z.array(z.object({ id: z.string(), address: z.string().min(1) })).max(200),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["AMAP_API_KEY"];
    if (!apiKey) return { configured: false, results: [] as GeoResult[] };
    const results: GeoResult[] = [];
    for (const item of data.items) {
      const geo = await geocodeOne(item.address, apiKey);
      if (geo) {
        results.push({ id: item.id, ok: true, lat: geo.lat, lon: geo.lon, formatted: geo.formatted });
      } else {
        results.push({ id: item.id, ok: false });
      }
      await new Promise((r) => setTimeout(r, 220));
    }
    return { configured: true, results };
  });

export const drivingDuration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        originLat: z.number(),
        originLon: z.number(),
        destLat: z.number(),
        destLon: z.number(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["AMAP_API_KEY"];
    if (!apiKey)
      return {
        success: false,
        message: "未设定高德 API Key" as string | undefined,
        minutes: undefined as number | undefined,
        km: undefined as number | undefined,
        text: undefined as string | undefined,
      };
    return (await fetchDrivingRoute(
      apiKey,
      data.originLat,
      data.originLon,
      data.destLat,
      data.destLon,
    )) as {
      success: boolean;
      message?: string;
      minutes?: number;
      km?: number;
      text?: string;
    };
  });
