import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, ChevronRight, CopyCheck, Eye, EyeOff, MapPin, Phone, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrders, useTeams } from "@/lib/queries";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { supabase } from "@/integrations/supabase/client";
import { haversine, isUpcoming, STATUS_LABEL, type Order } from "@/lib/domain";

import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cluster")({
  head: () => ({
    meta: [
      { title: "智能配对 — 汉纱排程调度台" },
      {
        name: "description",
        content: "逐张未约期订单展开，睇最接近嘅 10 张未完成订单，逐张填好再一键确认排程。",
      },
      { property: "og:title", content: "智能配对 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "逐张未约期订单展开，睇最接近嘅 10 张未完成订单，逐张填好再一键确认排程。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClusterPage,
});

type Draft = { date: string; time: string | null; team: string };

function draftOf(o: Order): Draft {
  return { date: o.install_date ?? "", time: o.install_time ?? null, team: o.team_id ?? "none" };
}

function ClusterPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const hiddenCount = Object.values(hidden).filter(Boolean).length;

  const { data: orders = [] } = useOrders();
  const { data: teams = [] } = useTeams();

  const list = useMemo(
    () =>
      orders.filter(
        (o) => (o.status === "unscheduled" || o.id === expanded) && !hidden[o.id],
      ),
    [orders, expanded, hidden],
  );

  const unscheduledCount = orders.filter((o) => o.status === "unscheduled").length;

  const nearestOf = (o: Order) => {
    if (o.latitude == null || o.longitude == null) return [];
    return orders
      .filter(
        (x) =>
          x.id !== o.id &&
          isUpcoming(x) &&
          !hidden[x.id] &&
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

  const toggleExpand = (o: Order) => {
    if (expanded === o.id) {
      setExpanded(null);
      setDrafts({});
      setPicked({});
      return;
    }
    const near = nearestOf(o);
    const next: Record<string, Draft> = { [o.id]: draftOf(o) };
    for (const { order } of near) next[order.id] = draftOf(order);
    setDrafts(next);
    setPicked({ [o.id]: true });
    setExpanded(o.id);
  };

  const patchDraft = (id: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { date: "", time: null, team: "none" }), ...patch } }));

  const pickedIds = Object.keys(picked).filter((id) => picked[id]);

  const copyToPicked = (fromId: string) => {
    const src = drafts[fromId];
    if (!src) return;
    setDrafts((d) => {
      const next = { ...d };
      for (const id of pickedIds) next[id] = { ...src };
      return next;
    });
    toast.success(`已复制排期到 ${pickedIds.length} 张订单`);
  };

  const confirmAll = async () => {
    const targets = pickedIds.filter((id) => drafts[id]?.date);
    if (targets.length === 0) {
      toast.error("请剔选订单并填好安装日期");
      return;
    }
    setSaving(true);
    let failed = 0;
    for (const id of targets) {
      const d = drafts[id]!;
      const { error } = await supabase
        .from("orders")
        .update({
          install_date: d.date,
          install_time: d.time,
          team_id: d.team === "none" ? null : d.team,
          status: "scheduled",
          app_sync_pending: true,
          in_app: false,
        })
        .eq("id", id);
      if (error) failed++;
    }
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["orders"] });
    if (failed) toast.error(`${failed} 张订单套用失败`);
    else toast.success(`已确认 ${targets.length} 张订单嘅排程`);
  };

  const renderRow = (o: Order, dist?: number, isMain = false) => {
    const d = drafts[o.id] ?? { date: "", time: null, team: "none" };
    return (
      <div
        key={o.id}
        className={cn(
          "rounded border p-2",
          isMain ? "border-primary/50 bg-surface" : "border-border bg-surface",
        )}
      >
        <div className="flex items-center gap-3">
          <Checkbox
            checked={!!picked[o.id]}
            onCheckedChange={(v) => setPicked((p) => ({ ...p, [o.id]: !!v }))}
          />
          {isMain ? (
            <Badge className="shrink-0 text-[10px]">主体</Badge>
          ) : (
            <MapPin className="size-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {o.customer_name}
              <Badge variant="outline" className="ml-2 text-xs">
                {STATUS_LABEL[o.status] ?? o.status}
              </Badge>
            </p>
            <p className="truncate text-xs text-muted-foreground">{o.raw_address}</p>
            {o.customer_phone && (
              <a
                href={`tel:${o.customer_phone}`}
                className="mt-0.5 inline-flex items-center gap-1 font-display text-xs text-primary hover:underline"
              >
                <Phone className="size-3" />
                {o.customer_phone}
              </a>
            )}
          </div>
          {dist != null && (
            <span className="shrink-0 font-display text-xs text-primary">
              {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 shrink-0 px-2 text-xs"
            title="隐藏（更新页面后回复）"
            onClick={() => setHidden((h) => ({ ...h, [o.id]: true }))}
          >
            <EyeOff className="size-3.5" />
          </Button>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-[150px_1fr_150px]">
          <Input
            type="date"
            className="h-8 text-xs"
            value={d.date}
            onChange={(e) => patchDraft(o.id, { date: e.target.value })}
          />
          <TimeRangeSelect
            compact
            value={d.time}
            onChange={(v) => patchDraft(o.id, { time: v })}
          />
          <Select value={d.team} onValueChange={(v) => patchDraft(o.id, { team: v })}>
            <SelectTrigger className="h-8 text-xs">
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
    );
  };

  return (
    <AppShell
      title="智能配对"
      subtitle={`共 ${unscheduledCount} 张未约期订单${hiddenCount ? ` · 已隐藏 ${hiddenCount}` : ""}`}
      actions={
        hiddenCount > 0 ? (
          <Button size="sm" variant="outline" onClick={() => setHidden({})}>
            <Eye className="size-4" />
            取消隐藏（{hiddenCount}）
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-2">
        {list.map((o) => {
          const open = expanded === o.id;
          const near = open ? nearestOf(o) : [];
          return (
            <div key={o.id} className="rounded-lg border border-border bg-card">
              <button
                type="button"
                onClick={() => toggleExpand(o)}
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
                  <p className="truncate text-xs text-muted-foreground">
                    {o.raw_address}
                    {o.customer_phone && (
                      <span className="ml-2 font-display text-primary">{o.customer_phone}</span>
                    )}
                  </p>
                </div>
                {o.latitude == null && (
                  <Badge variant="outline" className="shrink-0 text-xs">
                    未定位
                  </Badge>
                )}
              </button>

              {open && (
                <div className="border-t border-border p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      剔选要一齐约嘅订单，逐张填好日期／时段／队伍，最后一键确认
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyToPicked(o.id)}>
                        <CopyCheck className="size-4" />
                        主体排期套用到已剔
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setPicked(
                            Object.fromEntries([o.id, ...near.map((n) => n.order.id)].map((id) => [id, true])),
                          )
                        }
                      >
                        全部剔选
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {renderRow(o, undefined, true)}
                    {o.latitude == null ? (
                      <p className="text-sm text-muted-foreground">
                        呢张单未有经纬度，请先喺订单页做地址解析。
                      </p>
                    ) : near.length === 0 ? (
                      <p className="text-sm text-muted-foreground">附近未有其他未完成订单。</p>
                    ) : (
                      near.map(({ order: n, dist }) => renderRow(n, dist))
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-3">
                    <span className="text-xs text-muted-foreground">
                      已剔选 {pickedIds.length} 张
                    </span>
                    <Button onClick={confirmAll} disabled={saving}>
                      <CheckCheck className="size-4" />
                      一键确认排程
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            暂时未有未约期订单。
          </p>
        )}
      </div>
    </AppShell>
  );
}
