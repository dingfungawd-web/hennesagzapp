import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  MapPin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Sparkles,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { useOrders, useTeams, useDeleteOrder, useUpdateOrder } from "@/lib/queries";
import {
  GEO_LABEL,
  STATUS_LABEL,
  ORDER_TYPE_LABEL,
  URGENCY_TONE,
  formatTimeRange,
  urgencyOf,
  urgencyRank,
  type Order,
} from "@/lib/domain";
import { TimeRangeSelect } from "@/components/TimeRangeSelect";
import { geocodeAddresses } from "@/lib/amap.functions";
import { suggestAddress } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "约期提醒 — 汉纱排程调度台" },
      {
        name: "description",
        content: "以死线排序嘅约期提醒列表：跟进单置顶、安装单收订 +7 日死线，逾期同紧急自动标色。",
      },
      { property: "og:title", content: "约期提醒 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "以死线排序嘅约期提醒列表：跟进单置顶、安装单收订 +7 日死线，逾期同紧急自动标色。",
      },
    ],
  }),
  component: OrdersPage,
});

const emptyForm = {
  order_type: "install",
  deposit_date: "",
  customer_name: "",
  customer_phone: "",
  raw_address: "",
  order_content: "",
  measure_date: "",
  notes: "",
};

function statusTone(status: string) {
  if (status === "scheduled") return "bg-primary/15 text-primary border-primary/30";
  if (status === "completed") return "bg-success/15 text-success border-success/30";
  return "bg-muted text-muted-foreground border-border";
}

function reminderText(
  o: { order_type: string; status: string; deposit_date: string | null },
  u: ReturnType<typeof urgencyOf>,
) {
  if (o.status !== "unscheduled") return "已处理";
  if (o.order_type === "followup") return "跟进急单";
  if (!u.deadline) return "未有收订日期";
  if (u.days === null) return u.deadline;
  if (u.days < 0) return `逾期 ${Math.abs(u.days)} 日（${u.deadline}）`;
  if (u.days === 0) return `今日到期（${u.deadline}）`;
  return `仲有 ${u.days} 日（${u.deadline}）`;
}

function OrdersPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<string>("unscheduled");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [keyword, setKeyword] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<{ id: string; list: string[] } | null>(null);
  const [geoFilter, setGeoFilter] = useState<string>("all");

  const { data: orders = [], isLoading } = useOrders(status === "all" ? undefined : { status });
  const { data: failedOrders = [] } = useOrders({ geoStatus: "failed" });
  const { data: teams = [] } = useTeams();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();

  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? "—";

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    let list = orders;
    if (typeFilter !== "all") list = list.filter((o) => o.order_type === typeFilter);
    if (geoFilter !== "all") list = list.filter((o) => o.geo_status === geoFilter);
    if (k)
      list = list.filter((o) =>
        [o.customer_name, o.customer_phone, o.raw_address, o.order_content, o.order_no]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(k)),
      );
    return [...list].sort((a, b) => urgencyRank(a) - urgencyRank(b));
  }, [orders, keyword, typeFilter, geoFilter]);

  const waiting = orders.filter((o) => o.status === "unscheduled");
  const overdueCount = waiting.filter((o) => urgencyOf(o).level === "overdue").length;
  const urgentCount = waiting.filter((o) => urgencyOf(o).level === "urgent").length;
  const failedCount = failedOrders.length;


  const createOrder = async () => {
    if (!form.customer_name || !form.raw_address) {
      toast.error("客户姓名同地址系必填");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("orders").insert({
      order_type: form.order_type,
      deposit_date: form.deposit_date || null,
      customer_name: form.customer_name,
      customer_phone: form.customer_phone || null,
      raw_address: form.raw_address,
      order_content: form.order_content || null,
      measure_date: form.measure_date || null,
      notes: form.notes || null,
    });
    setBusy(false);
    if (error) {
      toast.error("新增失败：" + error.message);
      return;
    }
    toast.success("已新增订单");
    setForm(emptyForm);
    setCreateOpen(false);
    qc.invalidateQueries({ queryKey: ["orders"] });
  };

  const geocodeAll = async () => {
    const targets = orders.filter((o) => o.geo_status !== "confirmed");
    if (targets.length === 0) {
      toast.info("冇待解析嘅地址");
      return;
    }
    setBusy(true);
    const toastId = toast.loading(`解析中… 共 ${targets.length} 单`);
    try {
      const res = await geocodeAddresses({
        data: { items: targets.map((o) => ({ id: o.id, address: o.raw_address })) },
      });
      if (!res.configured) {
        toast.error("未设定高德 API Key", { id: toastId });
        return;
      }
      let ok = 0;
      for (const r of res.results) {
        if (r.ok) {
          ok++;
          await supabase
            .from("orders")
            .update({
              latitude: r.lat ?? null,
              longitude: r.lon ?? null,
              normalized_address: r.formatted ?? null,
              geo_status: "confirmed",
            })
            .eq("id", r.id);
        } else {
          await supabase.from("orders").update({ geo_status: "failed" }).eq("id", r.id);
        }
      }
      toast.success(`解析完成：${ok} 成功 / ${res.results.length - ok} 失败`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "解析失败", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  const askAi = async (order: Order) => {
    const toastId = toast.loading("AI 分析地址中…");
    const res = await suggestAddress({ data: { rawAddress: order.raw_address } });
    if (!res.success) {
      toast.error(res.error ?? "AI 分析失败", { id: toastId });
      return;
    }
    toast.dismiss(toastId);
    setSuggestions({ id: order.id, list: res.suggestions.map((s) => s.address) });
  };

  return (
    <AppShell
      title="约期提醒"
      subtitle={`待约期 ${waiting.length} 张 · 逾期 ${overdueCount} · 紧急 ${urgentCount}（跟进单置顶，安装单以收订 +7 日死线排序）`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={geocodeAll} disabled={busy}>
            <RefreshCw className={cn("size-4", busy && "animate-spin")} />
            一键解析地址
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            新增订单
          </Button>
        </>
      }
    >
      {failedCount > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
          <MapPin className="size-4 text-destructive" />
          <p className="text-sm">
            有 <span className="font-semibold text-destructive">{failedCount}</span> 条地址解析失败，需要人手修正。
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setStatus("all");
              setGeoFilter("failed");
              setTypeFilter("all");
              setKeyword("");
            }}
          >
            只看解析失败
          </Button>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="搜寻姓名／电话／地址／订单号"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        </div>
        <Select value={geoFilter} onValueChange={setGeoFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部定位</SelectItem>
            <SelectItem value="failed">解析失败</SelectItem>
            <SelectItem value="pending">待解析</SelectItem>
            <SelectItem value="confirmed">已定位</SelectItem>
          </SelectContent>
        </Select>

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="install">安装单</SelectItem>
            <SelectItem value="followup">跟进单</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="unscheduled">待约期</SelectItem>
            <SelectItem value="scheduled">已约期</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="hidden grid-cols-[1.2fr_2.2fr_1.3fr_0.9fr_1fr_auto] gap-4 border-b border-border px-4 py-2.5 text-[11px] tracking-wider text-muted-foreground lg:grid">
          <span>客户</span>
          <span>地址</span>
          <span>死线／提醒</span>
          <span>状态</span>
          <span>安装</span>
          <span className="w-8" />
        </div>
        {isLoading && <p className="p-6 text-sm text-muted-foreground">载入中…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground">未有订单，可以由汇入或者新增开始。</p>
        )}
        {filtered.map((o) => {
          const open = expanded === o.id;
          const u = urgencyOf(o);
          return (
            <div key={o.id} className="border-b border-border last:border-0">
              <button
                className={cn(
                  "grid w-full grid-cols-1 gap-2 px-4 py-3 text-left hover:bg-accent/40 lg:grid-cols-[1.2fr_2.2fr_1.3fr_0.9fr_1fr_auto] lg:items-center lg:gap-4",
                  u.level === "overdue" && "bg-destructive/10",
                  u.level === "urgent" && "bg-warning/10",
                )}
                onClick={() => setExpanded(open ? null : o.id)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span
                      className={cn(
                        "mr-1.5 rounded px-1 py-0.5 text-[10px]",
                        o.order_type === "followup"
                          ? "bg-warning/20 text-warning"
                          : "bg-primary/20 text-primary",
                      )}
                    >
                      {o.order_type === "followup" ? "跟进" : "安装"}
                    </span>
                    {o.customer_name}
                  </p>
                  <p className="tabular truncate text-xs text-muted-foreground">
                    {o.customer_phone ?? "—"}
                  </p>
                </div>
                <p className="truncate text-sm text-muted-foreground">{o.raw_address}</p>
                <span>
                  <Badge variant="outline" className={URGENCY_TONE[u.level]}>
                    {reminderText(o, u)}
                  </Badge>
                </span>
                <span>
                  <Badge variant="outline" className={statusTone(o.status)}>
                    {STATUS_LABEL[o.status]}
                  </Badge>
                </span>
                <p className="tabular text-sm text-muted-foreground">
                  {o.install_date
                    ? `${o.install_date} ${formatTimeRange(o.install_time)}`.trim()
                    : "—"}
                </p>
                <ChevronDown
                  className={cn(
                    "hidden size-4 text-muted-foreground transition-transform lg:block",
                    open && "rotate-180",
                  )}
                />
              </button>

              {open && (
                <div className="grid gap-4 border-t border-border bg-surface/60 px-4 py-4 md:grid-cols-2">
                  <div className="space-y-3 text-sm">
                    <Field label="订单类型" value={ORDER_TYPE_LABEL[o.order_type] ?? o.order_type} />
                    <Field label="收订日期" value={o.deposit_date ?? "—"} />
                    <Field label="约期死线" value={u.deadline ?? (o.order_type === "followup" ? "跟进单（即刻处理）" : "—")} />
                    <Field label="定位状态" value={GEO_LABEL[o.geo_status] ?? o.geo_status} />
                    <Field label="完整地址" value={o.raw_address} />
                    <Field label="标准化地址" value={o.normalized_address ?? "—"} />
                    <Field
                      label="座标"
                      value={
                        o.latitude && o.longitude
                          ? `${Number(o.latitude).toFixed(5)}, ${Number(o.longitude).toFixed(5)}`
                          : "未定位"
                      }
                    />
                    <Field label="订单内容" value={o.order_content ?? "—"} />
                    <Field label="度尺日期" value={o.measure_date ?? "—"} />
                    <Field label="备注" value={o.notes ?? "—"} />
                    <Field label="负责队伍" value={teamName(o.team_id)} />
                  </div>

                  <div className="space-y-3">
                    <AddressEditor order={o} onDone={() => qc.invalidateQueries({ queryKey: ["orders"] })} />
                    <div className="space-y-3">

                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">安装日期</Label>
                        <Input
                          type="date"
                          value={o.install_date ?? ""}
                          onChange={(e) =>
                            updateOrder.mutate({
                              id: o.id,
                              patch: {
                                install_date: e.target.value || null,
                                status: e.target.value ? "scheduled" : "unscheduled",
                              },
                            })
                          }
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">到达时段（起 — 迄）</Label>
                        <TimeRangeSelect
                          value={o.install_time}
                          onChange={(v) =>
                            updateOrder.mutate({ id: o.id, patch: { install_time: v } })
                          }
                        />
                      </div>
                      {(o.install_date || o.status === "scheduled") && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
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
                      )}
                    </div>



                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">负责队伍</Label>
                      <Select
                        value={o.team_id ?? "none"}
                        onValueChange={(v) =>
                          updateOrder.mutate({
                            id: o.id,
                            patch: { team_id: v === "none" ? null : v },
                          })
                        }
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

                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">订单状态</Label>
                      <Select
                        value={o.status}
                        onValueChange={(v) => updateOrder.mutate({ id: o.id, patch: { status: v } })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unscheduled">未约期</SelectItem>
                          <SelectItem value="scheduled">已约期</SelectItem>
                          <SelectItem value="completed">已完成</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const res = await geocodeAddresses({
                            data: { items: [{ id: o.id, address: o.raw_address }] },
                          });
                          if (!res.configured) {
                            toast.error("未设定高德 API Key");
                            return;
                          }
                          const r = res.results[0] as
                            | { id: string; ok: boolean; lat?: number; lon?: number; formatted?: string }
                            | undefined;
                          if (r?.ok) {
                            await supabase
                              .from("orders")
                              .update({
                                latitude: r.lat ?? null,
                                longitude: r.lon ?? null,
                                normalized_address: r.formatted ?? null,
                                geo_status: "confirmed",
                              })
                              .eq("id", o.id);
                            toast.success("已定位");
                          } else {
                            await supabase
                              .from("orders")
                              .update({ geo_status: "failed" })
                              .eq("id", o.id);
                            toast.error("解析失败，请手动修正地址");
                          }
                          qc.invalidateQueries({ queryKey: ["orders"] });
                        }}
                      >
                        <MapPin className="size-4" />
                        解析地址
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => askAi(o)}>
                        <Sparkles className="size-4" />
                        AI 补全地址
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => {
                          if (confirm("确定删除呢张订单？")) deleteOrder.mutate(o.id);
                        }}
                      >
                        <Trash2 className="size-4" />
                        删除
                      </Button>
                    </div>

                    {suggestions?.id === o.id && (
                      <div className="space-y-2 rounded border border-border bg-card p-3">
                        <p className="text-xs text-muted-foreground">AI 建议地址（点击套用）</p>
                        {suggestions.list.map((s) => (
                          <button
                            key={s}
                            className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
                            onClick={() => {
                              updateOrder.mutate({
                                id: o.id,
                                patch: { raw_address: s, geo_status: "pending" },
                              });
                              setSuggestions(null);
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增订单</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>订单类型</Label>
                <Select
                  value={form.order_type}
                  onValueChange={(v) => setForm({ ...form, order_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="install">安装单</SelectItem>
                    <SelectItem value="followup">跟进单</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.order_type === "install" && (
                <div className="space-y-1.5">
                  <Label>收订日期（+7 日死线）</Label>
                  <Input
                    type="date"
                    value={form.deposit_date}
                    onChange={(e) => setForm({ ...form, deposit_date: e.target.value })}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>客户姓名 *</Label>
                <Input
                  value={form.customer_name}
                  onChange={(e) => setForm({ ...form, customer_name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>电话</Label>
                <Input
                  value={form.customer_phone}
                  onChange={(e) => setForm({ ...form, customer_phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>地址 *</Label>
              <Textarea
                rows={2}
                value={form.raw_address}
                onChange={(e) => setForm({ ...form, raw_address: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>订单内容</Label>
                <Input
                  value={form.order_content}
                  onChange={(e) => setForm({ ...form, order_content: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>度尺日期</Label>
                <Input
                  type="date"
                  value={form.measure_date}
                  onChange={(e) => setForm({ ...form, measure_date: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>备注</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={createOrder} disabled={busy}>
              储存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[80px_1fr] gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}
