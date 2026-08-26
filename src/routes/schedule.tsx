import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, ArrowLeft } from "lucide-react";
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

import { WEEKDAYS, startOfWeek, ymd, formatTimeRange } from "@/lib/domain";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/schedule")({
  head: () => ({
    meta: [
      { title: "排程日历 — 汉纱排程调度台" },
      {
        name: "description",
        content: "月视图日历一览排期，点入某日查看当日完整排期顺序、时段、地址与队伍。",
      },
      { property: "og:title", content: "排程日历 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "月视图日历一览排期，点入某日查看当日完整排期顺序、时段、地址与队伍。",
      },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const [anchor, setAnchor] = useState(() => new Date());
  const [view, setView] = useState<"day" | "month">("month");
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftDate, setDraftDate] = useState<string>("");
  const [draftTime, setDraftTime] = useState<string | null>(null);
  const [draftTeam, setDraftTeam] = useState<string | null>(null);
  const { data: orders = [] } = useOrders();

  const { data: teams = [] } = useTeams();
  const updateOrder = useUpdateOrder();

  const days = useMemo(() => {
    if (view === "day") return [new Date(anchor)];
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
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
    else d.setDate(d.getDate() + n);
    setAnchor(d);
  };

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name;

  const openDraft = (o: (typeof orders)[number], fallbackDate: string) => {
    setDraftId(o.id);
    setDraftDate(o.install_date ?? fallbackDate);
    setDraftTime(o.install_time ?? null);
    setDraftTeam(o.team_id ?? null);
  };

  const dayList = byDay.get(ymd(anchor)) ?? [];

  return (
    <AppShell
      title="排程日历"
      subtitle={
        view === "month"
          ? `${anchor.getFullYear()} 年 ${anchor.getMonth() + 1} 月 · ${unscheduled.length} 张未排程`
          : `${anchor.getMonth() + 1} 月 ${anchor.getDate()} 日 · ${dayList.length} 张订单`
      }
      actions={
        <>
          {view === "day" && (
            <Button variant="outline" size="sm" onClick={() => setView("month")}>
              <ArrowLeft className="size-4" />
              返回月视图
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label="上一页">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>
            <CalendarDays className="size-4" />
            今日
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label="下一页">
            <ChevronRight className="size-4" />
          </Button>
        </>
      }
    >
      {view === "month" ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="space-y-2">
            <div className="hidden grid-cols-7 gap-2 text-center text-xs text-muted-foreground md:grid">
              {WEEKDAYS.map((w) => (
                <span key={w}>周{w}</span>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2">
              {days.map((d) => {
                const key = ymd(d);
                const list = byDay.get(key) ?? [];
                const isToday = key === ymd(new Date());
                const outside = d.getMonth() !== anchor.getMonth();
                return (
                  <div
                    key={key}
                    className={cn(
                      "min-h-24 rounded-lg border bg-card p-2",
                      isToday ? "border-primary/60" : "border-border",
                      outside && "opacity-45",
                    )}
                  >
                    <div className="mb-2 flex items-baseline justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(new Date(d));
                          setView("day");
                        }}
                        className={cn(
                          "text-sm font-medium hover:underline",
                          isToday && "text-primary",
                        )}
                      >
                        {d.getMonth() + 1}/{d.getDate()}
                      </button>
                      <span className="tabular text-xs text-muted-foreground">
                        {list.length || ""}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {list.slice(0, 4).map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => {
                            setAnchor(new Date(d));
                            setView("day");
                          }}
                          className="block w-full truncate rounded bg-surface px-1.5 py-1 text-left text-[11px]"
                          title={o.raw_address}
                        >
                          {o.install_time ? (
                            <span className="tabular mr-1 text-primary">
                              {o.install_time.split("-")[0]}
                            </span>
                          ) : null}
                          {o.raw_address}
                        </button>
                      ))}
                      {list.length > 4 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-full justify-start px-1 text-[11px] text-muted-foreground"
                          onClick={() => {
                            setAnchor(new Date(d));
                            setView("day");
                          }}
                        >
                          +{list.length - 4} 张
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <aside className="rounded-lg border border-border bg-card p-3">
            <p className="mb-2 text-sm font-medium">未排程订单（{unscheduled.length}）</p>
            <div className="max-h-[70vh] space-y-2 overflow-auto">
              {unscheduled.map((o) => (
                <div key={o.id} className="rounded border border-border bg-surface p-2">
                  <p className="truncate text-sm font-medium">{o.customer_name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{o.raw_address}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 w-full text-xs"
                    onClick={() => openDraft(o, ymd(anchor))}
                  >
                    安排约期
                  </Button>
                </div>
              ))}
              {unscheduled.length === 0 && (
                <p className="py-6 text-center text-xs text-muted-foreground">全部订单已排程 🎉</p>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground">当日排期</p>
              <h2 className="mt-1 text-xl font-semibold">
                {anchor.getFullYear()} 年 {anchor.getMonth() + 1} 月 {anchor.getDate()} 日 · 周
                {WEEKDAYS[(anchor.getDay() + 6) % 7]}
              </h2>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold">{dayList.length} 张订单</p>
              <p className="text-xs text-muted-foreground">按到达时段排列</p>
            </div>
          </div>

          {dayList.map((o, idx) => (
            <div
              key={o.id}
              className="grid gap-4 rounded-lg border border-border bg-card p-4 md:grid-cols-[56px_130px_minmax(0,1fr)_220px] md:items-start"
            >
              <div className="flex size-12 items-center justify-center rounded bg-primary/15 text-xl font-semibold text-primary">
                {idx + 1}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">到达时段</p>
                <p className="tabular mt-1 text-base font-semibold">
                  {o.install_time ? formatTimeRange(o.install_time) : "未定时段"}
                </p>
                {o.team_id && (
                  <Badge variant="outline" className="mt-2 text-[10px]">
                    {teamName(o.team_id)}
                  </Badge>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-snug font-medium break-words">{o.raw_address}</p>
                <p className="tabular mt-1 text-xs text-muted-foreground">
                  {o.customer_name}
                  {o.customer_phone ? (
                    <>
                      {" · "}
                      <a href={`tel:${o.customer_phone}`} className="text-primary hover:underline">
                        {o.customer_phone}
                      </a>
                    </>
                  ) : null}
                </p>
                {o.order_content && (
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {o.order_content}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <TimeRangeSelect
                  compact
                  value={o.install_time}
                  onChange={(v) => updateOrder.mutate({ id: o.id, patch: { install_time: v } })}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 flex-1 text-xs"
                    onClick={() => openDraft(o, ymd(anchor))}
                  >
                    改期
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 flex-1 text-xs text-muted-foreground"
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
                    取消约期
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {dayList.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">当日未有安排</p>
          )}
        </div>
      )}

      <Dialog open={!!draftId} onOpenChange={(v) => !v && setDraftId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>安排约期</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">安装日期</Label>
              <Input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">到达时段（起 — 迄）</Label>
              <TimeRangeSelect value={draftTime} onChange={setDraftTime} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">负责队伍</Label>
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
              确认约期
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
