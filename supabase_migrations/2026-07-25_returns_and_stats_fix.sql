-- Apply this migration once in the Supabase SQL editor.
-- Fixes the return flow so refunds:
--   * restock returned quantities
--   * remove/reduce returned items in the invoice
--   * recompute sale totals (subtotal, total, paid, due)
--   * refund customer (reduces due first, then paid_amount)
--   * delete the invoice entirely when all items are returned
-- Also preserves the sale_returns history record when its sale is deleted.

-- 1. Allow sale_returns to survive deletion of the parent sale.
alter table public.sale_returns
  drop constraint if exists sale_returns_sale_id_fkey;
alter table public.sale_returns
  alter column sale_id drop not null;
alter table public.sale_returns
  add constraint sale_returns_sale_id_fkey
    foreign key (sale_id) references public.sales(id) on delete set null;
alter table public.sale_returns
  add column if not exists invoice_no text;

-- 2. Replace the RPC with a corrected implementation.
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

  for cur in select * from jsonb_array_elements(coalesce(s.items, '[]'::jsonb)) loop
    cur_pid := cur->>'productId';
    cur_qty := coalesce((cur->>'qty')::numeric, 0);
    cur_return := coalesce((ret_qty_map->>cur_pid)::numeric, 0);
    new_qty := cur_qty - cur_return;
    if new_qty > 0 then
      cur := jsonb_set(cur, '{qty}', to_jsonb(new_qty));
      if (cur ? 'discount') and cur_qty > 0 then
        cur := jsonb_set(cur, '{discount}',
          to_jsonb(round((coalesce((cur->>'discount')::numeric,0) * new_qty / cur_qty)::numeric, 2)));
      end if;
      new_items := new_items || cur;
      new_subtotal := new_subtotal
        + (coalesce((cur->>'unitPrice')::numeric, coalesce((cur->>'price')::numeric,0)) * new_qty)
        - coalesce((cur->>'discount')::numeric, 0);
      if cur_return > 0 then
        ret_qty_map := jsonb_set(ret_qty_map, array[cur_pid], to_jsonb(0::numeric));
      end if;
    else
      if cur_return > 0 then
        ret_qty_map := jsonb_set(ret_qty_map, array[cur_pid],
          to_jsonb(greatest(cur_return - cur_qty, 0)));
      end if;
    end if;
  end loop;

  new_total := greatest(coalesce(s.total_amount, 0) - refund, 0);
  due_reduction := least(coalesce(s.due_amount, 0), refund);
  paid_reduction := greatest(refund - due_reduction, 0);
  new_due := greatest(coalesce(s.due_amount, 0) - due_reduction, 0);
  new_paid := greatest(coalesce(s.paid_amount, 0) - paid_reduction, 0);

  insert into public.sale_returns(sale_id, branch_id, items, reason, refund_amount, invoice_no, created_by)
    values (_sale_id, s.branch_id, _items, _reason, refund, s.invoice_no, auth.uid())
    returning * into r;

  if s.customer_id is not null and due_reduction > 0 then
    update public.customers
      set due_amount = greatest(coalesce(due_amount,0) - due_reduction, 0)
      where id = s.customer_id;
  end if;

  if jsonb_array_length(new_items) = 0 then
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
