import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Phone } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useOrders, useTeams } from "@/lib/queries";
import { ORDER_TYPE_LABEL, formatTimeRange, ymd, type Order } from "@/lib/domain";

export const Route = createFileRoute("/entry")({
  head: () => ({
    meta: [
      { title: "入 App 清单 — 汉纱排程调度台" },
      {
        name: "description",
        content: "列出今天开始已约期／改期嘅订单，剔选已入 app 后一键从清单移除。",
      },
      { property: "og:title", content: "入 App 清单 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "列出今天开始已约期／改期嘅订单，剔选已入 app 后一键从清单移除。",
      },
    ],
  }),
  component: EntryPage,
});

function EntryPage() {
  const { data: orders = [] } = useOrders();
  const { data: teams = [] } = useTeams();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const teamName = (id: string | null) =>
    id ? (teams.find((t) => t.id === id)?.name ?? "未分队") : "未分队";

  const today = ymd(new Date());
  const list = useMemo(() => {
    return orders
      .filter(
        (o) =>
          !o.in_app &&
          o.status !== "completed" &&
          !!o.install_date &&
          o.install_date >= today,
      )
      .sort((a, b) => {
        const d = (a.install_date ?? "").localeCompare(b.install_date ?? "");
        if (d !== 0) return d;
        return (a.install_time ?? "").localeCompare(b.install_time ?? "");
      });
  }, [orders, today]);

  const selectedIds = Object.keys(picked).filter((k) => picked[k]);
  const allPicked = list.length > 0 && selectedIds.length === list.length;

  const confirm = async () => {
    if (selectedIds.length === 0) return;
    setSaving(true);
    const { error } = await supabase
      .from("orders")
      .update({ in_app: true })
      .in("id", selectedIds);
    setSaving(false);
    if (error) {
      toast.error("更新失败");
      return;
    }
    setPicked({});
    qc.invalidateQueries({ queryKey: ["orders"] });
    toast.success(`已标记 ${selectedIds.length} 张单为已入 app`);
  };

  return (
    <AppShell
      title="入 App 清单"
      subtitle={`待入 app ${list.length} 张 · 只显示今天或之后嘅约期`}
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              setPicked(
                allPicked ? {} : Object.fromEntries(list.map((o) => [o.id, true])),
              )
            }
            disabled={list.length === 0}
          >
            {allPicked ? "取消全选" : "全选"}
          </Button>
          <Button size="sm" onClick={confirm} disabled={saving || selectedIds.length === 0}>
            <CheckCircle2 className="size-4" />
            确定（{selectedIds.length}）
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {list.map((o: Order) => {
          const checked = !!picked[o.id];
          return (
            <label
              key={o.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-sm font-semibold text-primary">
                    {o.install_date}
                  </span>
                  {o.install_time && (
                    <span className="text-xs text-muted-foreground">
                      {formatTimeRange(o.install_time)}
                    </span>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {ORDER_TYPE_LABEL[o.order_type] ?? o.order_type}
                  </Badge>
                  <Badge variant="secondary" className="text-[10px]">
                    {teamName(o.team_id)}
                  </Badge>
                </div>
                <p className="mt-1 truncate text-sm font-medium">{o.customer_name}</p>
                <p className="text-xs text-muted-foreground">{o.raw_address}</p>
                {o.customer_phone && (
                  <span className="mt-0.5 inline-flex items-center gap-1 select-text font-display text-xs text-primary">
                    <Phone className="size-3" />
                    {o.customer_phone}
                  </span>
                )}
                {o.order_content && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.order_content}</p>
                )}
              </div>
              <span className="flex shrink-0 items-center gap-2 rounded border border-border bg-surface px-2 py-1.5">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) =>
                    setPicked((p) => ({ ...p, [o.id]: v === true }))
                  }
                />
                <span className="text-xs">已入 app</span>
              </span>
            </label>
          );
        })}
        {list.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-10 text-center">
            <ClipboardCheck className="mx-auto mb-2 size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">冇待入 app 嘅订单。</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
