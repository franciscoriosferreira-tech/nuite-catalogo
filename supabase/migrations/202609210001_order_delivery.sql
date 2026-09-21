begin;

alter table public.store_orders
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists delivery_method text not null default 'pickup',
  add column if not exists shipping_payment_mode text not null default 'none',
  add column if not exists shipping_carrier text,
  add column if not exists shipping_region text,
  add column if not exists shipping_commune text,
  add column if not exists shipping_address text,
  add column if not exists shipping_address_number text,
  add column if not exists shipping_address_extra text,
  add column if not exists shipping_notes text,
  add column if not exists products_total_clp bigint,
  add column if not exists shipping_amount_clp bigint not null default 0;

update public.store_orders
set products_total_clp = total_clp
where products_total_clp is null;

alter table public.store_orders
  alter column products_total_clp set not null;

alter table public.store_orders
  drop constraint if exists store_orders_delivery_method_check,
  add constraint store_orders_delivery_method_check
    check (delivery_method in ('pickup', 'shipping')),
  drop constraint if exists store_orders_shipping_payment_mode_check,
  add constraint store_orders_shipping_payment_mode_check
    check (shipping_payment_mode in ('none', 'collect', 'prepaid')),
  drop constraint if exists store_orders_shipping_carrier_check,
  add constraint store_orders_shipping_carrier_check
    check (shipping_carrier is null or shipping_carrier in ('starken', 'chilexpress', 'bluex')),
  drop constraint if exists store_orders_shipping_amount_check,
  add constraint store_orders_shipping_amount_check
    check (shipping_amount_clp >= 0 and total_clp = products_total_clp + shipping_amount_clp);

create or replace function public.create_store_order(
  p_commerce_order text,
  p_customer_email text,
  p_items jsonb,
  p_delivery jsonb
)
returns table(created_order_id uuid, created_total_clp bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_order_id uuid;
  new_total bigint;
  requested_method text := p_delivery->>'method';
  requested_carrier text := nullif(p_delivery->>'carrier', '');
begin
  if length(trim(coalesce(p_delivery->>'customerName', ''))) < 3 then
    raise exception 'Invalid customer name';
  end if;

  if length(trim(coalesce(p_delivery->>'phone', ''))) < 9 then
    raise exception 'Invalid customer phone';
  end if;

  if requested_method is null or requested_method not in ('pickup', 'shipping_collect') then
    raise exception 'Invalid delivery method';
  end if;

  if requested_method = 'shipping_collect' then
    if requested_carrier is null or requested_carrier not in ('starken', 'chilexpress', 'bluex') then
      raise exception 'Invalid shipping carrier';
    end if;
    if length(trim(coalesce(p_delivery->>'region', ''))) < 3
      or length(trim(coalesce(p_delivery->>'commune', ''))) < 2
      or length(trim(coalesce(p_delivery->>'address', ''))) < 3
      or length(trim(coalesce(p_delivery->>'addressNumber', ''))) < 1 then
      raise exception 'Incomplete shipping address';
    end if;
  end if;

  select created.created_order_id, created.created_total_clp
  into new_order_id, new_total
  from public.create_store_order(p_commerce_order, p_customer_email, p_items) created;

  update public.store_orders
  set customer_name = trim(p_delivery->>'customerName'),
      customer_phone = trim(p_delivery->>'phone'),
      delivery_method = case when requested_method = 'pickup' then 'pickup' else 'shipping' end,
      shipping_payment_mode = case when requested_method = 'pickup' then 'none' else 'collect' end,
      shipping_carrier = case when requested_method = 'pickup' then null else requested_carrier end,
      shipping_region = case when requested_method = 'pickup' then null else trim(p_delivery->>'region') end,
      shipping_commune = case when requested_method = 'pickup' then null else trim(p_delivery->>'commune') end,
      shipping_address = case when requested_method = 'pickup' then null else trim(p_delivery->>'address') end,
      shipping_address_number = case when requested_method = 'pickup' then null else trim(p_delivery->>'addressNumber') end,
      shipping_address_extra = case when requested_method = 'pickup' then null else nullif(trim(p_delivery->>'addressExtra'), '') end,
      shipping_notes = nullif(trim(p_delivery->>'notes'), ''),
      products_total_clp = new_total,
      shipping_amount_clp = 0,
      updated_at = now()
  where id = new_order_id;

  return query select new_order_id, new_total;
end;
$$;

revoke all on function public.create_store_order(text, text, jsonb, jsonb) from public;
grant execute on function public.create_store_order(text, text, jsonb) to service_role;
grant execute on function public.create_store_order(text, text, jsonb, jsonb) to service_role;
grant execute on function public.confirm_store_order(uuid, integer, jsonb) to service_role;
grant execute on function public.release_store_order(uuid, integer, jsonb) to service_role;

commit;
