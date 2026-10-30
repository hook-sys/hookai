-- প্রতিযোগী গবেষণা: প্রতিটা ক্লায়েন্টের প্রতিযোগী, তাদের ওয়েবসাইটের ছবি (প্রোডাক্ট, দাম, অফার),
-- Ad Library থেকে পেস্ট করা বিজ্ঞাপনের বিশ্লেষণ, কী বদলাল তার তালিকা, আর AI রিপোর্ট।

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  website_url text check (website_url is null or char_length(website_url) <= 500),
  -- Ad Library-তে খোঁজার নাম বা পেজের আইডি
  ad_library_query text check (ad_library_query is null or char_length(ad_library_query) <= 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  platform text,
  site_status text check (site_status is null or site_status in ('ok', 'blocked', 'error')),
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists competitors_user_idx on public.competitors (user_id, client_id);

create table if not exists public.competitor_snapshots (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('site', 'ads')),
  data jsonb not null check (pg_column_size(data) < 2000000),
  created_at timestamptz not null default now()
);
create index if not exists competitor_snapshots_idx on public.competitor_snapshots (competitor_id, kind, created_at desc);

create table if not exists public.competitor_changes (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.competitors (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('new_product', 'removed_product', 'price_down', 'price_up', 'sale_start', 'sale_end', 'new_ads', 'stopped_ads')),
  title text not null check (char_length(title) <= 300),
  detail text check (detail is null or char_length(detail) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists competitor_changes_idx on public.competitor_changes (user_id, created_at desc);

create table if not exists public.competitor_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete cascade,
  content jsonb not null check (pg_column_size(content) < 500000),
  model text,
  cost_usd numeric,
  created_at timestamptz not null default now()
);
create index if not exists competitor_reports_idx on public.competitor_reports (user_id, client_id, created_at desc);

alter table public.competitors enable row level security;
alter table public.competitor_snapshots enable row level security;
alter table public.competitor_changes enable row level security;
alter table public.competitor_reports enable row level security;

create policy "competitors - own" on public.competitors for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "competitor snapshots - own" on public.competitor_snapshots for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "competitor changes - own" on public.competitor_changes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "competitor reports - own" on public.competitor_reports for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- ---------- প্রতিদিনের স্বয়ংক্রিয় ওয়েবসাইট দেখা (ঘণ্টার cron থেকে, গোপন কোড যাচাই করে) ----------

-- যাদের ২০ ঘণ্টার বেশি দেখা হয়নি, তাদের ওয়েবসাইট আর শেষবারের ছবি (কী বদলাল বোঝার জন্য)
create or replace function public.cron_competitors_due(p_secret text, p_limit int)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.cron_check(p_secret);
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_result
  from (
    select x.id, x.user_id, x.website_url,
      (select s.data from public.competitor_snapshots s
        where s.competitor_id = x.id and s.kind = 'site' order by s.created_at desc limit 1) as prev
    from public.competitors x
    where x.website_url is not null
      and (x.last_checked_at is null or x.last_checked_at < now() - interval '20 hours')
    order by x.last_checked_at nulls first
    limit greatest(1, least(coalesce(p_limit, 5), 20))
  ) c;
  return v_result;
end;
$$;
revoke all on function public.cron_competitors_due(text, int) from public, authenticated;
grant execute on function public.cron_competitors_due(text, int) to anon;

create or replace function public.cron_competitor_save(p_secret text, p_id uuid, p_status text, p_error text, p_platform text, p_data jsonb, p_changes jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  perform public.cron_check(p_secret);
  select user_id into v_user from public.competitors where id = p_id;
  if v_user is null then
    return;
  end if;
  if p_data is not null then
    insert into public.competitor_snapshots (competitor_id, user_id, kind, data) values (p_id, v_user, 'site', p_data);
  end if;
  insert into public.competitor_changes (competitor_id, user_id, kind, title, detail)
  select p_id, v_user, e->>'kind', left(e->>'title', 300), left(e->>'detail', 1000)
  from jsonb_array_elements(coalesce(p_changes, '[]'::jsonb)) e
  where e->>'kind' in ('new_product', 'removed_product', 'price_down', 'price_up', 'sale_start', 'sale_end');
  update public.competitors
    set last_checked_at = now(), site_status = p_status, last_error = left(p_error, 300), platform = coalesce(p_platform, platform)
    where id = p_id;
  -- পুরোনো ছবি বেশি জমতে না দেওয়া (৬০ দিনের বেশি পুরোনো মোছা)
  delete from public.competitor_snapshots where competitor_id = p_id and kind = 'site' and created_at < now() - interval '60 days';
end;
$$;
revoke all on function public.cron_competitor_save(text, uuid, text, text, text, jsonb, jsonb) from public, authenticated;
grant execute on function public.cron_competitor_save(text, uuid, text, text, text, jsonb, jsonb) to anon;
