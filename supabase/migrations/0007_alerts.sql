-- কোডের নিয়মে পাওয়া সমস্যা (CPA বৃদ্ধি, ফলাফল নেই, CTR কমা ইত্যাদি)।
-- একই ক্যাম্পেইন-ধরন-দিনে একটিই অ্যালার্ট; ব্যবহারকারী "দেখেছি" চাপলে dismissed_at বসে।
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  campaign_id text not null,
  campaign_name text,
  type text not null,
  severity text not null check (severity in ('high', 'medium')),
  title text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  alert_date date not null,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  unique (user_id, ad_account_id, campaign_id, type, alert_date)
);

create index if not exists alerts_active_idx
  on public.alerts (user_id, ad_account_id, alert_date desc)
  where dismissed_at is null;

alter table public.alerts enable row level security;

create policy "own alerts - select"
  on public.alerts for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own alerts - insert"
  on public.alerts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own alerts - update"
  on public.alerts for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own alerts - delete"
  on public.alerts for delete
  to authenticated
  using ((select auth.uid()) = user_id);
