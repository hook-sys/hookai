-- স্বয়ংক্রিয় নিয়ম আর অ্যালার্ট: খরচ বেশি হলে বন্ধ, ভালো চললে বাজেট বাড়ানো, সমস্যা হলে WhatsApp-এ জানানো।
-- প্রতি ঘণ্টায় Supabase-এর pg_cron Hook-এর /api/cron/rules ডাকে। সেই রুট লগইন ছাড়া চলে, তাই
-- ডাটা পড়া-লেখা হয় শুধু নিচের security-definer ফাংশন দিয়ে, যেগুলো একটা গোপন key মিলিয়ে নেয়।

create table if not exists public.ad_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  ad_account_id text not null,
  name text not null check (char_length(name) between 1 and 120),
  enabled boolean not null default true,
  level text not null check (level in ('campaign', 'adset')),
  -- ফাঁকা = এই অ্যাকাউন্টের সব চালু ক্যাম্পেইন/Ad Set
  object_ids text[] not null default '{}',
  metric text not null check (metric in ('cost_per_result', 'cost_per_purchase', 'cost_per_order', 'results', 'roas', 'ctr', 'delivery_rate', 'spend')),
  time_window text not null check (time_window in ('today', 'last_3d', 'last_7d')),
  operator text not null check (operator in ('gt', 'lt')),
  threshold numeric not null check (threshold >= 0),
  -- এত খরচ না হওয়া পর্যন্ত বিচার করা হয় না (কম ডাটায় ভুল সিদ্ধান্ত এড়াতে)
  min_spend numeric not null default 0 check (min_spend >= 0),
  min_results numeric not null default 0 check (min_results >= 0),
  action text not null check (action in ('pause', 'increase_budget', 'decrease_budget', 'notify')),
  action_value numeric check (action_value is null or (action_value > 0 and action_value <= 50)),
  -- বাজেট এর বেশি কখনো বাড়ানো হবে না
  max_budget numeric check (max_budget is null or max_budget > 0),
  cooldown_hours integer not null default 24 check (cooldown_hours between 1 and 168),
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_rules_user_idx on public.ad_rules (user_id, ad_account_id);

alter table public.ad_rules enable row level security;
create policy "ad rules - select own" on public.ad_rules for select to authenticated using ((select auth.uid()) = user_id);
create policy "ad rules - insert own" on public.ad_rules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ad rules - update own" on public.ad_rules for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ad rules - delete own" on public.ad_rules for delete to authenticated using ((select auth.uid()) = user_id);

-- প্রতিটি নিয়মের কাজের লগ (শুধু যোগ হয়)
create table if not exists public.rule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid references public.ad_rules (id) on delete set null,
  rule_name text,
  ad_account_id text not null,
  level text not null,
  object_id text not null,
  object_name text,
  metric_value numeric,
  action text not null,
  detail text,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists rule_events_user_idx on public.rule_events (user_id, created_at desc);
create index if not exists rule_events_cooldown_idx on public.rule_events (rule_id, object_id, created_at desc);

alter table public.rule_events enable row level security;
create policy "rule events - select own" on public.rule_events for select to authenticated using ((select auth.uid()) = user_id);
create policy "rule events - insert own" on public.rule_events for insert to authenticated with check ((select auth.uid()) = user_id);

-- অ্যালার্ট (নাম notifications, কারণ alerts নামে ড্যাশবোর্ডের পুরোনো টেবিল আছে): একই সমস্যা একবারই (dedupe_key)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text,
  kind text not null,
  severity text not null default 'warning' check (severity in ('info', 'warning', 'critical')),
  title text not null,
  body text,
  dedupe_key text not null,
  sent_at timestamptz,
  send_error text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy "notifications - select own" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications - insert own" on public.notifications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notifications - update own" on public.notifications for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- WhatsApp আর অ্যালার্টের সেটিং
create table if not exists public.notify_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  alerts_enabled boolean not null default true,
  -- সব নিয়ম একসাথে থামানোর সুইচ
  rules_paused boolean not null default false,
  whatsapp_provider text check (whatsapp_provider in ('callmebot', 'meta_cloud')),
  whatsapp_to text check (whatsapp_to is null or whatsapp_to ~ '^[0-9]{8,15}$'),
  credentials_encrypted text,
  updated_at timestamptz not null default now()
);

alter table public.notify_settings enable row level security;
create policy "notify settings - select own" on public.notify_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "notify settings - insert own" on public.notify_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notify settings - update own" on public.notify_settings for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- কোন পরিবর্তন নিয়ম থেকে, কোনটা হাতে
alter table public.ad_change_log add column if not exists source text not null default 'manual';

-- cron-এর গোপন key-এর hash (কোনো policy নেই, তাই লগইন করা কেউও পড়তে পারে না)
create table if not exists public.cron_secrets (
  name text primary key,
  secret_hash text not null
);
alter table public.cron_secrets enable row level security;

create or replace function public.cron_check(p_secret text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.cron_secrets
    where name = 'rules' and secret_hash = encode(extensions.digest(coalesce(p_secret, ''), 'sha256'), 'hex')
  ) then
    raise exception 'unauthorized' using errcode = '28000';
  end if;
