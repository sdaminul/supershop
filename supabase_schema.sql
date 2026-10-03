-- ============================================================================
-- Multi-Branch Store / Super Shop Management System
-- Run this ENTIRE file in Supabase SQL Editor (once) for the project at
-- https://kzyqcjrzeubjgvmqyjuv.supabase.co
-- ============================================================================

-- ---------- Enums ----------
do $$ begin
  create type public.app_role as enum ('admin','manager','cashier','stock_keeper');
exception when duplicate_object then null; end $$;

-- ---------- Core tables ----------
create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  address text,
  phone text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text unique,
  email text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  branch_id uuid references public.branches(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role, branch_id)
);

-- Security-definer helpers to avoid recursive RLS
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = 'admin')
$$;

create or replace function public.current_branch(_user_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.user_roles where user_id = _user_id and branch_id is not null limit 1
$$;

create or replace function public.in_branch(_user_id uuid, _branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and branch_id = _branch_id)
$$;

-- ---------- Domain tables ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  branch_id uuid references public.branches(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  due_amount numeric not null default 0,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  address text,
  due_amount numeric not null default 0,
  branch_id uuid not null references public.branches(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_code text not null,
  name text not null,
  sku text,
  barcode text,
  category_id uuid references public.categories(id) on delete set null,
  unit text default 'pcs',
  purchase_price numeric not null default 0,
  sell_price numeric not null default 0,
  stock_qty numeric not null default 0,
  low_stock_threshold numeric not null default 0,
  expiry_date date,
  supplier_id uuid references public.suppliers(id) on delete set null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, product_code)
);

-- Auto-generate 6-digit product_code per branch
create or replace function public.set_product_code() returns trigger
language plpgsql as $$
declare next_code int;
begin
  if new.product_code is null or new.product_code = '' then
    select coalesce(max((product_code)::int), 0) + 1 into next_code
      from public.products where branch_id = new.branch_id
      and product_code ~ '^[0-9]+$';
    new.product_code := lpad(next_code::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_set_product_code on public.products;
create trigger trg_set_product_code before insert on public.products
for each row execute function public.set_product_code();

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  items jsonb not null default '[]'::jsonb,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  due_amount numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  invoice_no text not null,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  discount numeric not null default 0,
  tax numeric not null default 0,
  total_amount numeric not null default 0,
  paid_amount numeric not null default 0,
  due_amount numeric not null default 0,
  payment_method text not null default 'cash',
  customer_id uuid references public.customers(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (branch_id, invoice_no)
);

create or replace function public.set_invoice_no() returns trigger
language plpgsql as $$
declare seq int; code text;
begin
  if new.invoice_no is null or new.invoice_no = '' then
    select b.code into code from public.branches b where b.id = new.branch_id;
    select count(*) + 1 into seq from public.sales
      where branch_id = new.branch_id
      and date_trunc('year', created_at) = date_trunc('year', now());
    new.invoice_no := coalesce(code,'BR') || '-' || to_char(now(),'YYYY') || '-' || lpad(seq::text,6,'0');
  end if;
  return new;
end $$;

drop trigger if exists trg_set_invoice_no on public.sales;
create trigger trg_set_invoice_no before insert on public.sales
for each row execute function public.set_invoice_no();

create table if not exists public.sale_returns (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid references public.sales(id) on delete set null,
  branch_id uuid not null references public.branches(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  reason text,
  refund_amount numeric not null default 0,
  invoice_no text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  category text not null,
  amount numeric not null default 0,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  branch_id uuid references public.branches(id) on delete cascade,
  action text not null,
  target_collection text,
  target_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.settings (
  id int primary key default 1,
  company_name text default 'My Company',
  company_address text,
  company_phone text,
  currency text default '৳',
  default_tax_rate numeric default 0,
  invoice_prefix text default 'INV',
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint singleton check (id = 1)
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------- Grants ----------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.branches, public.profiles, public.user_roles, public.categories,
  public.suppliers, public.customers, public.products, public.purchases,
  public.sales, public.sale_returns, public.expenses, public.audit_logs,
  public.settings
  to authenticated;
grant all on
  public.branches, public.profiles, public.user_roles, public.categories,
  public.suppliers, public.customers, public.products, public.purchases,
  public.sales, public.sale_returns, public.expenses, public.audit_logs,
  public.settings
  to service_role;

-- ---------- RLS ----------
alter table public.branches      enable row level security;
alter table public.profiles      enable row level security;
alter table public.user_roles    enable row level security;
alter table public.categories    enable row level security;
alter table public.suppliers     enable row level security;
alter table public.customers     enable row level security;
alter table public.products      enable row level security;
alter table public.purchases     enable row level security;
alter table public.sales         enable row level security;
alter table public.sale_returns  enable row level security;
alter table public.expenses      enable row level security;
alter table public.audit_logs    enable row level security;
alter table public.settings      enable row level security;

-- Helper: policy factory (branch-scoped, admin bypass)
-- Branches: everyone authenticated can read; only admin writes
drop policy if exists p_branch_sel on public.branches;
create policy p_branch_sel on public.branches for select to authenticated using (true);
drop policy if exists p_branch_all on public.branches;
create policy p_branch_all on public.branches for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- Profiles: user can read own profile; admins read all; user updates own; admin updates all
drop policy if exists p_profile_sel on public.profiles;
create policy p_profile_sel on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists p_profile_upd on public.profiles;
create policy p_profile_upd on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists p_profile_ins on public.profiles;
create policy p_profile_ins on public.profiles for insert to authenticated
  with check (id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists p_profile_del on public.profiles;
create policy p_profile_del on public.profiles for delete to authenticated
  using (public.is_admin(auth.uid()));

-- user_roles: admin manages all; user can read own; branch manager reads own-branch roles
drop policy if exists p_role_sel on public.user_roles;
create policy p_role_sel on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid())
         or (branch_id is not null and public.in_branch(auth.uid(), branch_id) and public.has_role(auth.uid(),'manager')));
drop policy if exists p_role_ins on public.user_roles;
create policy p_role_ins on public.user_roles for insert to authenticated
  with check (public.is_admin(auth.uid())
         or (branch_id is not null and public.in_branch(auth.uid(), branch_id) and public.has_role(auth.uid(),'manager') and role in ('cashier','stock_keeper')));
drop policy if exists p_role_upd on public.user_roles;
create policy p_role_upd on public.user_roles for update to authenticated
  using (public.is_admin(auth.uid())
         or (branch_id is not null and public.in_branch(auth.uid(), branch_id) and public.has_role(auth.uid(),'manager')))
  with check (public.is_admin(auth.uid())
         or (branch_id is not null and public.in_branch(auth.uid(), branch_id) and public.has_role(auth.uid(),'manager')));
drop policy if exists p_role_del on public.user_roles;
create policy p_role_del on public.user_roles for delete to authenticated
  using (public.is_admin(auth.uid())
         or (branch_id is not null and public.in_branch(auth.uid(), branch_id) and public.has_role(auth.uid(),'manager')));

-- Generic branch-scoped policy pattern
do $$
declare t text;
begin
  for t in select unnest(array['categories','suppliers','customers','products','purchases','sales','sale_returns','expenses','audit_logs']) loop
    execute format('drop policy if exists p_%1$s_sel on public.%1$s', t);
    execute format('create policy p_%1$s_sel on public.%1$s for select to authenticated using (public.is_admin(auth.uid()) or (branch_id is not null and public.in_branch(auth.uid(), branch_id)) or branch_id is null)', t);
    execute format('drop policy if exists p_%1$s_ins on public.%1$s', t);
    execute format('create policy p_%1$s_ins on public.%1$s for insert to authenticated with check (public.is_admin(auth.uid()) or (branch_id is not null and public.in_branch(auth.uid(), branch_id)))', t);
    execute format('drop policy if exists p_%1$s_upd on public.%1$s', t);
    execute format('create policy p_%1$s_upd on public.%1$s for update to authenticated using (public.is_admin(auth.uid()) or (branch_id is not null and public.in_branch(auth.uid(), branch_id))) with check (public.is_admin(auth.uid()) or (branch_id is not null and public.in_branch(auth.uid(), branch_id)))', t);
    execute format('drop policy if exists p_%1$s_del on public.%1$s', t);
    execute format('create policy p_%1$s_del on public.%1$s for delete to authenticated using (public.is_admin(auth.uid()) or (branch_id is not null and public.in_branch(auth.uid(), branch_id)))', t);
  end loop;
end $$;

-- Settings: read all authenticated, admin writes
drop policy if exists p_settings_sel on public.settings;
create policy p_settings_sel on public.settings for select to authenticated using (true);
drop policy if exists p_settings_all on public.settings;
create policy p_settings_all on public.settings for all to authenticated
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- ---------- RPC: complete_sale (atomic stock decrement + insert) ----------
create or replace function public.complete_sale(
  _branch_id uuid, _items jsonb, _subtotal numeric, _discount numeric,
  _tax numeric, _total numeric, _paid numeric, _payment_method text,
  _customer_id uuid
) returns public.sales language plpgsql security definer set search_path=public as $$
declare
  s public.sales;
  it jsonb;
  pid uuid; q numeric;
  cur_qty numeric;
begin
  if not (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), _branch_id)) then
    raise exception 'forbidden';
  end if;
  -- verify + decrement stock
  for it in select * from jsonb_array_elements(_items) loop
    pid := (it->>'productId')::uuid;
    q := (it->>'qty')::numeric;
    select stock_qty into cur_qty from public.products where id = pid and branch_id = _branch_id for update;
    if cur_qty is null then raise exception 'product not found'; end if;
    if cur_qty < q then raise exception 'insufficient stock for product %', pid; end if;
    update public.products set stock_qty = stock_qty - q, updated_at = now() where id = pid;
  end loop;
  insert into public.sales(branch_id, items, subtotal, discount, tax, total_amount, paid_amount, due_amount, payment_method, customer_id, created_by)
    values (_branch_id, _items, _subtotal, _discount, _tax, _total, _paid, greatest(_total - _paid,0), _payment_method, _customer_id, auth.uid())
    returning * into s;
  if _customer_id is not null and (_total - _paid) > 0 then
    update public.customers set due_amount = due_amount + (_total - _paid) where id = _customer_id;
  end if;
  return s;
end $$;

grant execute on function public.complete_sale(uuid, jsonb, numeric, numeric, numeric, numeric, numeric, text, uuid) to authenticated;

-- ---------- RPC: complete_purchase (stock increment + insert) ----------
create or replace function public.complete_purchase(
  _branch_id uuid, _supplier_id uuid, _items jsonb, _total numeric, _paid numeric
) returns public.purchases language plpgsql security definer set search_path=public as $$
declare p public.purchases; it jsonb; pid uuid; q numeric; cost numeric;
begin
  if not (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), _branch_id)) then
    raise exception 'forbidden';
  end if;
  for it in select * from jsonb_array_elements(_items) loop
    pid := (it->>'productId')::uuid;
    q := (it->>'qty')::numeric;
    cost := (it->>'unitCost')::numeric;
    update public.products set stock_qty = stock_qty + q, purchase_price = cost, updated_at = now() where id = pid and branch_id = _branch_id;
  end loop;
  insert into public.purchases(branch_id, supplier_id, items, total_amount, paid_amount, due_amount, created_by)
    values (_branch_id, _supplier_id, _items, _total, _paid, greatest(_total - _paid,0), auth.uid()) returning * into p;
  if _supplier_id is not null and (_total - _paid) > 0 then
    update public.suppliers set due_amount = due_amount + (_total - _paid) where id = _supplier_id;
  end if;
  return p;
