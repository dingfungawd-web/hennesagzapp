import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Users, UserRound } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { supabase } from "@/integrations/supabase/client";
import { useTeams, useTechnicians } from "@/lib/queries";
import { TEAM_TYPE_LABEL } from "@/lib/domain";

export const Route = createFileRoute("/technicians")({
  head: () => ({
    meta: [
      { title: "师傅队伍 — 汉纱排程调度台" },
      {
        name: "description",
        content: "管理安装师傅名单与施工队伍组合，设定队型并分派每日安装订单。",
      },
      { property: "og:title", content: "师傅队伍 — 汉纱排程调度台" },
      {
        property: "og:description",
        content: "管理安装师傅名单与施工队伍组合，设定队型并分派每日安装订单。",
      },
    ],
  }),
  component: TechniciansPage,
});

function TechniciansPage() {
  const qc = useQueryClient();
  const { data: technicians = [] } = useTechnicians();
  const { data: teams = [] } = useTeams();
  const [techOpen, setTechOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [techForm, setTechForm] = useState({ name: "", phone: "" });
  const [teamForm, setTeamForm] = useState({
    name: "",
    team_type: "standard",
    member_ids: [] as string[],
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["technicians"] });
    qc.invalidateQueries({ queryKey: ["teams"] });
  };

  const addTech = async () => {
    if (!techForm.name) {
      toast.error("请输入师傅姓名");
      return;
    }
    const { error } = await supabase.from("technicians").insert({
      name: techForm.name,
      phone: techForm.phone || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已新增师傅");
    setTechForm({ name: "", phone: "" });
    setTechOpen(false);
    refresh();
  };

  const addTeam = async () => {
    if (!teamForm.name) {
      toast.error("请输入队伍名称");
      return;
    }
    const { error } = await supabase.from("teams").insert({
      name: teamForm.name,
      team_type: teamForm.team_type,
      member_ids: teamForm.member_ids,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("已建立队伍");
    setTeamForm({ name: "", team_type: "standard", member_ids: [] });
    setTeamOpen(false);
    refresh();
  };

  const removeTech = async (id: string) => {
    if (!confirm("确定删除呢位师傅？")) return;
    const { error } = await supabase.from("technicians").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const removeTeam = async (id: string) => {
    if (!confirm("确定删除呢队？")) return;
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    refresh();
  };

  const memberNames = (ids: string[]) =>
    ids
      .map((id) => technicians.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join("、") || "未编配";

  return (
    <AppShell
      title="师傅队伍"
      subtitle={`${technicians.length} 位师傅 · ${teams.length} 队`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setTechOpen(true)}>
            <UserRound className="size-4" />
            新增师傅
          </Button>
          <Button size="sm" onClick={() => setTeamOpen(true)}>
            <Plus className="size-4" />
            建立队伍
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 font-display text-sm font-semibold">师傅名单</p>
          <div className="space-y-2">
            {technicians.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded border border-border bg-surface px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="tabular text-xs text-muted-foreground">{t.phone ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline">{t.is_active ? "在职" : "停用"}</Badge>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeTech(t.id)}
                    aria-label="删除师傅"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
            {technicians.length === 0 && (
              <p className="text-xs text-muted-foreground">未有师傅资料</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 font-display text-sm font-semibold">施工队伍</p>
          <div className="space-y-2">
            {teams.map((tm) => (
              <div key={tm.id} className="rounded border border-border bg-surface px-3 py-2">
                <div className="flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Users className="size-4 text-primary" />
                    {tm.name}
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{TEAM_TYPE_LABEL[tm.team_type] ?? tm.team_type}</Badge>
                    <button
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => removeTeam(tm.id)}
                      aria-label="删除队伍"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  成员：{memberNames(tm.member_ids)}
                </p>
              </div>
            ))}
            {teams.length === 0 && <p className="text-xs text-muted-foreground">未有队伍</p>}
          </div>
        </section>
      </div>

      <Dialog open={techOpen} onOpenChange={setTechOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增师傅</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>姓名 *</Label>
              <Input
                value={techForm.name}
                onChange={(e) => setTechForm({ ...techForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>电话</Label>
              <Input
                value={techForm.phone}
                onChange={(e) => setTechForm({ ...techForm, phone: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechOpen(false)}>
              取消
            </Button>
            <Button onClick={addTech}>储存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>建立队伍</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>队伍名称 *</Label>
              <Input
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>队型</Label>
              <Select
                value={teamForm.team_type}
                onValueChange={(v) => setTeamForm({ ...teamForm, team_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEAM_TYPE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>成员</Label>
              <div className="max-h-48 space-y-2 overflow-auto rounded border border-border p-3">
                {technicians.map((t) => {
                  const checked = teamForm.member_ids.includes(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) =>
                          setTeamForm({
                            ...teamForm,
                            member_ids: v
                              ? [...teamForm.member_ids, t.id]
                              : teamForm.member_ids.filter((id) => id !== t.id),
                          })
                        }
                      />
                      {t.name}
                    </label>
                  );
                })}
                {technicians.length === 0 && (
                  <p className="text-xs text-muted-foreground">请先新增师傅</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTeamOpen(false)}>
              取消
            </Button>
            <Button onClick={addTeam}>建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
