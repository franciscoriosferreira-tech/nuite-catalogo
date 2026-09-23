begin;

create or replace function public.store_orders_fill_products_total()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.products_total_clp is null then
    new.products_total_clp := new.total_clp - coalesce(new.shipping_amount_clp, 0);
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'store_orders_fill_products_total'
      and tgrelid = 'public.store_orders'::regclass
  ) then
    create trigger store_orders_fill_products_total
    before insert on public.store_orders
    for each row
    execute function public.store_orders_fill_products_total();
  end if;
end;
$$;

commit;
