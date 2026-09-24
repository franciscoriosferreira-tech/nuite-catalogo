begin;

alter table public.store_orders
  add column if not exists fulfillment_status text not null default 'new',
  add column if not exists fulfilled_at timestamptz,
  add column if not exists stock_restored_at timestamptz;

alter table public.store_orders
  drop constraint if exists store_orders_fulfillment_status_check,
  add constraint store_orders_fulfillment_status_check
    check (fulfillment_status in ('new', 'preparing', 'ready_pickup', 'shipped', 'delivered', 'cancelled'));

create index if not exists store_orders_fulfillment_created_idx
  on public.store_orders(fulfillment_status, created_at desc);

create or replace function public.admin_update_store_order(
  p_order_id uuid,
  p_fulfillment_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.store_orders%rowtype;
begin
  if p_fulfillment_status not in ('new', 'preparing', 'ready_pickup', 'shipped', 'delivered', 'cancelled') then
    raise exception 'Invalid fulfillment status';
  end if;

  perform pg_advisory_xact_lock(hashtext('nuite-store-inventory'));
  select * into order_record from public.store_orders where id = p_order_id for update;

  if order_record.id is null then raise exception 'Order not found'; end if;
  if order_record.status <> 'paid' then raise exception 'Only paid orders can change fulfillment status'; end if;
  if order_record.fulfillment_status = 'cancelled' then
    if p_fulfillment_status = 'cancelled' then return; end if;
    raise exception 'A cancelled order cannot be reopened';
  end if;

  if p_fulfillment_status = 'cancelled' and order_record.stock_restored_at is null then
    update public.perfumes perfume
    set stock = perfume.stock + item.quantity
    from public.store_order_items item
    where item.order_id = p_order_id and perfume.id = item.product_id;

    update public.store_orders
    set fulfillment_status = 'cancelled', stock_restored_at = now(), updated_at = now()
    where id = p_order_id;
    return;
  end if;

  update public.store_orders
  set fulfillment_status = p_fulfillment_status,
      fulfilled_at = case when p_fulfillment_status = 'delivered' then coalesce(fulfilled_at, now()) else fulfilled_at end,
      updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.admin_update_store_order(uuid, text) from public;
grant execute on function public.admin_update_store_order(uuid, text) to service_role;

commit;
