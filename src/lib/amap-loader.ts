import { getAmapConfig } from "@/lib/amap.functions";

declare global {
  interface Window {
    AMap?: unknown;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

let loading: Promise<unknown | null> | null = null;

/** 载入高德 JS API（全站共用，只会载入一次）。回传 AMap，未设定 Key 时回传 null。 */
export function loadAmap(): Promise<unknown | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;
  loading = (async () => {
    let jsKey = import.meta.env["VITE_AMAP_JS_KEY"] as string | undefined;
    let securityCode = import.meta.env["VITE_AMAP_JS_SECURITY_CODE"] as string | undefined;
    if (!jsKey) {
      const cfg = await getAmapConfig();
      jsKey = cfg.jsKey || undefined;
      securityCode = securityCode ?? (cfg.securityCode || undefined);
    }
    if (!jsKey) return null;
    if (securityCode) window._AMapSecurityConfig = { securityJsCode: securityCode };
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `https://webapi.amap.com/maps?v=2.0&key=${jsKey}`;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("地图载入失败"));
      document.head.appendChild(s);
    }).catch(() => null);
    return window.AMap ?? null;
  })();
  return loading;
}
