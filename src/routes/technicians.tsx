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
      { title: "師傅隊伍 — 漢紗排程調度台" },
      {
        name: "description",
        content: "管理安裝師傅名單與施工隊伍組合，設定隊型並分派每日安裝訂單。",
      },
      { property: "og:title", content: "師傅隊伍 — 漢紗排程調度台" },
      {
        property: "og:description",
        content: "管理安裝師傅名單與施工隊伍組合，設定隊型並分派每日安裝訂單。",
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
  const [techForm, setTechForm] = useState({ name: "", phone: "", skill_level: "normal" });
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
    if (!techForm.name) return toast.error("請輸入師傅姓名");
    const { error } = await supabase.from("technicians").insert({
      name: techForm.name,
      phone: techForm.phone || null,
      skill_level: techForm.skill_level,
    });
    if (error) return toast.error(error.message);
    toast.success("已新增師傅");
    setTechForm({ name: "", phone: "", skill_level: "normal" });
    setTechOpen(false);
    refresh();
  };

  const addTeam = async () => {
    if (!teamForm.name) return toast.error("請輸入隊伍名稱");
    const { error } = await supabase.from("teams").insert({
      name: teamForm.name,
      team_type: teamForm.team_type,
      member_ids: teamForm.member_ids,
    });
    if (error) return toast.error(error.message);
    toast.success("已建立隊伍");
    setTeamForm({ name: "", team_type: "standard", member_ids: [] });
    setTeamOpen(false);
    refresh();
  };

  const removeTech = async (id: string) => {
    if (!confirm("確定刪除呢位師傅？")) return;
    const { error } = await supabase.from("technicians").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const removeTeam = async (id: string) => {
    if (!confirm("確定刪除呢隊？")) return;
    const { error } = await supabase.from("teams").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const memberNames = (ids: string[]) =>
    ids
      .map((id) => technicians.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join("、") || "未編配";

  return (
    <AppShell
      title="師傅隊伍"
      subtitle={`${technicians.length} 位師傅 · ${teams.length} 隊`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setTechOpen(true)}>
            <UserRound className="size-4" />
            新增師傅
          </Button>
          <Button size="sm" onClick={() => setTeamOpen(true)}>
            <Plus className="size-4" />
            建立隊伍
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 font-display text-sm font-semibold">師傅名單</p>
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
                  <Badge variant="outline">{t.skill_level === "senior" ? "資深" : "一般"}</Badge>
                  <button
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => removeTech(t.id)}
                    aria-label="刪除師傅"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            ))}
            {technicians.length === 0 && (
              <p className="text-xs text-muted-foreground">未有師傅資料</p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 font-display text-sm font-semibold">施工隊伍</p>
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
                      aria-label="刪除隊伍"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  成員：{memberNames(tm.member_ids)}
                </p>
              </div>
            ))}
            {teams.length === 0 && <p className="text-xs text-muted-foreground">未有隊伍</p>}
          </div>
        </section>
      </div>

      <Dialog open={techOpen} onOpenChange={setTechOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增師傅</DialogTitle>
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
              <Label>電話</Label>
              <Input
                value={techForm.phone}
                onChange={(e) => setTechForm({ ...techForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>技能等級</Label>
              <Select
                value={techForm.skill_level}
                onValueChange={(v) => setTechForm({ ...techForm, skill_level: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">一般</SelectItem>
                  <SelectItem value="senior">資深</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTechOpen(false)}>
              取消
            </Button>
            <Button onClick={addTech}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={teamOpen} onOpenChange={setTeamOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>建立隊伍</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>隊伍名稱 *</Label>
              <Input
                value={teamForm.name}
                onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>隊型</Label>
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
              <Label>成員</Label>
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
                  <p className="text-xs text-muted-foreground">請先新增師傅</p>
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
