import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import { useOrders, useTeams } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { haversine, TIME_OPTIONS, type Order } from "@/lib/domain";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/cluster")({
  head: () => ({
    meta: [
      { title: "智能配對 — 漢紗排程調度台" },
      {
        name: "description",
        content: "用地理距離自動將鄰近訂單分組，一鍵套用同日排程、時段與隊伍。",
      },
      { property: "og:title", content: "智能配對 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "用地理距離自動將鄰近訂單分組，一鍵套用同日排程、時段與隊伍。",
      },
    ],
  }),
  component: ClusterPage,
});

function ClusterPage() {
  const qc = useQueryClient();
  const [radius, setRadius] = useState(3);
  const [maxSize, setMaxSize] = useState(4);
  const [applyFor, setApplyFor] = useState<Order[] | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("none");
  const [teamId, setTeamId] = useState("none");
  const [saving, setSaving] = useState(false);

  const { data: orders = [] } = useOrders();
  const { data: teams = [] } = useTeams();

  const clusters = useMemo(() => {
    const pool = orders.filter((o) => o.latitude && o.longitude && o.status !== "completed");
    const used = new Set<string>();
    const groups: Order[][] = [];
    for (const seed of pool) {
      if (used.has(seed.id)) continue;
      const group = [seed];
      used.add(seed.id);
      for (const other of pool) {
        if (used.has(other.id) || group.length >= maxSize) continue;
        const d = haversine(
          Number(seed.latitude),
          Number(seed.longitude),
          Number(other.latitude),
          Number(other.longitude),
        );
        if (d <= radius) {
          group.push(other);
          used.add(other.id);
        }
      }
      groups.push(group);
    }
    return groups.sort((a, b) => b.length - a.length);
  }, [orders, radius, maxSize]);

  const multi = clusters.filter((g) => g.length > 1);

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
    <AppShell
      title="智能配對"
      subtitle={`半徑 ${radius} km 內共找到 ${multi.length} 組可合併訂單`}
    >
      <div className="mb-4 grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">聚合半徑：{radius} km</Label>
          <Slider
            value={[radius]}
            min={1}
            max={15}
            step={1}
            onValueChange={(v) => setRadius(v[0] ?? 3)}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">每組上限：{maxSize} 單</Label>
          <Slider
            value={[maxSize]}
            min={2}
            max={8}
            step={1}
            onValueChange={(v) => setMaxSize(v[0] ?? 4)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {multi.map((group, i) => (
          <div key={group[0]?.id ?? i} className="rounded-lg border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-display text-sm font-semibold">
                第 {i + 1} 組
                <Badge variant="outline" className="ml-2 border-primary/30 bg-primary/10 text-primary">
                  {group.length} 單
                </Badge>
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setApplyFor(group);
                  setDate(group[0]?.install_date ?? "");
                  setTime(group[0]?.install_time ?? "none");
                  setTeamId(group[0]?.team_id ?? "none");
                }}
              >
                <Sparkles className="size-4" />
                套用排程
              </Button>
            </div>
            <div className="space-y-2">
              {group.map((o) => (
                <div key={o.id} className="rounded border border-border bg-surface p-2">
                  <p className="truncate text-sm font-medium">{o.customer_name}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{o.raw_address}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
        {multi.length === 0 && (
          <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            未找到可配對嘅訂單，可以放大聚合半徑再試。
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
              <Label>到達時段</Label>
              <Select value={time} onValueChange={setTime}>
                <SelectTrigger>
                  <SelectValue placeholder="未指定" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="none">未指定</SelectItem>
                  {TIME_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
