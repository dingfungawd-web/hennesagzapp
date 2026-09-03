import { getAmapConfig } from "@/lib/amap.functions";

declare global {
  interface Window {
    AMap?: unknown;
    _AMapSecurityConfig?: { securityJsCode: string };
  }
}

let loading: Promise<unknown | null> | null = null;

function waitForAmap(timeoutMs = 8_000) {
  return new Promise<unknown | null>((resolve) => {
    const started = Date.now();
    const check = () => {
      if (window.AMap) {
        resolve(window.AMap);
        return;
      }
      if (Date.now() - started >= timeoutMs) {
        resolve(null);
        return;
      }
      window.setTimeout(check, 50);
    };
    check();
  });
}

/** 载入高德 JS API（全站共用，只会载入一次）。回传 AMap，未设定 Key 时回传 null。 */
export function loadAmap(): Promise<unknown | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  if (window.AMap) return Promise.resolve(window.AMap);
  if (loading) return loading;
  loading = (async () => {
    let jsKey = import.meta.env["VITE_AMAP_JS_KEY"] as string | undefined;
    let securityCode = import.meta.env["VITE_AMAP_JS_SECURITY_CODE"] as string | undefined;
    // Production may expose the JS key through Vite while keeping the security code server-side.
    // Fetch the missing half as well; AMap rejects the SDK when either value is absent/mismatched.
    if (!jsKey || !securityCode) {
      const cfg = await getAmapConfig();
      jsKey = jsKey ?? (cfg.jsKey || undefined);
      securityCode = securityCode ?? (cfg.securityCode || undefined);
    }
    if (!jsKey) return null;
    if (securityCode) window._AMapSecurityConfig = { securityJsCode: securityCode };
    const existing = document.querySelector<HTMLScriptElement>('script[data-amap-sdk="true"]');
    if (!existing) {
      const script = document.createElement("script");
      script.dataset.amapSdk = "true";
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(jsKey)}`;
      script.async = true;
      document.head.appendChild(script);
    }
    return waitForAmap();
  })();
  void loading.then((result) => {
    // Do not permanently cache a transient network/domain failure.
    if (!result) loading = null;
  });
  return loading;
}
