-- ধাপ ২ আর ৩: ক্লায়েন্টের ওয়েবসাইট (Pixel যাচাই) আর Conversions API সেটিং;
-- অর্ডারে ক্রেতার তথ্য শুধু hash করে (SHA-256) রাখা হয়, আসল ফোন/ইমেইল নয়।

alter table public.clients
  add column if not exists website_url text check (website_url is null or char_length(website_url) <= 300),
  add column if not exists capi_pixel_id text check (capi_pixel_id is null or capi_pixel_id ~ '^[0-9]{5,25}$'),
  add column if not exists capi_enabled boolean not null default false,
  add column if not exists capi_send_confirmed boolean not null default true,
  add column if not exists capi_send_delivered boolean not null default true,
  add column if not exists capi_last_sent_at timestamptz,
  add column if not exists capi_last_error text;

alter table public.orders
  add column if not exists customer_hash jsonb,
  add column if not exists fbc text check (fbc is null or char_length(fbc) <= 500),
  add column if not exists capi_confirmed_at timestamptz,
  add column if not exists capi_delivered_at timestamptz;

-- পাঠানোর অপেক্ষায় থাকা অর্ডার খুঁজতে
create index if not exists orders_capi_pending_idx on public.orders (client_id, status_updated_at)
  where status in ('confirmed', 'shipped', 'delivered');

