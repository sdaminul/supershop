import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Store } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import logoImage from "@/assets/images/logo.png";

export interface NavItem { to: string; label: string; icon?: ReactNode }

export function Shell({ nav, title, children }: { nav: NavItem[]; title: string; children: ReactNode }) {
  const auth = useAuth();
  const nav2 = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col absolute left-0 top-0 bottom-0 z-50">
        <div className="px-4 py-4 border-b border-sidebar-border flex items-center gap-2">
          {/* <div className="font-semibold">{title}</div> */}
          <img 
            src={logoImage} 
            alt="NikoBazar Logo" 
            className="h-8 mx-auto"
          />
        </div>
        <nav className="overflow-auto py-2">
          {nav.map((n) => {
            const active = pathname === n.to || pathname.startsWith(n.to + "/");
            return (
              <Link key={n.to} to={n.to} className={`flex items-center gap-2 px-5 py-3 text-sm hover:bg-sidebar-accent ${active ? "bg-sidebar-accent font-medium" : ""}`}>
                {n.icon}{n.label}
              </Link>
            );
          })}
        </nav>
        <div className="py-4 ps-5 pe-3 border-t border-sidebar-border flex items-center justify-between gap-2">
          <div className="flex flex-col items-start w-full">
            <div className="truncate font-medium text-md">{auth.profile?.name ?? auth.user?.email}</div>
            <div className="text-muted-foreground capitalize text-xs">{auth.isAdmin ? "admin" : auth.role ?? "user"}</div>
          </div>
          <Button variant="ghost" size="sm" className="justify-end px-2" onClick={async () => { await auth.signOut(); nav2({ to: "/login" }); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto" style={{ marginLeft: "240px" }}>
        <div className="p-6 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}