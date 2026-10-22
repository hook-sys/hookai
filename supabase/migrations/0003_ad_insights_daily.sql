-- ক্যাম্পেইন-লেভেলের দৈনিক বিজ্ঞাপন ডাটা (Meta Insights থেকে sync করা)।
-- হিসাব (CPA, ROAS ইত্যাদি) এখানে রাখা হয় না; কোডে কাঁচা সংখ্যা থেকে হিসাব হয়।
create table if not exists public.ad_insights_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  campaign_id text not null,
  campaign_name text,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  purchases numeric(14, 2) not null default 0,
  purchase_value numeric(14, 2) not null default 0,
  leads numeric(14, 2) not null default 0,
  fetched_at timestamptz not null default now(),
  unique (user_id, ad_account_id, campaign_id, date)
);

create index if not exists ad_insights_daily_account_date_idx
  on public.ad_insights_daily (user_id, ad_account_id, date);

alter table public.ad_insights_daily enable row level security;

create policy "own insights - select"
  on public.ad_insights_daily for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own insights - insert"
  on public.ad_insights_daily for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own insights - update"
  on public.ad_insights_daily for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own insights - delete"
  on public.ad_insights_daily for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- নির্বাচিত Ad Account-এর নাম, মুদ্রা ও শেষ sync-এর সময়
alter table public.meta_connections
  add column if not exists selected_ad_account_name text,
  add column if not exists selected_ad_account_currency text,
  add column if not exists insights_synced_at timestamptz;
