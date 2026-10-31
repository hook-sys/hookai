-- দোকানের নিজস্ব COD ফর্ম: ক্রেতা দোকানের পাতায় ফর্ম পূরণ করে, Shopify app proxy হয়ে Hook-এ আসে,
-- Hook যাচাই করে Shopify-তে অর্ডার বানায়। এখানে দোকান-প্রতি ডেলিভারি চার্জ আর স্প্যাম ঠেকানোর হিসাব।

alter table public.shop_connections
  add column if not exists cod_settings jsonb not null default '{"dhaka": 70, "outside": 130}'::jsonb;

create table if not exists public.cod_orders (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.shop_connections (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  phone_hash text not null,
  ip_hash text not null,
  order_name text,
  amount numeric,
  created_at timestamptz not null default now()
);
create index if not exists cod_orders_conn_time on public.cod_orders (connection_id, created_at desc);
alter table public.cod_orders enable row level security;
create policy "cod orders - select own" on public.cod_orders for select to authenticated
  using ((select auth.uid()) = user_id);

-- app proxy route-এর চাবি (META_TOKEN_ENCRYPTION_KEY থেকে HMAC দিয়ে বানানো) cron_secrets-এ 'cod' নামে hash হয়ে থাকে
create or replace function public.cod_check(p_key text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.cron_secrets
    where name = 'cod' and secret_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end;
$$;
revoke all on function public.cod_check(text) from public, anon, authenticated;

-- দোকানের সংযোগ, আর এই ফোন/IP থেকে সাম্প্রতিক অর্ডারের সংখ্যা
create or replace function public.cod_connection(p_key text, p_shop text, p_phone_hash text, p_ip_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  perform public.cod_check(p_key);
  select jsonb_build_object(
    'id', s.id,
    'user_id', s.user_id,
    'credentials_encrypted', s.credentials_encrypted,
    'cod_settings', s.cod_settings,
    'phone_recent', (select count(*) from public.cod_orders o
                     where o.connection_id = s.id and o.phone_hash = p_phone_hash and o.created_at > now() - interval '10 minutes'),
    'ip_recent', (select count(*) from public.cod_orders o
                  where o.connection_id = s.id and o.ip_hash = p_ip_hash and o.created_at > now() - interval '1 hour')
  ) into v
  from public.shop_connections s
  where s.platform = 'shopify' and s.shop_domain = p_shop
  order by s.created_at desc
  limit 1;
  return v;
end;
$$;
revoke all on function public.cod_connection(text, text, text, text) from public, authenticated;
grant execute on function public.cod_connection(text, text, text, text) to anon;

create or replace function public.cod_save(p_key text, p_connection_id uuid, p_phone_hash text, p_ip_hash text, p_order_name text, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cod_check(p_key);
  insert into public.cod_orders (connection_id, user_id, phone_hash, ip_hash, order_name, amount)
  select s.id, s.user_id, p_phone_hash, p_ip_hash, p_order_name, p_amount
  from public.shop_connections s where s.id = p_connection_id;
end;
$$;
revoke all on function public.cod_save(text, uuid, text, text, text, numeric) from public, authenticated;
grant execute on function public.cod_save(text, uuid, text, text, text, numeric) to anon;
