-- webhook ফাংশন: অর্ডার দোকান/কুরিয়ার সংযোগের ক্লায়েন্টে যায়, আর কুরিয়ার শুধু নিজের ক্লায়েন্টের অর্ডার বদলায়
create or replace function public.courier_webhook(
  p_connection_id uuid,
  p_courier text,
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
  v_client uuid;
  v_count integer;
begin
  select user_id, client_id into v_user, v_client
  from public.courier_connections
  where id = p_connection_id
    and courier = p_courier
    and webhook_token_hash is not null
    and webhook_token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');

  if v_user is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
  if p_status not in ('shipped', 'delivered', 'returned', 'cancelled') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  update public.courier_connections set last_webhook_at = now() where id = p_connection_id;

  update public.orders
  set status = p_status,
      status_updated_at = now(),
      courier = p_courier,
      tracking_code = coalesce(tracking_code, nullif(p_consignment_id, ''))
  where user_id = v_user
    and client_id is not distinct from v_client
    and (courier = p_courier or courier is null)
    and not (p_status = 'shipped' and status in ('delivered', 'returned', 'cancelled'))
    and (
      (nullif(p_consignment_id, '') is not null and tracking_code = p_consignment_id)
      or (nullif(p_invoice, '') is not null and external_id = p_invoice)
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
  p_raw_status text default null
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
  -- দোকানের সেটিং অনুযায়ী WooCommerce-এর "processing"
  if v_conn.platform = 'woocommerce' and lower(regexp_replace(coalesce(p_raw_status, ''), '^wc-', '')) = 'processing' then
    v_status := v_conn.processing_status;
  end if;
  if v_status not in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned') then
    raise exception 'bad status' using errcode = '22023';
  end if;

  -- ক্যাম্পেইন ID না এলে বিজ্ঞাপনের ডাটায় থাকা ক্যাম্পেইনের নাম দিয়ে মেলানো
  if nullif(p_campaign_id, '') is null and nullif(p_campaign_name, '') is not null then
    select d.campaign_id into v_campaign
    from public.ad_insights_daily d
    where d.user_id = v_conn.user_id
      and lower(trim(d.campaign_name)) = lower(trim(p_campaign_name))
    order by d.date desc
    limit 1;
  end if;
  -- ID দিয়ে মিললে তালিকায় দেখানোর জন্য ক্যাম্পেইনের নামও
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
    campaign_id, campaign_name, courier, tracking_code
  ) values (
    v_conn.user_id, v_conn.client_id, v_conn.ad_account_id, left(p_external_id, 100), p_order_date, greatest(coalesce(p_amount, 0), 0),
    v_status, v_conn.platform, coalesce(nullif(p_campaign_id, ''), v_campaign), coalesce(nullif(left(p_campaign_name, 300), ''), v_name),
    nullif(p_courier, ''), nullif(left(p_tracking_code, 100), '')
  )
  on conflict (user_id, ad_account_id, external_id) do update set
    amount = excluded.amount,
    campaign_id = coalesce(o.campaign_id, excluded.campaign_id),
    campaign_name = coalesce(o.campaign_name, excluded.campaign_name),
    courier = coalesce(o.courier, excluded.courier),
    tracking_code = coalesce(o.tracking_code, excluded.tracking_code),
    status = case when public.store_status_wins(excluded.status, o.status) then excluded.status else o.status end,
    status_updated_at = case when public.store_status_wins(excluded.status, o.status) then now() else o.status_updated_at end;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
