// Local PostgreSQL client — drop-in replacement for @supabase/supabase-js.
// Talks to local-api/server.mjs (plain PostgreSQL, no Supabase cloud).
// Keeps the same `supabase.from(...).select/insert/update/delete`, `rpc`,
// and `auth.*` surface so existing routes work unchanged.

const API_BASE =
  (import.meta as any).env?.VITE_LOCAL_API_URL || "http://127.0.0.1:4000";

const SESSION_KEY = "nb_local_session";

export type Role = "admin" | "manager" | "cashier" | "stock_keeper";

interface SessionUser {
  id: string;
  email: string;
}
interface StoredSession {
  user: SessionUser;
}

function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setStoredSession(s: StoredSession | null) {
  try {
    if (!s) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

type Listener = (event: string, session: any) => void;
const listeners = new Set<Listener>();

function currentUser(): SessionUser | null {
  return getStoredSession()?.user ?? null;
}

function notify(event: string) {
  const s = getStoredSession();
  const session = s ? { user: s.user } : null;
  listeners.forEach((cb) => {
    try {
      cb(event, session);
    } catch {
      /* noop */
    }
  });
}

async function post(path: string, body: any): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return json;
}

// ---------------- Query builders ----------------

interface Filter {
  col: string;
  op: string;
  val: any;
}

function toError(e: any) {
  if (!e) return null;
  if (typeof e === "string") return { message: e };
  if (e.message) return e;
  return { message: String(e) };
}

class SelectBuilder implements PromiseLike<any> {
  private table: string;
  private columns: string;
  private filters: Filter[] = [];
  private orExpr: string | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private singleMode: "single" | "maybeSingle" | null = null;

  constructor(table: string, columns?: string) {
    this.table = table;
    this.columns = columns || "*";
  }
  eq(col: string, val: any) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push({ col, op: "gte", val });
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push({ col, op: "lte", val });
    return this;
  }
  gt(col: string, val: any) {
    this.filters.push({ col, op: "gt", val });
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push({ col, op: "lt", val });
    return this;
  }
  in(col: string, val: any[]) {
    this.filters.push({ col, op: "in", val });
    return this;
  }
  or(expr: string) {
    this.orExpr = expr;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }
  async exec() {
    try {
      const out = await post("/api/query", {
        op: "select",
        table: this.table,
        columns: this.columns,
        filters: this.filters,
        orExpr: this.orExpr,
        order: this.orderBy,
        limit: this.limitN,
        single: this.singleMode,
      });
      return { data: out.data ?? null, error: toError(out.error) };
    } catch (e: any) {
      return { data: null, error: toError(e?.message || e) };
    }
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

class InsertBuilder implements PromiseLike<any> {
  private table: string;
  private payload: any;
  private columns: string = "*";
  private singleMode: "single" | "maybeSingle" | null = null;
  constructor(table: string, payload: any) {
    this.table = table;
    this.payload = payload;
  }
  select(cols?: string) {
    if (cols) this.columns = cols;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybeSingle";
    return this;
  }
  async exec() {
    try {
      const out = await post("/api/query", {
        op: "insert",
        table: this.table,
        columns: this.columns,
        data: this.payload,
        single: this.singleMode,
      });
      return { data: out.data ?? null, error: toError(out.error) };
    } catch (e: any) {
      return { data: null, error: toError(e?.message || e) };
    }
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

class UpdateBuilder implements PromiseLike<any> {
  private table: string;
  private payload: any;
  private filters: Filter[] = [];
  constructor(table: string, payload: any) {
    this.table = table;
    this.payload = payload;
  }
  eq(col: string, val: any) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  async exec() {
    try {
      const out = await post("/api/query", {
        op: "update",
        table: this.table,
        data: this.payload,
        filters: this.filters,
      });
      return { data: out.data ?? null, error: toError(out.error) };
    } catch (e: any) {
      return { data: null, error: toError(e?.message || e) };
    }
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

class DeleteBuilder implements PromiseLike<any> {
  private table: string;
  private filters: Filter[] = [];
  constructor(table: string) {
    this.table = table;
  }
  eq(col: string, val: any) {
    this.filters.push({ col, op: "eq", val });
    return this;
  }
  async exec() {
    try {
      const out = await post("/api/query", {
        op: "delete",
        table: this.table,
        filters: this.filters,
      });
      return { data: out.data ?? null, error: toError(out.error) };
    } catch (e: any) {
      return { data: null, error: toError(e?.message || e) };
    }
  }
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.exec().then(onfulfilled, onrejected);
  }
}

function makeAuth(persist: boolean) {
  return {
    async signUp({ email, password, options }: any) {
      try {
        const out = await post("/api/auth/signup", {
          email,
          password,
          name: options?.data?.name,
          username: options?.data?.username,
        });
        if (out.error) return { data: { user: null }, error: toError(out.error) };
        // Secondary client never persists (matches old supabaseSignup).
        // Main client also does NOT auto-login on signup; admins create users
        // for others. Keep behavior identical: no session change.
        void persist;
        return { data: { user: out.user }, error: null };
      } catch (e: any) {
        return { data: { user: null }, error: toError(e?.message || e) };
      }
    },
    async signInWithPassword({ email, password }: any) {
      try {
        const out = await post("/api/auth/signin", { email, password });
        if (out.error) return { data: {}, error: toError(out.error) };
        setStoredSession({ user: out.user });
        notify("SIGNED_IN");
        return {
          data: { user: out.user, session: { user: out.user } },
          error: null,
        };
      } catch (e: any) {
        return { data: {}, error: toError(e?.message || e) };
      }
    },
    async getSession() {
      const s = getStoredSession();
      return { data: { session: s ? { user: s.user } : null } };
    },
    onAuthStateChange(cb: Listener) {
      listeners.add(cb);
      return {
        data: {
          subscription: {
            unsubscribe() {
              listeners.delete(cb);
            },
          },
        },
      };
    },
    async signOut() {
      setStoredSession(null);
      notify("SIGNED_OUT");
      return { error: null };
    },
    async updateUser({ password }: any) {
      const u = currentUser();
      if (!u) return { data: null, error: { message: "Not signed in" } };
      try {
        const out = await post("/api/auth/update-password", {
          userId: u.id,
          password,
        });
        if (out.error) return { data: null, error: toError(out.error) };
        return { data: { user: u }, error: null };
      } catch (e: any) {
        return { data: null, error: toError(e?.message || e) };
      }
    },
  };
}

function makeClient(persist: boolean) {
  return {
    from(table: string) {
      return {
        select: (cols?: string) => new SelectBuilder(table, cols),
        insert: (payload: any) => new InsertBuilder(table, payload),
        update: (payload: any) => new UpdateBuilder(table, payload),
        delete: () => new DeleteBuilder(table),
      };
    },
    async rpc(fn: string, params: any) {
      try {
        const u = currentUser();
        const out = await post("/api/rpc", {
          fn,
          params: params || {},
          userId: u?.id ?? null,
        });
        return { data: out.data ?? null, error: toError(out.error) };
      } catch (e: any) {
        return { data: null, error: toError(e?.message || e) };
      }
    },
    auth: makeAuth(persist),
  };
}

export const supabase = makeClient(true);

// Secondary client used for signing up NEW users without disturbing the
// current admin/manager session (does not persist a session).
export const supabaseSignup = makeClient(false);
