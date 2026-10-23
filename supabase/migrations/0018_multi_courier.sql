-- একাধিক কুরিয়ার (Steadfast, Pathao, CarryBee)। প্রতিটি কুরিয়ারের credential আলাদা ধরনের, তাই
-- সব credential একটি এনক্রিপ্ট করা JSON-এ থাকে। webhook secret Steadfast/Pathao-তে আমরা বানাই,
-- CarryBee-তে CarryBee নিজে দেয় (তখন ব্যবহারকারী বসায়), তাই সেটি পরে আসতে পারে।
alter table public.courier_connections drop constraint if exists courier_connections_courier_check;
alter table public.courier_connections
  add constraint courier_connections_courier_check check (courier in ('steadfast', 'pathao', 'carrybee'));

alter table public.courier_connections
  drop column if exists api_key_encrypted,
  drop column if exists secret_key_encrypted,
  add column if not exists credentials_encrypted text not null default '',
  add column if not exists webhook_setup_until timestamptz,
  alter column webhook_token_encrypted drop not null,
  alter column webhook_token_hash drop not null;
alter table public.courier_connections alter column credentials_encrypted drop default;

alter table public.orders drop constraint if exists orders_courier_check;
alter table public.orders
  add constraint orders_courier_check check (courier in ('steadfast', 'pathao', 'carrybee', 'redx', 'paperfly', 'other'));

drop function if exists public.steadfast_webhook(uuid, text, text, text, text);

-- কুরিয়ারের webhook লগইন ছাড়া আসে। secret মিললে শুধু সেই ব্যবহারকারীর মেলানো অর্ডারের অবস্থা বদলায়।
-- শেষ হওয়া অর্ডার (ডেলিভারি, রিটার্ন, ক্যানসেল) দেরিতে আসা পুরনো খবরে আবার "কুরিয়ারে" ফেরে না।
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
  v_count integer;
begin
  select user_id into v_user
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

revoke all on function public.courier_webhook(uuid, text, text, text, text, text) from public;
grant execute on function public.courier_webhook(uuid, text, text, text, text, text) to anon, authenticated;

-- CarryBee webhook যোগ করার সময় secret ছাড়াই একটি পরীক্ষা পাঠায় আর উত্তরে secret ফেরত চায়।
-- ব্যবহারকারী "সেটআপ" চালু করলে ১০ মিনিটের মধ্যে একবারই সেটি দেওয়া হয় (এনক্রিপ্ট করা অবস্থায়;
-- সার্ভার নিজের key দিয়ে খোলে)। তারপর সুযোগ বন্ধ হয়ে যায়।
create or replace function public.carrybee_setup_secret(p_connection_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret text;
begin
  update public.courier_connections
  set webhook_setup_until = null
  where id = p_connection_id
    and courier = 'carrybee'
    and webhook_setup_until > now()
    and webhook_token_encrypted is not null
  returning webhook_token_encrypted into v_secret;
  return v_secret;
end;
$$;

revoke all on function public.carrybee_setup_secret(uuid) from public;
grant execute on function public.carrybee_setup_secret(uuid) to anon, authenticated;
