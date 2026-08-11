import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrders, useTeams, useUpdateOrder } from "@/lib/queries";

import { WEEKDAYS, startOfWeek, ymd } from "@/lib/domain";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "排程日曆 — 漢紗排程調度台" },
      {
        name: "description",
        content: "週視圖與日視圖排程日曆，直接調整安裝日期、到達時段與負責隊伍。",
      },
      { property: "og:title", content: "排程日曆 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "週視圖與日視圖排程日曆，直接調整安裝日期、到達時段與負責隊伍。",
      },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<"week" | "day" | "month">("week");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftTime, setDraftTime] = useState<string | null>(null);
  const [draftTeam, setDraftTeam] = useState<string | null>(null);
  const { data: orders = [] } = useOrders();

  const { data: teams = [] } = useTeams();
  const updateOrder = useUpdateOrder();

  const days = useMemo(() => {
    if (view === "day") return [new Date(anchor)];
    if (view === "month") {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const start = startOfWeek(first);
      return Array.from({ length: 42 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [anchor, view]);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof orders>();
    for (const o of orders) {
      if (!o.install_date) continue;
      const list = map.get(o.install_date) ?? [];
      list.push(o);
      map.set(o.install_date, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.install_time ?? "99").localeCompare(b.install_time ?? "99"));
    }
    return map;
  }, [orders]);

  const unscheduled = orders.filter((o) => !o.install_date);
  const shift = (n: number) => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + n * (view === "week" ? 7 : 1));
    setAnchor(d);
  };

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name;
  const viewLabel = view === "week" ? "週視圖" : view === "day" ? "日視圖" : "月視圖";

  return (
    <AppShell
      title="排程日曆"
      subtitle={
        view === "month"
          ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月 · ${unscheduled.length} 張未排程`
          : `${viewLabel} · ${unscheduled.length} 張未排程`
      }
      actions={
        <>
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="上一頁">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            <CalendarDays className="size-4" />
            今日
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="下一頁">
            <ChevronRight className="size-4" />
          </Button>
          <Select value={view} onValueChange={(v) => setView(v as "week" | "day" | "month")}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">月視圖</SelectItem>
              <SelectItem value="week">週視圖</SelectItem>
              <SelectItem value="day">日視圖</SelectItem>
            </SelectContent>
          </Select>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
        {view === "month" && (
          <div className="hidden grid-cols-7 gap-2 text-center text-xs text-muted-foreground md:grid">
            {WEEKDAYS.map((w) => (
              <span key={w}>週{w}</span>
            ))}
          </div>
        )}
        <div
          className={cn(
            "grid gap-3",
            view === "week"
              ? "grid-cols-1 md:grid-cols-4 xl:grid-cols-7"
              : view === "month"
                ? "grid-cols-1 md:grid-cols-7 md:gap-2"
                : "grid-cols-1",
          )}
        >
          {days.map((d) => {
            const key = ymd(d);
            const list = byDay.get(key) ?? [];
            const isToday = key === ymd(new Date());
            const outside = view === "month" && d.getMonth() !== anchor.getMonth();
            return (
              <div
                key={key}
                className={cn(
                  "rounded-lg border bg-card",
                  view === "month" ? "min-h-24 p-2" : "min-h-40 p-3",
                  isToday ? "border-primary/60" : "border-border",
                  outside && "opacity-45",
                )}
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <p className={cn("text-sm font-medium", isToday && "text-primary")}>
                    {d.getMonth() + 1}/{d.getDate()}
                    {view !== "month" && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        週{WEEKDAYS[(d.getDay() + 6) % 7]}
                      </span>
                    )}
                  </p>
                  <span className="tabular text-xs text-muted-foreground">{list.length || ""}</span>
                </div>
                {view === "month" ? (
                  <div className="space-y-1">
                    {list.slice(0, 4).map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => {
                          setDraftId(o.id);
                          setDraftDate(o.install_date ?? key);
                          setDraftTime(o.install_time ?? null);
                          setDraftTeam(o.team_id ?? null);
                        }}
                        className="block w-full truncate rounded bg-surface px-1.5 py-1 text-left text-[11px]"
                      >
                        {o.install_time ? (
                          <span className="tabular mr-1 text-primary">
                            {o.install_time.split("-")[0]}
                          </span>
                        ) : null}
                        {o.customer_name}
                      </button>
                    ))}
                    {list.length > 4 && (
                      <p className="px-1 text-[11px] text-muted-foreground">
                        +{list.length - 4} 張
                      </p>
                    )}
                  </div>
                ) : (
                <div className="space-y-2">
                  {list.map((o) => (
                    <div key={o.id} className="rounded border border-border bg-surface p-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-medium">{o.customer_name}</p>
                        {o.team_id && (
                          <Badge variant="outline" className="shrink-0 text-[10px]">
                            {teamName(o.team_id)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {o.raw_address}
                      </p>
                      <TimeRangeSelect
                        className="mt-2"
                        compact
                        value={o.install_time}
                        onChange={(v) =>
                          updateOrder.mutate({ id: o.id, patch: { install_time: v } })
                        }
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 w-full text-xs text-muted-foreground"
                        onClick={() =>
                          updateOrder.mutate({
                            id: o.id,
                            patch: {
                              install_date: null,
                              install_time: null,
                              team_id: null,
                              status: "unscheduled",
                            },
                          })
                        }
                      >
                        取消約期
                      </Button>

                    </div>
                  ))}
                  {list.length === 0 && (
                    <p className="py-4 text-center text-xs text-muted-foreground">未有安排</p>
                  )}
                </div>
                )}
              </div>
            );
          })}
        </div>
        </div>


        <aside className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 text-sm font-medium">未排程訂單（{unscheduled.length}）</p>
          <div className="max-h-[70vh] space-y-2 overflow-auto">
            {unscheduled.map((o) => (
              <div key={o.id} className="rounded border border-border bg-surface p-2">
                <p className="truncate text-sm font-medium">{o.customer_name}</p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{o.raw_address}</p>
                <div className="mt-2 flex gap-1.5">
                  {days.slice(0, 3).map((d) => (
                    <Button
                      key={ymd(d)}
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 text-xs"
                      onClick={() => {
                        setDraftId(o.id);
                        setDraftDate(ymd(d));
                        setDraftTime(null);
                        setDraftTeam(o.team_id ?? null);
                      }}
                    >
                      {d.getMonth() + 1}/{d.getDate()}
                    </Button>
                  ))}
                </div>

              </div>
            ))}
            {unscheduled.length === 0 && (
              <p className="py-6 text-center text-xs text-muted-foreground">全部訂單已排程 🎉</p>
            )}
          </div>
        </aside>
      </div>

      <Dialog open={!!draftId} onOpenChange={(v) => !v && setDraftId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安排約期</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">安裝日期</Label>
              <Input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">到達時段（起 — 迄）</Label>
              <TimeRangeSelect value={draftTime} onChange={setDraftTime} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">負責隊伍</Label>
              <Select
                value={draftTeam ?? "none"}
                onValueChange={(v) => setDraftTeam(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="未分配" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分配</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraftId(null)}>
              取消
            </Button>
            <Button
              disabled={!draftDate}
              onClick={() => {
                if (!draftId || !draftDate) return;
                updateOrder.mutate({
                  id: draftId,
                  patch: {
                    install_date: draftDate,
                    install_time: draftTime,
                    team_id: draftTeam,
                    status: "scheduled",
                  },
                });
                setDraftId(null);
              }}
            >
              確認約期
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>

  );
}
