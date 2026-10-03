begin;

create table if not exists public.store_order_notifications (
  order_id uuid not null references public.store_orders(id) on delete cascade,
  notification_type text not null check (notification_type in ('customer_paid', 'merchant_paid')),
  status text not null default 'sending' check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (order_id, notification_type)
);

alter table public.store_order_notifications enable row level security;
revoke all on public.store_order_notifications from anon, authenticated;

create or replace function public.claim_store_order_notification(
  p_order_id uuid,
  p_notification_type text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_count integer;
begin
  if p_notification_type not in ('customer_paid', 'merchant_paid') then
    raise exception 'Invalid notification type';
  end if;

  insert into public.store_order_notifications(order_id, notification_type)
  values (p_order_id, p_notification_type)
  on conflict (order_id, notification_type) do update
    set status = 'sending',
        attempts = store_order_notifications.attempts + 1,
        last_error = null,
        updated_at = now()
    where store_order_notifications.status = 'failed'
       or (store_order_notifications.status = 'sending'
           and store_order_notifications.updated_at < now() - interval '10 minutes');

  get diagnostics claimed_count = row_count;
  return claimed_count = 1;
end;
$$;

revoke all on function public.claim_store_order_notification(uuid, text) from public;
grant execute on function public.claim_store_order_notification(uuid, text) to service_role;

commit;