end $$;

grant execute on function public.complete_purchase(uuid, uuid, jsonb, numeric, numeric) to authenticated;

-- ---------- Auto profile on signup ----------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, name, username, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)),
          new.email)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- BOOTSTRAP: create your first admin
-- 1. In Supabase Dashboard → Authentication → Users → Add user
--    (email: admin@example.com, password: your choice, auto-confirm ✓)
-- 2. Run below, replacing the email with the one you just created:
--
-- insert into public.user_roles (user_id, role, branch_id)
-- select id, 'admin', null from auth.users where email = 'admin@example.com';
-- ============================================================================

-- ============================================================================
-- v2 additions: customer due-collections + sale-return RPC
-- Safe to re-run: uses "if not exists" / "or replace".
-- ============================================================================

create table if not exists public.customer_payments (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric not null default 0,
  method text not null default 'cash',
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.customer_payments to authenticated;
grant all on public.customer_payments to service_role;
alter table public.customer_payments enable row level security;

drop policy if exists p_customer_payments_sel on public.customer_payments;
create policy p_customer_payments_sel on public.customer_payments for select to authenticated
  using (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), branch_id));
drop policy if exists p_customer_payments_ins on public.customer_payments;
create policy p_customer_payments_ins on public.customer_payments for insert to authenticated
  with check (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), branch_id));
