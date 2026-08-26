import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Check, X, RotateCcw } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  useAllProfiles,
  useMyAccount,
  useSetProfileStatus,
  PROFILE_STATUS_LABEL,
  type Profile,
} from "@/lib/account";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "帐户后台 — 汉纱排程调度台" },
      { name: "description", content: "主管理员后台：批核同事的帐户注册申请，管理系统使用权限。" },
      { property: "og:title", content: "帐户后台 — 汉纱排程调度台" },
      { property: "og:description", content: "主管理员后台：批核同事的帐户注册申请。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-500",
  approved: "bg-emerald-500/15 text-emerald-500",
  rejected: "bg-destructive/15 text-destructive",
};

function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: account } = useMyAccount(session?.user.id);
  const isAdmin = account?.isAdmin ?? false;
  const { data: profiles = [], isLoading } = useAllProfiles();
  const setStatus = useSetProfileStatus();

  const act = (p: Profile, status: "approved" | "rejected" | "pending") => {
    setStatus.mutate(
      { id: p.id, status },
      {
        onSuccess: () => toast.success(`${p.username ?? p.email} 已设为${PROFILE_STATUS_LABEL[status]}`),
        onError: (e) => toast.error(e instanceof Error ? e.message : "操作失败"),
      },
    );
  };

  const pending = profiles.filter((p) => p.status === "pending");
  const others = profiles.filter((p) => p.status !== "pending");

  const row = (p: Profile) => (
    <div
      key={p.id}
      className="flex flex-wrap items-center gap-3 rounded border border-border bg-card px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.username ?? "（未命名）"}</p>
        <p className="truncate text-xs text-muted-foreground">{p.email}</p>
      </div>
      <span
        className={cn(
          "rounded px-2 py-0.5 text-[11px] font-medium",
          STATUS_CLASS[p.status] ?? "bg-muted text-muted-foreground",
        )}
      >
        {PROFILE_STATUS_LABEL[p.status] ?? p.status}
      </span>
      <div className="flex gap-2">
        {p.status !== "approved" && (
          <Button size="sm" onClick={() => act(p, "approved")}>
            <Check className="size-4" />
            批准
          </Button>
        )}
        {p.status === "pending" && (
          <Button size="sm" variant="outline" onClick={() => act(p, "rejected")}>
            <X className="size-4" />
            拒绝
          </Button>
        )}
        {p.status === "approved" && p.id !== session?.user.id && (
          <Button size="sm" variant="outline" onClick={() => act(p, "rejected")}>
            <X className="size-4" />
            停用
          </Button>
        )}
        {p.status === "rejected" && (
          <Button size="sm" variant="ghost" onClick={() => act(p, "pending")}>
            <RotateCcw className="size-4" />
            重设待审
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AppShell title="帐户后台" subtitle="批核同事的注册申请，管理系统使用权限">
      {!isAdmin ? (
        <div className="rounded border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          只有主管理员可以使用帐户后台。
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              <h2 className="font-display text-base font-semibold">待审批（{pending.length}）</h2>
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">载入中…</p>
            ) : pending.length === 0 ? (
              <p className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                目前没有待审批的注册申请
              </p>
            ) : (
              <div className="space-y-2">{pending.map(row)}</div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-base font-semibold">所有帐户（{others.length}）</h2>
            <div className="space-y-2">{others.map(row)}</div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
