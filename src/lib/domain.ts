import type { Database } from "@/integrations/supabase/types";

export type Order = Database["public"]["Tables"]["orders"]["Row"];
export type Team = Database["public"]["Tables"]["teams"]["Row"];
export type Technician = Database["public"]["Tables"]["technicians"]["Row"];
export type ImportBatch = Database["public"]["Tables"]["import_batches"]["Row"];

export const TIME_OPTIONS: { value: string; label: string }[] = Array.from(
  { length: 48 },
  (_, i) => {
    const h = String(Math.floor(i / 2)).padStart(2, "0");
    const m = i % 2 === 0 ? "00" : "30";
    return { value: `${h}:${m}`, label: `${h}:${m}` };
  },
);

/** install_time 儲存為 "HH:MM-HH:MM"（舊資料可能只有 "HH:MM"） */
export function parseTimeRange(value: string | null | undefined): {
  start: string | null;
  end: string | null;
} {
  if (!value) return { start: null, end: null };
  const [start, end] = value.split("-");
  return { start: start?.trim() || null, end: end?.trim() || null };
}

export function shiftTime(time: string, hours: number) {
  const [h = "0", m = "00"] = time.split(":");
  const total = Math.min(23 * 60 + 30, Number(h) * 60 + Number(m) + hours * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function formatTimeRange(value: string | null | undefined) {
  const { start, end } = parseTimeRange(value);
  if (!start) return "";
  return end ? `${start}–${end}` : start;
}

export const STATUS_LABEL: Record<string, string> = {
  unscheduled: "未約期",
  scheduled: "已約期",
  completed: "已完成",
};

export const GEO_LABEL: Record<string, string> = {
  pending: "待解析",
  confirmed: "已定位",
  failed: "解析失敗",
};

export const TEAM_TYPE_LABEL: Record<string, string> = {
  standard: "標準隊（2 人）",
  large: "加大隊",
  split: "拆隊",
};

export function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday first
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

/** 今天或之後的已約未完成單／跟進單，以及所有未約期單 */
export function isUpcoming(o: { status: string; install_date: string | null }) {
  if (o.status === "completed") return false;
  if (!o.install_date) return true;
  return o.install_date >= ymd(new Date());
}
