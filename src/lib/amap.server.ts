const AMAP_BASE = "https://restapi.amap.com/v3";

export type GeoResult = {
  id: string;
  ok: boolean;
  lat?: number;
  lon?: number;
  formatted?: string;
};

export async function geocodeOne(address: string, apiKey: string) {
  const tries = [
    `${AMAP_BASE}/geocode/geo?address=${encodeURIComponent(address)}&key=${apiKey}&city=广州`,
    `${AMAP_BASE}/geocode/geo?address=${encodeURIComponent(address)}&key=${apiKey}`,
  ];
  for (const url of tries) {
    try {
      const resp = await fetch(url);
      const data = (await resp.json()) as {
        status?: string;
        geocodes?: { location: string; formatted_address: string }[];
      };
      const first = data.geocodes?.[0];
      if (data.status === "1" && first) {
        const parts = first.location.split(",").map(Number);
        const lon = parts[0] ?? 0;
        const lat = parts[1] ?? 0;
        return { lat, lon, formatted: first.formatted_address };
      }
    } catch {
      // try next
    }
  }
  return null;
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
        text: `${minutes} 分鐘 · ${km.toFixed(1)} km`,
      };
    }
    return { success: false, message: "無法取得路線" };
  } catch (e) {
    return { success: false, message: String(e) };
  }
}
