import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronRight, MapPin, Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrders, useTeams, useUpdateOrder } from "@/lib/queries";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { supabase } from "@/integrations/supabase/client";
import { haversine, STATUS_LABEL, type Order } from "@/lib/domain";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cluster")({
  head: () => ({
    meta: [
      { title: "智能配對 — 漢紗排程調度台" },
      {
        name: "description",
        content: "逐張未約期訂單展開，睇最接近嘅 10 張未完成訂單，一鍵套用同日排程。",
      },
      { property: "og:title", content: "智能配對 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "逐張未約期訂單展開，睇最接近嘅 10 張未完成訂單，一鍵套用同日排程。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClusterPage,
});

function ClusterPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applyFor, setApplyFor] = useState<Order[] | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("none");
  const [teamId, setTeamId] = useState("none");
  const [saving, setSaving] = useState(false);

  const { data: orders = [] } = useOrders();
  const { data: teams = [] } = useTeams();

  const unscheduled = useMemo(
    () => orders.filter((o) => o.status === "unscheduled"),
    [orders],
  );

  const openApply = (list: Order[]) => {
    setApplyFor(list);
    setDate(list[0]?.install_date ?? "");
    setTime(list[0]?.install_time ?? "none");
    setTeamId(list[0]?.team_id ?? "none");
  };

  const nearestOf = (o: Order) => {
    if (o.latitude == null || o.longitude == null) return [];
    return orders
      .filter(
        (x) =>
          x.id !== o.id &&
          x.status !== "completed" &&
          x.latitude != null &&
          x.longitude != null,
      )
      .map((x) => ({
        order: x,
        dist: haversine(
          Number(o.latitude),
          Number(o.longitude),
          Number(x.latitude),
          Number(x.longitude),
        ),
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 10);
  };

  const applySchedule = async () => {
    if (!applyFor) return;
    if (!date) {
      toast.error("請揀安裝日期");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .update({
        install_date: date,
        install_time: time === "none" ? null : time,
        team_id: teamId === "none" ? null : teamId,
        status: "scheduled",
      })
      .in(
        "id",
        applyFor.map((o) => o.id),
      );
    setSaving(false);
    if (error) {
      toast.error("套用失敗：" + error.message);
      return;
    }
    toast.success(`已套用排程到 ${applyFor.length} 張訂單`);
    setApplyFor(null);
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  return (
    <AppShell title="智能配對" subtitle={`共 ${unscheduled.length} 張未約期訂單`}>
      <div className="space-y-2">
        {unscheduled.map((o) => {
          const open = expanded === o.id;
          const near = open ? nearestOf(o) : [];
          return (
            <div key={o.id} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : o.id)}
                className="flex w-full items-center gap-3 p-3 text-left"
              >
                <ChevronRight
                  className={cn("size-4 shrink-0 transition-transform", open && "rotate-90")}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {o.customer_name}
                    {o.order_no && (
                      <span className="ml-2 text-xs text-muted-foreground">#{o.order_no}</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{o.raw_address}</p>
                </div>
                {o.latitude == null && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    未定位
                  </Badge>
                )}
              </button>

              {open && (
                <div className="border-t border-border p-3">
                  <div className="mb-3 rounded border border-border bg-surface p-2">
                    <p className="mb-2 text-xs text-muted-foreground">呢張單嘅排期</p>
                    <RowSchedule order={o} />
                  </div>

                  {o.latitude == null ? (
                    <p className="text-sm text-muted-foreground">
                      呢張單未有經緯度，請先喺訂單頁做地址解析。
                    </p>
                  ) : near.length === 0 ? (
                    <p className="text-sm text-muted-foreground">附近未有其他未完成訂單。</p>
                  ) : (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          最接近嘅 {near.length} 張未完成訂單
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openApply([o, ...near.map((n) => n.order)])}
                        >
                          <Sparkles className="size-4" />
                          全部套用排程
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {near.map(({ order: n, dist }) => (
                          <div
                            key={n.id}
                            className="rounded border border-border bg-surface p-2"
                          >
                            <div className="flex items-center gap-3">
                              <MapPin className="size-4 shrink-0 text-primary" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">
                                  {n.customer_name}
                                  <Badge variant="outline" className="ml-2 text-xs">
                                    {STATUS_LABEL[n.status] ?? n.status}
                                  </Badge>
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {n.raw_address}
                                </p>
                              </div>
                              <span className="shrink-0 font-display text-xs text-primary">
                                {dist < 1
                                  ? `${Math.round(dist * 1000)} m`
                                  : `${dist.toFixed(1)} km`}
                              </span>
                              <Button size="sm" variant="ghost" onClick={() => openApply([o, n])}>
                                一齊排
                              </Button>
                            </div>
                            <RowSchedule order={n} className="mt-2" />
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                </div>
              )}
            </div>
          );
        })}
        {unscheduled.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            暫時未有未約期訂單。
          </p>
        )}
      </div>

      <Dialog open={applyFor !== null} onOpenChange={(v) => !v && setApplyFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>套用排程（{applyFor?.length ?? 0} 張訂單）</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>安裝日期 *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>到達時段（起 — 迄）</Label>
              <TimeRangeSelect
                value={time === "none" ? null : time}
                onChange={(v) => setTime(v ?? "none")}
              />
            </div>

            <div className="space-y-1.5">
              <Label>負責隊伍</Label>
              <Select value={teamId} onValueChange={setTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="未分配" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未分配</SelectItem>
                  {teams.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <Users className="size-3.5" />
                        {t.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyFor(null)}>
              取消
            </Button>
            <Button onClick={applySchedule} disabled={saving}>
              確認套用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function RowSchedule({ order, className }: { order: Order; className?: string }) {
  const updateOrder = useUpdateOrder();
  return (
    <div className={cn("grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]", className)}>
      <Input
        type="date"
        className="h-8 text-xs"
        value={order.install_date ?? ""}
        onChange={(e) =>
          updateOrder.mutate({
            id: order.id,
            patch: {
              install_date: e.target.value || null,
              status: e.target.value ? "scheduled" : "unscheduled",
            },
          })
        }
      />
      <TimeRangeSelect
        compact
        value={order.install_time}
        onChange={(v) => updateOrder.mutate({ id: order.id, patch: { install_time: v } })}
      />
    </div>
  );
}