-- webhook দিয়ে আসা অর্ডারেও ক্রেতার hash আর fbc রাখা (নতুন দুটো প্যারামিটার, বাকিটা আগের মতো)
create or replace function public.shop_webhook_order(
  p_connection_id uuid,
  p_token text,
  p_external_id text,
  p_order_date date,
  p_amount numeric,
  p_status text,
  p_campaign_id text,
  p_campaign_name text,
  p_courier text,
  p_tracking_code text,
  p_raw_status text default null,
  p_customer_hash jsonb default null,
  p_fbc text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conn public.shop_connections%rowtype;
  v_count integer;
  v_campaign text;
  v_name text;
  v_status text := p_status;
begin
  select * into v_conn
  from public.shop_connections
  where id = p_connection_id
    and webhook_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_conn.id is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if v_conn.platform = 'woocommerce' and lower(regexp_replace(coalesce(p_raw_status, ''), '^wc-', '')) = 'processing' then
    v_status := v_conn.processing_status;
  end if;
  if v_status not in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  if nullif(p_campaign_id, '') is null and nullif(p_campaign_name, '') is not null then
    select d.campaign_id into v_campaign
    from public.ad_insights_daily d
    where d.user_id = v_conn.user_id
      and lower(trim(d.campaign_name)) = lower(trim(p_campaign_name))
    order by d.date desc
    limit 1;
  end if;
  if nullif(p_campaign_id, '') is not null and nullif(p_campaign_name, '') is null then
    select d.campaign_name into v_name
    from public.ad_insights_daily d
    where d.user_id = v_conn.user_id
      and d.campaign_id = p_campaign_id
    order by d.date desc
    limit 1;
  end if;

  update public.shop_connections set last_webhook_at = now() where id = v_conn.id;

  insert into public.orders as o (
    user_id, client_id, ad_account_id, external_id, order_date, amount, status, source,
    campaign_id, campaign_name, courier, tracking_code, customer_hash, fbc
  ) values (
    v_conn.user_id, v_conn.client_id, v_conn.ad_account_id, left(p_external_id, 100), p_order_date, greatest(coalesce(p_amount, 0), 0),
    v_status, v_conn.platform, coalesce(nullif(p_campaign_id, ''), v_campaign), coalesce(nullif(left(p_campaign_name, 300), ''), v_name),
    nullif(p_courier, ''), nullif(left(p_tracking_code, 100), ''), p_customer_hash, nullif(left(p_fbc, 500), '')
  )
  on conflict (user_id, ad_account_id, external_id) do update set
    amount = excluded.amount,
    campaign_id = coalesce(o.campaign_id, excluded.campaign_id),
    campaign_name = coalesce(o.campaign_name, excluded.campaign_name),
    courier = coalesce(o.courier, excluded.courier),
    tracking_code = coalesce(o.tracking_code, excluded.tracking_code),
    customer_hash = coalesce(excluded.customer_hash, o.customer_hash),
    fbc = coalesce(o.fbc, excluded.fbc),
    status = case when public.store_status_wins(excluded.status, o.status) then excluded.status else o.status end,
    status_updated_at = case when public.store_status_wins(excluded.status, o.status) then now() else o.status_updated_at end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- আগের ১১-প্যারামিটারের সংস্করণ সরানো, যাতে একটাই থাকে; আগের মতোই শুধু webhook (anon) ডাকতে পারে
drop function if exists public.shop_webhook_order(uuid, text, text, date, numeric, text, text, text, text, text, text);
revoke all on function public.shop_webhook_order(uuid, text, text, date, numeric, text, text, text, text, text, text, jsonb, text) from public;
grant execute on function public.shop_webhook_order(uuid, text, text, date, numeric, text, text, text, text, text, text, jsonb, text) to anon, authenticated;

-- CAPI: পাঠানোর অপেক্ষায় থাকা অর্ডার (গত ৭ দিনে অবস্থা বদলেছে; Meta এর পুরোনো event নেয় না)
create or replace function public.cron_capi_pending(p_secret text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.cron_check(p_secret);
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_result
  from (
    select
      c.id as client_id,
      c.user_id,
      c.capi_pixel_id as pixel_id,
      c.website_url,
      c.capi_send_confirmed as send_confirmed,
      c.capi_send_delivered as send_delivered,
      m.access_token_encrypted as token,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', o.id, 'external_id', o.external_id, 'amount', o.amount, 'status', o.status,
          'status_updated_at', o.status_updated_at, 'created_at', o.created_at, 'customer_hash', o.customer_hash, 'fbc', o.fbc,
          'campaign_id', o.campaign_id, 'confirmed_sent', o.capi_confirmed_at is not null, 'delivered_sent', o.capi_delivered_at is not null
        )), '[]'::jsonb)
        from (
          select * from public.orders o
          where o.client_id = c.id
            and o.status in ('confirmed', 'shipped', 'delivered')
            and o.status_updated_at > now() - interval '6 days'
            -- ক্রেতাকে চেনার মতো তথ্য না থাকলে Meta মেলাতে পারে না; এগুলো বাদ
            and (o.customer_hash is not null or o.fbc is not null)
            and (
              (c.capi_send_confirmed and o.capi_confirmed_at is null)
              or (c.capi_send_delivered and o.status = 'delivered' and o.capi_delivered_at is null)
            )
          order by o.status_updated_at
          limit 1000
        ) o
      ) as orders
    from public.clients c
    join public.meta_connections m on m.user_id = c.user_id
    where c.capi_enabled and c.capi_pixel_id is not null
      and m.access_token_encrypted is not null
  ) x;
  return v_result;
end;
$$;
revoke all on function public.cron_capi_pending(text) from public, authenticated;
grant execute on function public.cron_capi_pending(text) to anon;

create or replace function public.cron_capi_mark(p_secret text, p_client uuid, p_confirmed uuid[], p_delivered uuid[], p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cron_check(p_secret);
  update public.orders set capi_confirmed_at = now() where client_id = p_client and id = any (coalesce(p_confirmed, '{}'));
  update public.orders set capi_delivered_at = now() where client_id = p_client and id = any (coalesce(p_delivered, '{}'));
  update public.clients
    set capi_last_sent_at = case when coalesce(array_length(p_confirmed, 1), 0) + coalesce(array_length(p_delivered, 1), 0) > 0 then now() else capi_last_sent_at end,
        capi_last_error = p_error
  where id = p_client;
end;
$$;
revoke all on function public.cron_capi_mark(text, uuid, uuid[], uuid[], text) from public, authenticated;
grant execute on function public.cron_capi_mark(text, uuid, uuid[], uuid[], text) to anon;
