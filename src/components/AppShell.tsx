import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ClipboardList,
  CalendarRange,
  Map as MapIcon,
  Sparkles,
  Camera,
  FileSpreadsheet,
  Users,
  LogOut,
  Menu,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "订单列表", icon: ClipboardList },
  { to: "/schedule", label: "排程日历", icon: CalendarRange },
  { to: "/map", label: "地图路线", icon: MapIcon },
  { to: "/cluster", label: "智能配对", icon: Sparkles },
  { to: "/screenshot-import", label: "截图汇入", icon: Camera },
  { to: "/import", label: "Excel 汇入", icon: FileSpreadsheet },
  { to: "/technicians", label: "师傅队伍", icon: Users },
] as const;

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setChecked(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (checked && !session) navigate({ to: "/auth" });
  }, [checked, session, navigate]);

  if (!checked || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">载入中…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:translate-x-0",
          navOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
          <div className="flex size-8 items-center justify-center rounded bg-primary font-display text-sm font-bold text-primary-foreground">
            汉
          </div>
          <div className="leading-tight">
            <p className="font-display text-sm font-semibold text-sidebar-foreground">汉纱调度台</p>
            <p className="text-[11px] text-muted-foreground">安装排程系统</p>
          </div>
        </div>
        <p className="px-5 pt-5 pb-2 text-[11px] font-medium tracking-widest text-muted-foreground">
          功能导览
        </p>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setNavOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-primary"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="truncate px-2 pb-2 text-xs text-muted-foreground">{session.user.email}</p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" />
            登出
          </Button>
        </div>
      </aside>

      {navOpen && (
        <button
          aria-label="关闭选单"
          className="fixed inset-0 z-30 bg-background/70 lg:hidden"
          onClick={() => setNavOpen(false)}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setNavOpen(true)}
            aria-label="开启选单"
          >
            <Menu className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
