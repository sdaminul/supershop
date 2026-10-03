// Local PostgreSQL API for NikoBazar SuperShop (replaces Supabase cloud).
// Run: node local-api/server.mjs  (defaults: API :4000, DB supershop on 127.0.0.1)
// Env: DATABASE_URL, API_PORT, API_HOST
import http from "node:http";
import { URL } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

const API_PORT = Number(process.env.API_PORT || 4000);
const API_HOST = process.env.API_HOST || "127.0.0.1";
const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgres://postgres:postgres@127.0.0.1:5432/supershop";

const pool = new Pool({ connectionString: DATABASE_URL });

const ALLOWED_TABLES = new Set([
  "branches",
  "profiles",
  "user_roles",
  "categories",
  "suppliers",
  "customers",
  "products",
  "purchases",
  "sales",
  "sale_returns",
  "expenses",
  "audit_logs",
  "settings",
  "customer_payments",
]);

const ALLOWED_RPC = new Set([
  "complete_sale",
  "complete_purchase",
  "collect_customer_due",
  "process_sale_return",
]);

function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = "";
    req.on("data", (c) => (chunks += c));
    req.on("end", () => {
      if (!chunks) return resolve({});
      try {
        resolve(JSON.parse(chunks));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function ident(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) throw new Error(`bad identifier: ${name}`);
  return `"${name}"`;
}

function buildWhere(filters, orExpr, startIdx = 1) {
  const clauses = [];
  const values = [];
  let i = startIdx;
  for (const f of filters || []) {
    const col = ident(f.col);
    if (f.op === "eq") {
      if (f.val === null) clauses.push(`${col} IS NULL`);
      else {
        clauses.push(`${col} = $${i++}`);
        values.push(f.val);
      }
    } else if (f.op === "gte") {
      clauses.push(`${col} >= $${i++}`);
      values.push(f.val);
    } else if (f.op === "lte") {
      clauses.push(`${col} <= $${i++}`);
      values.push(f.val);
    } else if (f.op === "gt") {
      clauses.push(`${col} > $${i++}`);
      values.push(f.val);
    } else if (f.op === "lt") {
      clauses.push(`${col} < $${i++}`);
      values.push(f.val);
    } else if (f.op === "in") {
      const arr = Array.isArray(f.val) ? f.val : [];
      if (!arr.length) {
        clauses.push("false");
      } else {
        const placeholders = arr.map(() => `$${i++}`);
        values.push(...arr);
        clauses.push(`${col} IN (${placeholders.join(",")})`);
      }
    } else {
      throw new Error(`unsupported filter op: ${f.op}`);
    }
  }
  // Only `or` pattern used by the app:
  //   branch_id.eq.<uuid>,branch_id.is.null
  if (orExpr) {
    const m = orExpr.match(/branch_id\.eq\.([^,]+),branch_id\.is\.null/);
    if (m) {
      clauses.push(`(${ident("branch_id")} = $${i++} OR ${ident("branch_id")} IS NULL)`);
      values.push(m[1]);
    }
  }
  return { clause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values, nextIdx: i };
}

function stripEmbeds(columns) {
  if (!columns || columns === "*") return "*";
  // Remove relation embeds like customers(name,phone), sales(invoice_no,...)
  // Keep base columns; embeds are resolved in JS afterwards.
  return columns
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.includes("(") && !s.includes(")"))
    .join(", ") || "*";
}

async function enrichRows(client, table, rows, columns) {
  if (!rows.length || !columns || columns === "*") return rows;
  const wantsCustomers = columns.includes("customers(");
  const wantsSales = columns.includes("sales(");
  if (!wantsCustomers && !wantsSales) return rows;

  if (wantsCustomers) {
    const custIds = [
      ...new Set(
        rows
          .map((r) => r.customer_id)
          .filter((v) => v !== null && v !== undefined)
      ),
    ];
    // sale_returns -> sales -> customers nesting
    const nested = columns.includes("sales(") && columns.includes("customers(");
    if (custIds.length && (table === "sales" || table === "customer_payments")) {
      const { rows: custs } = await client.query(
        `SELECT id, name, phone FROM customers WHERE id = ANY($1)`,
        [custIds]
      );
      const map = new Map(custs.map((c) => [c.id, c]));
      for (const r of rows) {
        const c = map.get(r.customer_id);
        r.customers = c ? { name: c.name, phone: c.phone } : null;
      }
    }
    if (nested && table === "sale_returns") {
      // handled via sales enrichment below (sales.customers)
    }
  }

  if (wantsSales && (table === "sale_returns")) {
    const saleIds = [...new Set(rows.map((r) => r.sale_id).filter(Boolean))];
    if (saleIds.length) {
      const { rows: sales } = await client.query(
        `SELECT id, invoice_no, customer_id FROM sales WHERE id = ANY($1)`,
        [saleIds]
      );
      const salesMap = new Map(sales.map((s) => [s.id, s]));
      // nested customers of sales?
      let custMap = new Map();
      if (columns.includes("customers(")) {
        const cids = [...new Set(sales.map((s) => s.customer_id).filter(Boolean))];
        if (cids.length) {
          const { rows: custs } = await client.query(
            `SELECT id, name, phone FROM customers WHERE id = ANY($1)`,
            [cids]
          );
          custMap = new Map(custs.map((c) => [c.id, c]));
        }
      }
      for (const r of rows) {
        const s = salesMap.get(r.sale_id);
        if (!s) {
          r.sales = null;
          continue;
        }
        const nested = { invoice_no: s.invoice_no, customer_id: s.customer_id };
        const cc = custMap.get(s.customer_id);
        if (cc) nested.customers = { name: cc.name };
        r.sales = nested;
      }
    } else {
      for (const r of rows) r.sales = null;
    }
  }

  if (wantsCustomers && table === "customer_payments" && columns.includes("customers(")) {
    // already attached above
  }

  return rows;
}

async function handleQuery(body) {
  const { op, table, columns, filters, orExpr, order, limit, data, single } = body;
  if (!ALLOWED_TABLES.has(table)) throw new Error(`table not allowed: ${table}`);
  const client = await pool.connect();
  try {
    if (op === "select") {
      const cols = stripEmbeds(columns);
      const { clause, values, nextIdx } = buildWhere(filters, orExpr);
      let sql = `SELECT ${cols === "*" ? "*" : cols} FROM ${ident(table)} ${clause}`;
      const params = [...values];
      if (order) {
        sql += ` ORDER BY ${ident(order.col)} ${order.asc === false ? "DESC" : "ASC"}`;
      }
      if (limit) {
        sql += ` LIMIT $${nextIdx}`;
        params.push(limit);
      }
      const { rows } = await client.query(sql, params);
      const enriched = await enrichRows(client, table, rows, columns);
      if (single === "maybeSingle" || single === "single") {
        if (!enriched.length) {
          if (single === "single") throw new Error("No rows returned (single)");
          return { data: null, error: null };
        }
        return { data: enriched[0], error: null };
      }
      return { data: enriched, error: null };
    }

    if (op === "insert") {
      const arr = Array.isArray(data) ? data : [data];
      if (!arr.length) return { data: [], error: null };
      const keys = [...new Set(arr.flatMap((o) => Object.keys(o)))];
      if (!keys.length) throw new Error("insert: empty payload");
      const colsSql = keys.map(ident).join(", ");
      const rowsSql = [];
      const params = [];
      let i = 1;
      for (const obj of arr) {
        const ph = keys.map(() => `$${i++}`);
        rowsSql.push(`(${ph.join(",")})`);
        for (const k of keys) {
          let v = obj[k];
          if (v !== null && typeof v === "object") v = JSON.stringify(v);
          if (v === undefined) v = null;
          params.push(v);
        }
      }
      const cols = stripEmbeds(columns);
      const returning = cols === "*" ? "*" : cols;
      const sql = `INSERT INTO ${ident(table)} (${colsSql}) VALUES ${rowsSql.join(",")} RETURNING ${returning === "*" ? "*" : returning}`;
      const { rows } = await client.query(sql, params);
      if (single === "single" || single === "maybeSingle") {
        return { data: rows[0] ?? null, error: null };
      }
      return { data: rows, error: null };
    }

    if (op === "update") {
      const keys = Object.keys(data || {});
      if (!keys.length) throw new Error("update: empty payload");
      const params = [];
      let i = 1;
      const sets = keys.map((k) => {
        let v = data[k];
        if (v !== null && typeof v === "object") v = JSON.stringify(v);
        if (v === undefined) v = null;
        params.push(v);
        return `${ident(k)} = $${i++}`;
      });
      const { clause, values, nextIdx } = buildWhere(filters, orExpr, i);
      void nextIdx;
      const sql = `UPDATE ${ident(table)} SET ${sets.join(", ")} ${clause} RETURNING *`;
      const { rows } = await client.query(sql, [...params, ...values]);
      return { data: rows, error: null };
    }

    if (op === "delete") {
      const { clause, values } = buildWhere(filters, orExpr);
      const sql = `DELETE FROM ${ident(table)} ${clause} RETURNING *`;
      const { rows } = await client.query(sql, values);
      return { data: rows, error: null };
    }

    throw new Error(`unknown op: ${op}`);
  } finally {
    client.release();
  }
}

async function handleRpc(body) {
  const { fn, params, userId } = body;
  if (!ALLOWED_RPC.has(fn)) throw new Error(`rpc not allowed: ${fn}`);
  const client = await pool.connect();
  try {
    const p = params || {};
    const j = (v) => (v === null || v === undefined ? null : JSON.stringify(v));
    let sql, values;
    if (fn === "complete_sale") {
      sql = `SELECT to_jsonb(public.complete_sale($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)) AS data`;
      values = [
        p._branch_id,
        j(p._items),
        p._subtotal ?? 0,
        p._discount ?? 0,
        p._tax ?? 0,
        p._total ?? 0,
        p._paid ?? 0,
        p._payment_method ?? "cash",
        p._customer_id ?? null,
        userId ?? null,
      ];
    } else if (fn === "complete_purchase") {
      sql = `SELECT to_jsonb(public.complete_purchase($1,$2,$3,$4,$5,$6)) AS data`;
      values = [
        p._branch_id,
        p._supplier_id ?? null,
        j(p._items),
        p._total ?? 0,
        p._paid ?? 0,
        userId ?? null,
      ];
    } else if (fn === "collect_customer_due") {
      sql = `SELECT to_jsonb(public.collect_customer_due($1,$2,$3,$4,$5,$6)) AS data`;
      values = [
        p._branch_id,
        p._customer_id,
        p._amount ?? 0,
        p._method ?? "cash",
        p._note ?? null,
        userId ?? null,
      ];
    } else if (fn === "process_sale_return") {
      sql = `SELECT to_jsonb(public.process_sale_return($1,$2,$3,$4,$5)) AS data`;
      values = [
        p._sale_id,
        j(p._items),
        p._reason ?? null,
        p._refund_amount ?? 0,
        userId ?? null,
      ];
    }
    const { rows } = await client.query(sql, values);
    return { data: rows[0]?.data ?? null, error: null };
  } finally {
    client.release();
  }
}

async function handleSignup(body) {
  const { email, password, name, username } = body;
  if (!email || !password) throw new Error("email and password required");
  const client = await pool.connect();
  try {
    const existing = await client.query(`SELECT id FROM app_users WHERE email = $1`, [email]);
    if (existing.rows.length) throw new Error("User already exists");
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await client.query(
      `INSERT INTO app_users (email, password_hash) VALUES ($1,$2) RETURNING id, email`,
      [email, hash]
    );
    const user = rows[0];
    const nm = name || email.split("@")[0];
    const un = username || email.split("@")[0];
    await client.query(
      `INSERT INTO profiles (id, name, username, email) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, username=EXCLUDED.username, email=EXCLUDED.email`,
      [user.id, nm, un, email]
    );
    return { user, error: null };
  } finally {
    client.release();
  }
}

async function handleSignin(body) {
  const { email, password } = body;
  if (!email || !password) throw new Error("email and password required");
  const client = await pool.connect();
  try {
    const { rows } = await client.query(`SELECT id, email, password_hash FROM app_users WHERE email = $1`, [email]);
    const row = rows[0];
    if (!row) throw new Error("Invalid email or password");
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) throw new Error("Invalid email or password");
    const user = { id: row.id, email: row.email };
    const { rows: profRows } = await client.query(
      `SELECT id, name, username, email FROM profiles WHERE id = $1`,
      [row.id]
    );
    const { rows: roleRows } = await client.query(
      `SELECT role, branch_id FROM user_roles WHERE user_id = $1`,
      [row.id]
    );
    return { user, profile: profRows[0] ?? null, roles: roleRows, error: null };
  } finally {
    client.release();
  }
}

