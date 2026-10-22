-- প্রতিটি ক্যাম্পেইনের AI বিশ্লেষণ রিপোর্ট। report_date (Ad Account-এর টাইমজোনে আজকের তারিখ)
-- দিয়ে unique, তাই একটি ক্যাম্পেইনে দিনে একটির বেশি রিপোর্ট ডাটাবেসই হতে দেয় না।
create table if not exists public.campaign_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  campaign_id text not null,
  campaign_name text,
  date_from date not null,
  date_to date not null,
  report_date date not null,
  provider text not null,
  model text not null,
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, campaign_id, report_date)
);

create index if not exists campaign_reports_lookup_idx
  on public.campaign_reports (user_id, campaign_id, created_at desc);

alter table public.campaign_reports enable row level security;

create policy "own campaign reports - select"
  on public.campaign_reports for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own campaign reports - insert"
  on public.campaign_reports for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own campaign reports - delete"
  on public.campaign_reports for delete
  to authenticated
  using ((select auth.uid()) = user_id);
