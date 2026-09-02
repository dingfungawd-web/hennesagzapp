import { Buffer } from "node:buffer";

const AMAP_BASE = "https://restapi.amap.com/v3";

export type GeoResult = {
  id: string;
  ok: boolean;
  lat?: number;
  lon?: number;
  formatted?: string;
  district?: string;
  /** 定位结果同地址里面嘅区县唔一致，需要人手核对 */
  suspect?: boolean;
};

export type Candidate = {
  lat: number;
  lon: number;
  formatted: string;
  district: string;
  source: "geocode" | "poi";
  level?: string;
  matched: boolean;
};

/** 由地址文字抽出市 / 区县 */
export function parseRegion(address: string) {
  const city = address.match(/[\u4e00-\u9fa5]{2,8}?市/)?.[0] ?? "";
  const districts = address.match(/[\u4e00-\u9fa5]{2,8}?[区县]/g) ?? [];
  // 只取第一个（省市区排头），避免 "越秀万博" 呢类小区名撞名
  const district = districts[0] ?? "";
  return { city, district };
}

function loc2num(location: string) {
  const parts = location.split(",").map(Number);
  return { lon: parts[0] ?? 0, lat: parts[1] ?? 0 };
}

async function callGeocode(address: string, apiKey: string, city: string) {
  const url = `${AMAP_BASE}/geocode/geo?address=${encodeURIComponent(address)}&key=${apiKey}${
    city ? `&city=${encodeURIComponent(city)}` : ""
  }`;
  try {
    const resp = await fetch(url);
    const data = (await resp.json()) as {
      status?: string;
      geocodes?: {
        location: string;
        formatted_address: string;
        district?: string | string[];
        level?: string;
      }[];
    };
    if (data.status !== "1") return [];
    return (data.geocodes ?? []).map((g) => {
      const { lat, lon } = loc2num(g.location);
      return {
        lat,
        lon,
        formatted: g.formatted_address,
        district: typeof g.district === "string" ? g.district : "",
        level: g.level ?? "",
        source: "geocode" as const,
      };
    });
  } catch {
    return [];
  }
}

async function callPoi(keywords: string, apiKey: string, city: string) {
  const url = `${AMAP_BASE}/place/text?keywords=${encodeURIComponent(keywords)}&key=${apiKey}&offset=10&page=1${
    city ? `&city=${encodeURIComponent(city)}&citylimit=true` : ""
  }`;
  try {
    const resp = await fetch(url);
    const data = (await resp.json()) as {
      status?: string;
      pois?: {
        location: string;
        name: string;
        address?: string | string[];
        pname?: string;
        cityname?: string;
        adname?: string;
      }[];
    };
    if (data.status !== "1") return [];
    return (data.pois ?? []).map((p) => {
      const { lat, lon } = loc2num(p.location);
      const addr = typeof p.address === "string" ? p.address : "";
      return {
        lat,
        lon,
        formatted: `${p.pname ?? ""}${p.cityname ?? ""}${p.adname ?? ""}${addr}${p.name}`,
        district: p.adname ?? "",
        level: "POI",
        source: "poi" as const,
      };
    });
  } catch {
    return [];
  }
}

/** 取得多个候选定位，已按「区县是否吻合」排序 */
export async function geocodeCandidates(
  address: string,
  apiKey: string,
  hintCity?: string,
): Promise<Candidate[]> {
  const { city, district } = parseRegion(address);
  const scopeCity = hintCity || district || city || "广州";
  const raw = [
    ...(await callGeocode(address, apiKey, scopeCity)),
    ...(await callGeocode(address, apiKey, city || "广州")),
    ...(await callPoi(address.replace(/^[\u4e00-\u9fa5]{2,8}?省/, ""), apiKey, scopeCity)),
  ];
  if (raw.length === 0) raw.push(...(await callGeocode(address, apiKey, "")));

  const seen = new Set<string>();
  const list: Candidate[] = [];
  for (const r of raw) {
    if (!r.lat || !r.lon) continue;
    const key = `${r.lat.toFixed(5)},${r.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const matched = district
      ? r.district === district || r.formatted.includes(district)
      : true;
    list.push({ ...r, matched });
  }
  list.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    if (a.source !== b.source) return a.source === "geocode" ? -1 : 1;
    return 0;
  });
  return list.slice(0, 10);
}

export async function geocodeOne(address: string, apiKey: string) {
  const list = await geocodeCandidates(address, apiKey);
  const best = list[0];
  if (!best) return null;
  return {
    lat: best.lat,
    lon: best.lon,
    formatted: best.formatted,
    district: best.district,
    suspect: !best.matched,
  };
}

export async function fetchDrivingRoute(
  apiKey: string,
  originLat: number,
  originLon: number,
  destLat: number,
  destLon: number,
) {
  try {
    const url = `${AMAP_BASE}/direction/driving?origin=${originLon},${originLat}&destination=${destLon},${destLat}&key=${apiKey}&strategy=0`;
    const resp = await fetch(url);
    const json = (await resp.json()) as {
      status?: string;
      route?: { paths?: { duration: string; distance: string }[] };
    };
    const path = json.route?.paths?.[0];
    if (json.status === "1" && path) {
      const minutes = Math.round(parseInt(path.duration, 10) / 60);
      const km = parseInt(path.distance, 10) / 1000;
      return {
        success: true,
        minutes,
        km: Number(km.toFixed(1)),
        text: `${minutes} 分钟 · ${km.toFixed(1)} km`,
      };
    }
    return { success: false, message: "无法取得路线" };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}

/** 静态地图预览图（回传 data URL，避免喺前端泄露 Web 服务 Key）
 *  注意：scale=1，令图片像素 === 地图像素，前端座标换算先至准。 */
export const STATIC_MAP_W = 960;
export const STATIC_MAP_H = 560;

export async function staticMapDataUrl(
  apiKey: string,
  lat: number,
  lon: number,
  zoom = 15,
  size = `${STATIC_MAP_W}*${STATIC_MAP_H}`,
) {
  const url = `https://restapi.amap.com/v3/staticmap?location=${lon},${lat}&zoom=${zoom}&size=${size}&scale=1&key=${apiKey}`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });

    if (!resp.ok) return null;
    const type = resp.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) return null;
    const buf = await resp.arrayBuffer();
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/** 逆地理编码：由座标取返地址，用嚟核对人手拖拉后嘅位置 */
export async function reverseGeocode(apiKey: string, lat: number, lon: number) {
  try {
    const url = `${AMAP_BASE}/geocode/regeo?location=${lon},${lat}&key=${apiKey}&extensions=base`;
    const resp = await fetch(url);
    const json = (await resp.json()) as {
      status?: string;
      regeocode?: {
        formatted_address?: string;
        addressComponent?: { district?: string | string[] };
      };
    };
    if (json.status !== "1") return null;
    const d = json.regeocode?.addressComponent?.district;
    return {
      formatted: json.regeocode?.formatted_address ?? "",
      district: typeof d === "string" ? d : "",
    };
  } catch {
    return null;
  }
}
