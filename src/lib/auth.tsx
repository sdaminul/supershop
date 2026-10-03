import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase, type Role } from "./supabase";

// Minimal local-auth shapes (backed by local PostgreSQL, not Supabase Auth).
export interface LocalUser { id: string; email: string }
export interface LocalSession { user: LocalUser }

export interface RoleRow { role: Role; branch_id: string | null }
export interface AuthState {
  loading: boolean;
  user: LocalUser | null;
  session: LocalSession | null;
  roles: RoleRow[];
  isAdmin: boolean;
  role: Role | null;
  branchId: string | null;
  profile: { id: string; name: string; username: string | null; email: string | null } | null;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<LocalSession | null>(null);
  const [user, setUser] = useState<LocalUser | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [profile, setProfile] = useState<AuthState["profile"]>(null);
  const [loading, setLoading] = useState(true);

  async function loadContext(u: LocalUser | null) {
    if (!u) { setRoles([]); setProfile(null); return; }
    const [{ data: rs }, { data: p }] = await Promise.all([
      supabase.from("user_roles").select("role,branch_id").eq("user_id", u.id),
      supabase.from("profiles").select("id,name,username,email").eq("id", u.id).maybeSingle(),
    ]);
    setRoles((rs ?? []) as RoleRow[]);
    setProfile(p as any);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session); setUser(data.session?.user ?? null);
      await loadContext(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s); setUser(s?.user ?? null); await loadContext(s?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = roles.some((r) => r.role === "admin");
  const primary = roles.find((r) => r.role !== "admin") ?? roles[0];
  const value: AuthState = {
    loading, user, session, roles, isAdmin,
    role: primary?.role ?? null,
    branchId: primary?.branch_id ?? null,
    profile,
    signOut: async () => { await supabase.auth.signOut(); },
    refresh: async () => { await loadContext(user); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}