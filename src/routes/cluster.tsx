import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, ChevronRight, CopyCheck, MapPin, Users } from "lucide-react";
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
import { haversine, STATUS_LABEL, type Order } from "@/lib/domain";

import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cluster")({
  head: () => ({
    meta: [
      { title: "智能配對 — 漢紗排程調度台" },
      {
        name: "description",
        content: "逐張未約期訂單展開，睇最接近嘅 10 張未完成訂單，逐張填好再一鍵確認排程。",
      },
      { property: "og:title", content: "智能配對 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "逐張未約期訂單展開，睇最接近嘅 10 張未完成訂單，逐張填好再一鍵確認排程。",
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

  const { data: orders = [] } = useOrders();
  const { data: teams = [] } = useTeams();

  const list = useMemo(
    () => orders.filter((o) => o.status === "unscheduled" || o.id === expanded),
    [orders, expanded],
  );

  const unscheduledCount = orders.filter((o) => o.status === "unscheduled").length;

  const nearestOf = (o: Order) => {
    if (o.latitude == null || o.longitude == null) return [];
    return orders
      .filter(
        (x) =>
          x.id !== o.id && x.status !== "completed" && x.latitude != null && x.longitude != null,
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
    toast.success(`已複製排期到 ${pickedIds.length} 張訂單`);
  };

  const confirmAll = async () => {
    const targets = pickedIds.filter((id) => drafts[id]?.date);
    if (targets.length === 0) {
      toast.error("請剔選訂單並填好安裝日期");
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
        })
        .eq("id", id);
      if (error) failed++;
    }
    setSaving(false);
    qc.invalidateQueries({ queryKey: ["orders"] });
    if (failed) toast.error(`${failed} 張訂單套用失敗`);
    else toast.success(`已確認 ${targets.length} 張訂單嘅排程`);
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
            <Badge className="shrink-0 text-[10px]">主體</Badge>
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
          </div>
          {dist != null && (
            <span className="shrink-0 font-display text-xs text-primary">
              {dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`}
            </span>
          )}
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
    <AppShell title="智能配對" subtitle={`共 ${unscheduledCount} 張未約期訂單`}>
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
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      剔選要一齊約嘅訂單，逐張填好日期／時段／隊伍，最後一鍵確認
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyToPicked(o.id)}>
                        <CopyCheck className="size-4" />
                        主體排期套用到已剔
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
                        全部剔選
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {renderRow(o, undefined, true)}
                    {o.latitude == null ? (
                      <p className="text-sm text-muted-foreground">
                        呢張單未有經緯度，請先喺訂單頁做地址解析。
                      </p>
                    ) : near.length === 0 ? (
                      <p className="text-sm text-muted-foreground">附近未有其他未完成訂單。</p>
                    ) : (
                      near.map(({ order: n, dist }) => renderRow(n, dist))
                    )}
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-3">
                    <span className="text-xs text-muted-foreground">
                      已剔選 {pickedIds.length} 張
                    </span>
                    <Button onClick={confirmAll} disabled={saving}>
                      <CheckCheck className="size-4" />
                      一鍵確認排程
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            暫時未有未約期訂單。
          </p>
        )}
      </div>
    </AppShell>
  );
}
