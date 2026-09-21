begin;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  commerce_order text not null unique,
  customer_email text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'review', 'cancelled', 'refunded')),
  currency text not null default 'CLP' check (currency = 'CLP'),
  total_clp bigint not null check (total_clp > 0),
  flow_order bigint unique,
  flow_token text,
  flow_status integer,
  provider_payload jsonb,
  reservation_expires_at timestamptz not null default (now() + interval '30 minutes'),
  reservation_released boolean not null default false,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.store_orders(id) on delete cascade,
  product_id uuid not null references public.perfumes(id),
  product_name text not null,
  product_brand text,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_clp bigint not null check (unit_price_clp > 0),
  subtotal_clp bigint not null check (subtotal_clp = unit_price_clp * quantity),
  unique (order_id, product_id)
);

create table if not exists public.store_payment_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.store_orders(id),
  provider text not null,
  provider_status integer not null,
  provider_token text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists store_orders_email_created_idx on public.store_orders(customer_email, created_at desc);
create index if not exists store_payment_events_order_idx on public.store_payment_events(order_id, received_at desc);

alter table public.perfumes
  add column if not exists reserved_stock integer not null default 0 check (reserved_stock >= 0);

alter table public.store_orders enable row level security;
alter table public.store_order_items enable row level security;
alter table public.store_payment_events enable row level security;

create or replace function public.create_store_order(
  p_commerce_order text,
  p_customer_email text,
  p_items jsonb
)
returns table(created_order_id uuid, created_total_clp bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  item_data jsonb;
  product_record record;
  product_id uuid;
  item_quantity integer;
  item_price bigint;
  calculated_total bigint := 0;
  new_order_id uuid;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 20 then
    raise exception 'Invalid cart';
  end if;

  -- Serializa reservas y liberaciones para que dos checkouts no puedan vender el mismo stock.
  perform pg_advisory_xact_lock(hashtext('nuite-store-inventory'));

  update public.perfumes perfume
  set reserved_stock = greatest(0, perfume.reserved_stock - expired.quantity)
  from (
    select item.product_id, sum(item.quantity)::integer as quantity
    from public.store_order_items item
    join public.store_orders orders on orders.id = item.order_id
    where orders.status = 'pending'
      and not orders.reservation_released
      and orders.reservation_expires_at < now()
    group by item.product_id
  ) expired
  where perfume.id = expired.product_id;

  update public.store_orders
  set status = 'cancelled', reservation_released = true, updated_at = now()
  where status = 'pending' and not reservation_released and reservation_expires_at < now();

  for item_data in select value from jsonb_array_elements(p_items)
  loop
    product_id := (item_data->>'id')::uuid;
    item_quantity := (item_data->>'quantity')::integer;
    if item_quantity < 1 or item_quantity > 10 then raise exception 'Invalid quantity'; end if;

    select id, nombre, marca, coalesce(precio, precio_sugerido, 0)::bigint as price_clp,
           stock, reserved_stock, activo
    into product_record
    from public.perfumes
    where id = product_id
    for update;

    if not found then raise exception 'Product unavailable'; end if;
    if not product_record.activo or product_record.price_clp <= 0 then raise exception 'Product unavailable'; end if;
    if product_record.stock - product_record.reserved_stock < item_quantity then
      raise exception 'Insufficient stock for %', product_record.nombre;
    end if;
    calculated_total := calculated_total + product_record.price_clp * item_quantity;
  end loop;

  insert into public.store_orders(commerce_order, customer_email, total_clp)
  values (p_commerce_order, p_customer_email, calculated_total)
  returning id into new_order_id;

  for item_data in select value from jsonb_array_elements(p_items)
  loop
    product_id := (item_data->>'id')::uuid;
    item_quantity := (item_data->>'quantity')::integer;
    select nombre, marca, coalesce(precio, precio_sugerido, 0)::bigint as price_clp
      into product_record from public.perfumes where id = product_id;
    item_price := product_record.price_clp;

    insert into public.store_order_items(
      order_id, product_id, product_name, product_brand, quantity, unit_price_clp, subtotal_clp
    ) values (
      new_order_id, product_id, product_record.nombre, product_record.marca,
      item_quantity, item_price, item_price * item_quantity
    );

    update public.perfumes set reserved_stock = reserved_stock + item_quantity where id = product_id;
  end loop;

  return query select new_order_id, calculated_total;
end;
$$;

create or replace function public.confirm_store_order(
  p_order_id uuid,
  p_flow_status integer,
  p_provider_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.store_orders%rowtype;
  unavailable_count integer;
begin
  select * into order_record from public.store_orders where id = p_order_id for update;
  if order_record.id is null then raise exception 'Order not found'; end if;
  if order_record.status = 'paid' then return; end if;
  if p_flow_status <> 2 then raise exception 'Flow payment is not paid'; end if;

  select count(*) into unavailable_count
  from public.store_order_items item
  join public.perfumes perfume on perfume.id = item.product_id
  where item.order_id = p_order_id
    and (not perfume.activo or perfume.stock < item.quantity);

  if unavailable_count > 0 then raise exception 'Insufficient stock while confirming order'; end if;

  update public.perfumes perfume
  set stock = perfume.stock - item.quantity,
      reserved_stock = greatest(0, perfume.reserved_stock - item.quantity)
  from public.store_order_items item
  where item.order_id = p_order_id and perfume.id = item.product_id;

  update public.store_orders
  set status = 'paid', flow_status = p_flow_status, provider_payload = p_provider_payload,
      paid_at = now(), reservation_released = true, updated_at = now()
  where id = p_order_id;
end;
$$;

create or replace function public.release_store_order(
  p_order_id uuid,
  p_flow_status integer,
  p_provider_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  order_record public.store_orders%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('nuite-store-inventory'));
  select * into order_record from public.store_orders where id = p_order_id for update;
  if order_record.id is null or order_record.status = 'paid' or order_record.reservation_released then return; end if;

  update public.perfumes perfume
  set reserved_stock = greatest(0, perfume.reserved_stock - item.quantity)
  from public.store_order_items item
  where item.order_id = p_order_id and perfume.id = item.product_id;

  update public.store_orders
  set status = 'failed', flow_status = p_flow_status, provider_payload = p_provider_payload,
      reservation_released = true, updated_at = now()
  where id = p_order_id;
end;
$$;

revoke all on function public.confirm_store_order(uuid, integer, jsonb) from public;
revoke all on function public.create_store_order(text, text, jsonb) from public;
revoke all on function public.release_store_order(uuid, integer, jsonb) from public;
grant execute on function public.confirm_store_order(uuid, integer, jsonb) to service_role;
grant execute on function public.create_store_order(text, text, jsonb) to service_role;
grant execute on function public.release_store_order(uuid, integer, jsonb) to service_role;
revoke all on public.store_orders from anon, authenticated;
revoke all on public.store_order_items from anon, authenticated;
revoke all on public.store_payment_events from anon, authenticated;

commit;