drop policy if exists p_customer_payments_upd on public.customer_payments;
create policy p_customer_payments_upd on public.customer_payments for update to authenticated
  using (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), branch_id))
  with check (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), branch_id));
drop policy if exists p_customer_payments_del on public.customer_payments;
create policy p_customer_payments_del on public.customer_payments for delete to authenticated
  using (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), branch_id));

-- RPC: record a due collection atomically (insert payment + decrement due)
create or replace function public.collect_customer_due(
  _branch_id uuid, _customer_id uuid, _amount numeric, _method text, _note text
) returns public.customer_payments language plpgsql security definer set search_path=public as $$
declare p public.customer_payments;
begin
  if not (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), _branch_id)) then
    raise exception 'forbidden';
  end if;
  if _amount is null or _amount <= 0 then raise exception 'amount must be > 0'; end if;
  insert into public.customer_payments(branch_id, customer_id, amount, method, note, created_by)
    values (_branch_id, _customer_id, _amount, coalesce(_method,'cash'), _note, auth.uid())
    returning * into p;
  update public.customers set due_amount = greatest(due_amount - _amount, 0) where id = _customer_id;
  return p;
end $$;
grant execute on function public.collect_customer_due(uuid, uuid, numeric, text, text) to authenticated;

-- RPC: process a sale return.
-- Steps:
--  * validate access
--  * restock returned quantities
--  * reduce or remove returned items in the sale's items array
--  * recompute sale totals (subtotal, total_amount, paid_amount, due_amount)
--     - refund reduces customer due first, remainder reduces paid_amount (cash refunded)
--  * reduce customer.due_amount by the amount by which sale.due_amount decreased
--  * insert sale_returns row (with invoice_no captured for history)
--  * if no items remain in the sale, delete the sale (sale_returns.sale_id becomes null via FK)
create or replace function public.process_sale_return(
  _sale_id uuid, _items jsonb, _reason text, _refund_amount numeric
) returns public.sale_returns language plpgsql security definer set search_path=public as $$
declare
  r public.sale_returns;
  s public.sales;
  it jsonb;
  pid uuid;
  q numeric;
  ret_qty_map jsonb := '{}'::jsonb;
  new_items jsonb := '[]'::jsonb;
  cur jsonb;
  cur_pid text;
  cur_qty numeric;
  cur_return numeric;
  new_qty numeric;
  new_subtotal numeric := 0;
  refund numeric := coalesce(_refund_amount, 0);
  due_reduction numeric;
  paid_reduction numeric;
  new_total numeric;
  new_paid numeric;
  new_due numeric;
