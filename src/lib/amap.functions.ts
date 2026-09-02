import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  geocodeOne,
  geocodeCandidates,
  fetchDrivingRoute,
  staticMapDataUrl,
  reverseGeocode,
  type GeoResult,
  type Candidate,
} from "./amap.server";

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
            return {
              id: item.id,
              ok: true,
              lat: geo.lat,
              lon: geo.lon,
              formatted: geo.formatted,
              district: geo.district,
              suspect: geo.suspect,
            };
        } catch {
          // 视为失败
        }
        return { id: item.id, ok: false };
      }),
    );
    return { configured: true, results, message: undefined as string | undefined };
  });

/** 取得一个地址的多个候选定位，俾同事人手拣返正确嗰个 */
export const getGeocodeCandidates = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ address: z.string().min(1), city: z.string().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["AMAP_API_KEY"];
    if (!apiKey)
      return { configured: false, candidates: [] as Candidate[], message: "服务器未设定 AMAP_API_KEY" };
    const candidates = await geocodeCandidates(data.address, apiKey, data.city);
    return { configured: true, candidates, message: undefined as string | undefined };
  });

/** 静态地图预览图（base64 data URL） */
export const getStaticMap = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ lat: z.number(), lon: z.number(), zoom: z.number().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env["AMAP_API_KEY"];
    if (!apiKey) return { url: null as string | null, width: STATIC_MAP_W, height: STATIC_MAP_H };
    const url = await staticMapDataUrl(apiKey, data.lat, data.lon, data.zoom ?? 15);
    return { url, width: STATIC_MAP_W, height: STATIC_MAP_H };
  });


/** 由座标反查地址 */
export const reverseGeocodePoint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ lat: z.number(), lon: z.number() }).parse(data))
  .handler(async ({ data }) => {
    const apiKey = process.env["AMAP_API_KEY"];
    if (!apiKey) return { formatted: "", district: "" };
    const res = await reverseGeocode(apiKey, data.lat, data.lon);
    return { formatted: res?.formatted ?? "", district: res?.district ?? "" };
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
