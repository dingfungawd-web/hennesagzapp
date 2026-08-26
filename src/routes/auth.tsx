import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "登入 — 汉纱排程调度台" },
      { name: "description", content: "登入汉纱排程调度台，管理纱窗安装订单与师傅排程。" },
      { property: "og:title", content: "登入 — 汉纱排程调度台" },
      { property: "og:description", content: "登入汉纱排程调度台，管理纱窗安装订单与师傅排程。" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const email = `${username.trim().toLowerCase()}@hansha.local`;
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else {
        const uname = username.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (data.user) {
          await supabase.from("profiles").insert({
            id: data.user.id,
            username: uname,
            email,
            status: "pending",
          });
        }
        toast.success("注册成功，请等待管理员批核后才可使用");
        setMode("signin");
      }

    } catch (err) {
      toast.error(err instanceof Error ? err.message : "登入失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded bg-primary font-display text-base font-bold text-primary-foreground">
            汉
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold">汉纱调度台</h1>
            <p className="text-xs text-muted-foreground">安装排程 · 路线 · 师傅管理</p>
          </div>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6">
          <div className="space-y-2">
            <Label htmlFor="username">用户名称</Label>
            <Input
              id="username"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如：ah-keung"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "处理中…" : mode === "signin" ? "登入" : "建立帐号"}
          </Button>
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "未有帐号？立即注册" : "已有帐号？返回登入"}
          </button>
        </form>
      </div>
    </div>
  );
}