begin
  select * into s from public.sales where id = _sale_id for update;
  if s.id is null then raise exception 'sale not found'; end if;
  if not (public.is_admin(auth.uid()) or public.in_branch(auth.uid(), s.branch_id)) then
    raise exception 'forbidden';
  end if;

  -- Restock and build a lookup of returned quantity by productId
  for it in select * from jsonb_array_elements(_items) loop
    pid := nullif(it->>'productId','')::uuid;
    q := coalesce((it->>'qty')::numeric, 0);
    if pid is not null and q > 0 then
      update public.products set stock_qty = stock_qty + q, updated_at = now()
        where id = pid and branch_id = s.branch_id;
      ret_qty_map := jsonb_set(
        ret_qty_map,
        array[pid::text],
        to_jsonb(coalesce((ret_qty_map->>pid::text)::numeric, 0) + q)
      );
    end if;
  end loop;

  -- Rebuild sale items: subtract returned qty; drop entries whose remaining qty <= 0
  for cur in select * from jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) loop
    cur_pid := cur->>'productId';
    cur_qty := coalesce((cur->>'qty')::numeric, 0);
    cur_return := coalesce((ret_qty_map->>cur_pid)::numeric, 0);
    new_qty := cur_qty - cur_return;
    if new_qty > 0 then
      -- keep the item with reduced qty; scale discount proportionally
      cur := jsonb_set(cur, '{qty}', to_jsonb(new_qty));
      if (cur ? 'discount') and cur_qty > 0 then
        cur := jsonb_set(cur, '{discount}',
          to_jsonb(round((coalesce((cur->>'discount')::numeric,0) * new_qty / cur_qty)::numeric, 2)));
      end if;
      new_items := new_items || cur;
      new_subtotal := new_subtotal
        + (coalesce((cur->>'unitPrice')::numeric, coalesce((cur->>'price')::numeric,0)) * new_qty)
        - coalesce((cur->>'discount')::numeric, 0);
      -- reduce the returned amount that has been "consumed" from the map
      if cur_return > 0 then
        ret_qty_map := jsonb_set(ret_qty_map, array[cur_pid], to_jsonb(0::numeric));
      end if;
    else
      -- fully returned: consume the mapped return count for this productId
      if cur_return > 0 then
        ret_qty_map := jsonb_set(ret_qty_map, array[cur_pid],
          to_jsonb(greatest(cur_return - cur_qty, 0)));
      end if;
    end if;
  end loop;

  -- Compute new sale totals. Refund reduces due first, then paid (cash back to customer).
  new_total := greatest(coalesce(s.total_amount, 0) - refund, 0);
  due_reduction := least(coalesce(s.due_amount, 0), refund);
  paid_reduction := greatest(refund - due_reduction, 0);
  new_due := greatest(coalesce(s.due_amount, 0) - due_reduction, 0);
  new_paid := greatest(coalesce(s.paid_amount, 0) - paid_reduction, 0);

  -- Insert the return record first (invoice_no captured for history)
  insert into public.sale_returns(sale_id, branch_id, items, reason, refund_amount, invoice_no, created_by)
    values (_sale_id, s.branch_id, _items, _reason, refund, s.invoice_no, auth.uid())
    returning * into r;

  -- Reduce customer's outstanding due by the amount the sale's due dropped
  if s.customer_id is not null and due_reduction > 0 then
    update public.customers
      set due_amount = greatest(coalesce(due_amount,0) - due_reduction, 0)
      where id = s.customer_id;
  end if;

  if jsonb_array_length(new_items) = 0 then
    -- All items returned: delete the invoice; sale_returns.sale_id becomes null via FK
    delete from public.sales where id = _sale_id;
  else
    update public.sales
      set items = new_items,
          subtotal = new_subtotal,
          total_amount = new_total,
          paid_amount = new_paid,
          due_amount = new_due
      where id = _sale_id;
  end if;

  return r;
end $$;
grant execute on function public.process_sale_return(uuid, jsonb, text, numeric) to authenticated;