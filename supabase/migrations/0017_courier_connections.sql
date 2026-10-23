-- কুরিয়ার সংযোগ (প্রথমে Steadfast): API key দিয়ে পার্সেলের অবস্থা আনা, আর webhook দিয়ে সাথে সাথে খবর পাওয়া।
-- key ও webhook token অ্যাপের নিজের এনক্রিপশনে রাখা; token-এর sha256 থাকে webhook যাচাইয়ের জন্য।
create table if not exists public.courier_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  courier text not null check (courier in ('steadfast')),
  api_key_encrypted text not null,
  secret_key_encrypted text not null,
  webhook_token_encrypted text not null,
  webhook_token_hash text not null,
  last_synced_at timestamptz,
  last_webhook_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, courier)
);

alter table public.courier_connections enable row level security;

create policy "courier connections - select own"
  on public.courier_connections for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "courier connections - insert own"
  on public.courier_connections for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "courier connections - update own"
  on public.courier_connections for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "courier connections - delete own"
  on public.courier_connections for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Steadfast-এর webhook লগইন ছাড়া আসে। token মিললে শুধু সেই ব্যবহারকারীর মেলানো অর্ডারের অবস্থা বদলায়।
create or replace function public.steadfast_webhook(
  p_connection_id uuid,
  p_token text,
  p_consignment_id text,
  p_invoice text,
  p_status text
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_count integer;
begin
  select user_id into v_user
  from public.courier_connections
  where id = p_connection_id
    and courier = 'steadfast'
    and webhook_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if v_user is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_status not in ('shipped', 'delivered', 'returned') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  update public.courier_connections set last_webhook_at = now() where id = p_connection_id;

  update public.orders
  set status = p_status,
      status_updated_at = now(),
      courier = 'steadfast',
      tracking_code = coalesce(tracking_code, nullif(p_consignment_id, ''))
  where user_id = v_user
    and (courier = 'steadfast' or courier is null)
    and (
      (nullif(p_consignment_id, '') is not null and tracking_code = p_consignment_id)
      or (nullif(p_invoice, '') is not null and external_id = p_invoice)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.steadfast_webhook(uuid, text, text, text, text) from public;
grant execute on function public.steadfast_webhook(uuid, text, text, text, text) to anon, authenticated;
