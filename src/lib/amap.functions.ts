import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { geocodeOne, fetchDrivingRoute, type GeoResult } from "./amap.server";

// 仅作 Lovable 预览环境的回退：Vercel 生产环境由前端直接读 VITE_AMAP_JS_KEY。
export const getAmapConfig = createServerFn({ method: "GET" }).handler(async () => {
  const jsKey = process.env["AMAP_JS_KEY"] ?? "";
  const securityCode = process.env["AMAP_JS_SECURITY_CODE"] ?? "";
  return { jsKey, securityCode, configured: Boolean(jsKey) };
});

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
    if (!apiKey)
      return {
        configured: false,
        results: [] as GeoResult[],
        message: "服务器未设定 AMAP_API_KEY" as string | undefined,
      };
    // 并发小批处理，避免在 serverless 环境因逐条等待而超时
    const results: GeoResult[] = await Promise.all(
      data.items.map(async (item) => {
        try {
          const geo = await geocodeOne(item.address, apiKey);
          if (geo)
            return { id: item.id, ok: true, lat: geo.lat, lon: geo.lon, formatted: geo.formatted };
        } catch {
          // 视为失败
        }
        return { id: item.id, ok: false };
      }),
    );
    return { configured: true, results, message: undefined as string | undefined };
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
