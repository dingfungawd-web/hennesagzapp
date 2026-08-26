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

/** install_time 储存为 "HH:MM-HH:MM"（旧资料可能只有 "HH:MM"） */
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
  unscheduled: "未约期",
  scheduled: "已约期",
  completed: "已完成",
};

export const GEO_LABEL: Record<string, string> = {
  pending: "待解析",
  confirmed: "已定位",
  failed: "解析失败",
};

export const TEAM_TYPE_LABEL: Record<string, string> = {
  standard: "标准队（2 人）",
  large: "加大队",
  split: "拆队",
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

/** 今天或之后的已约未完成单／跟进单，以及所有未约期单 */
export function isUpcoming(o: { status: string; install_date: string | null }) {
  if (o.status === "completed") return false;
  if (!o.install_date) return true;
  return o.install_date >= ymd(new Date());
}

export const ORDER_TYPE_LABEL: Record<string, string> = {
  install: "安装单",
  followup: "跟进单",
};

export function addDays(dateStr: string, days: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/** 安装单：收订日期 + 7 日就系约期死线；跟进单冇死线（本身就系急单） */
export function deadlineOf(o: {
  order_type: string;
  deposit_date: string | null;
}): string | null {
  if (o.order_type !== "install") return null;
  if (!o.deposit_date) return null;
  return addDays(o.deposit_date, 7);
}

export function daysUntil(dateStr: string) {
  const today = new Date(`${ymd(new Date())}T00:00:00`).getTime();
  const target = new Date(`${dateStr}T00:00:00`).getTime();
  return Math.round((target - today) / 86400000);
}

export type UrgencyLevel = "overdue" | "urgent" | "soon" | "normal" | "none";

export function urgencyOf(o: {
  order_type: string;
  deposit_date: string | null;
  status: string;
}): { level: UrgencyLevel; deadline: string | null; days: number | null } {
  if (o.status !== "unscheduled") return { level: "none", deadline: deadlineOf(o), days: null };
  if (o.order_type === "followup") return { level: "urgent", deadline: null, days: null };
  const deadline = deadlineOf(o);
  if (!deadline) return { level: "none", deadline: null, days: null };
  const days = daysUntil(deadline);
  if (days < 0) return { level: "overdue", deadline, days };
  if (days <= 2) return { level: "urgent", deadline, days };
  if (days <= 5) return { level: "soon", deadline, days };
  return { level: "normal", deadline, days };
}

export const URGENCY_TONE: Record<UrgencyLevel, string> = {
  overdue: "border-destructive/50 bg-destructive/15 text-destructive",
  urgent: "border-warning/50 bg-warning/15 text-warning",
  soon: "border-primary/40 bg-primary/10 text-primary",
  normal: "border-border bg-muted text-muted-foreground",
  none: "border-border bg-muted text-muted-foreground",
};

/** 排序权重：越细越急 */
export function urgencyRank(o: {
  order_type: string;
  deposit_date: string | null;
  status: string;
}) {
  const u = urgencyOf(o);
  if (o.status !== "unscheduled") return 9000;
  if (o.order_type === "followup") return -9999; // 跟进单永远置顶
  if (u.days === null) return 8000; // 冇收订日期，排喺最后但喺已约期之前
  return u.days;
}