async function handleContext(body) {
  const { userId } = body;
  if (!userId) return { profile: null, roles: [] };
  const client = await pool.connect();
  try {
    const { rows: profRows } = await client.query(
      `SELECT id, name, username, email FROM profiles WHERE id = $1`,
      [userId]
    );
    const { rows: roleRows } = await client.query(
      `SELECT role, branch_id FROM user_roles WHERE user_id = $1`,
      [userId]
    );
    return { profile: profRows[0] ?? null, roles: roleRows };
  } finally {
    client.release();
  }
}

async function handleUpdatePassword(body) {
  const { userId, password } = body;
  if (!userId || !password) throw new Error("userId and password required");
  const hash = await bcrypt.hash(password, 10);
  const client = await pool.connect();
  try {
    await client.query(`UPDATE app_users SET password_hash = $1 WHERE id = $2`, [hash, userId]);
    return { ok: true, error: null };
  } finally {
    client.release();
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  if (req.method === "OPTIONS") {
    return send(res, 204, {});
  }
  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      await pool.query("SELECT 1");
      return send(res, 200, { ok: true, db: "supershop" });
    }
    if (req.method !== "POST") return send(res, 404, { error: "not found" });
    const body = await readBody(req);

    if (url.pathname === "/api/query") {
      const out = await handleQuery(body);
      return send(res, 200, out);
    }
    if (url.pathname === "/api/rpc") {
      const out = await handleRpc(body);
      return send(res, 200, out);
    }
    if (url.pathname === "/api/auth/signup") {
      const out = await handleSignup(body);
      return send(res, 200, out);
    }
    if (url.pathname === "/api/auth/signin") {
      const out = await handleSignin(body);
      return send(res, 200, out);
    }
    if (url.pathname === "/api/auth/context") {
      const out = await handleContext(body);
      return send(res, 200, out);
    }
    if (url.pathname === "/api/auth/update-password") {
      const out = await handleUpdatePassword(body);
      return send(res, 200, out);
    }
    return send(res, 404, { error: "not found" });
  } catch (e) {
    console.error(url.pathname, e.message);
    // Match supabase-js shape: callers check `error.message`
    return send(res, 200, { data: null, error: { message: e.message } });
  }
});

server.listen(API_PORT, API_HOST, () => {
  console.log(`[local-api] listening on http://${API_HOST}:${API_PORT} -> ${DATABASE_URL.replace(/:[^:@/]+@/, ":****@")}`);
});