end;
$$;
revoke all on function public.cron_check(text) from public, anon, authenticated;

-- প্রতি ঘণ্টার কাজের জন্য দরকারি সব ডাটা: যাদের নিয়ম বা অ্যালার্ট চালু, তাদের টোকেন, অ্যাকাউন্ট, নিয়ম আর অর্ডার
create or replace function public.cron_snapshot(p_secret text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.cron_check(p_secret);
  select coalesce(jsonb_agg(u), '[]'::jsonb) into v_result
  from (
    select
      m.user_id,
      m.access_token_encrypted as token,
      coalesce(n.alerts_enabled, true) as alerts_enabled,
      coalesce(n.rules_paused, false) as rules_paused,
      n.whatsapp_provider,
      n.whatsapp_to,
      n.credentials_encrypted as whatsapp_credentials,
      (
        select coalesce(jsonb_agg(distinct ca.ad_account_id), '[]'::jsonb)
        from public.client_ad_accounts ca where ca.user_id = m.user_id
      ) as accounts,
      (
        select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb)
        from public.ad_rules r where r.user_id = m.user_id and r.enabled
      ) as rules,
      (
        select coalesce(jsonb_agg(jsonb_build_object(
          'campaign_id', o.campaign_id, 'order_date', o.order_date, 'status', o.status)), '[]'::jsonb)
        from public.orders o
        where o.user_id = m.user_id and o.campaign_id is not null and o.order_date >= current_date - 14
      ) as orders,
      (
        select coalesce(jsonb_agg(jsonb_build_object('rule_id', e.rule_id, 'object_id', e.object_id, 'created_at', e.created_at)), '[]'::jsonb)
        from public.rule_events e
        where e.user_id = m.user_id and e.ok and e.action <> 'notify' and e.created_at > now() - interval '7 days'
      ) as recent_actions
    from public.meta_connections m
    left join public.notify_settings n on n.user_id = m.user_id
    where m.access_token_encrypted is not null
      and (m.token_expires_at is null or m.token_expires_at > now())
      and (
        coalesce(n.alerts_enabled, true)
        or exists (select 1 from public.ad_rules r where r.user_id = m.user_id and r.enabled)
      )
  ) u;
  return v_result;
end;
$$;
revoke all on function public.cron_snapshot(text) from public, authenticated;
grant execute on function public.cron_snapshot(text) to anon;

-- কাজের ফল লেখা: লগ, বিজ্ঞাপন পরিবর্তনের লগ আর অ্যালার্ট। নতুন (আগে না পাঠানো) অ্যালার্টগুলো ফেরত দেয়।
create or replace function public.cron_write(p_secret text, p_user uuid, p_events jsonb, p_alerts jsonb, p_rule_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new jsonb;
begin
  perform public.cron_check(p_secret);

  insert into public.rule_events (user_id, rule_id, rule_name, ad_account_id, level, object_id, object_name, metric_value, action, detail, ok, error)
  select p_user, (e->>'rule_id')::uuid, e->>'rule_name', e->>'ad_account_id', e->>'level', e->>'object_id', e->>'object_name',
         nullif(e->>'metric_value', '')::numeric, e->>'action', e->>'detail', coalesce((e->>'ok')::boolean, true), e->>'error'
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e;

  insert into public.ad_change_log (user_id, ad_account_id, level, object_id, object_name, action, old_value, new_value, ok, error, source)
  select p_user, e->>'ad_account_id', e->>'level', e->>'object_id', e->>'object_name',
         case when e->>'action' = 'pause' then 'status' else 'daily_budget' end,
         e->>'old_value', e->>'new_value', coalesce((e->>'ok')::boolean, true), e->>'error', 'rule'
  from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) e
  where e->>'action' in ('pause', 'increase_budget', 'decrease_budget') and e->>'level' in ('campaign', 'adset');

  update public.ad_rules set last_run_at = now() where user_id = p_user and id = any (coalesce(p_rule_ids, '{}'));

  with ins as (
    insert into public.notifications (user_id, ad_account_id, kind, severity, title, body, dedupe_key)
    select p_user, a->>'ad_account_id', a->>'kind', coalesce(a->>'severity', 'warning'), a->>'title', a->>'body', a->>'dedupe_key'
    from jsonb_array_elements(coalesce(p_alerts, '[]'::jsonb)) a
    on conflict (user_id, dedupe_key) do nothing
    returning id, title, body, severity
  )
  select coalesce(jsonb_agg(to_jsonb(ins)), '[]'::jsonb) into v_new from ins;
  return v_new;
end;
$$;
revoke all on function public.cron_write(text, uuid, jsonb, jsonb, uuid[]) from public, authenticated;
grant execute on function public.cron_write(text, uuid, jsonb, jsonb, uuid[]) to anon;

create or replace function public.cron_mark_sent(p_secret text, p_ids uuid[], p_error text) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.cron_check(p_secret);
  update public.notifications set sent_at = case when p_error is null then now() else null end, send_error = p_error
  where id = any (coalesce(p_ids, '{}'));
end;
$$;
revoke all on function public.cron_mark_sent(text, uuid[], text) from public, authenticated;
grant execute on function public.cron_mark_sent(text, uuid[], text) to anon;
