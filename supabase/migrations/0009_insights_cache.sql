-- Reach, Frequency, Result ও ব্রেকডাউন দিনভিত্তিক যোগ করা যায় না, তাই নির্দিষ্ট তারিখের জন্য
-- Meta থেকে সরাসরি আনা হয়। বারবার Meta-কে না ডাকতে কিছুক্ষণ জমা রাখা হয়।
create table if not exists public.insights_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  kind text not null,
  date_from date not null,
  date_to date not null,
  payload jsonb not null,
  fetched_at timestamptz not null default now(),
  unique (user_id, ad_account_id, kind, date_from, date_to)
);

alter table public.insights_cache enable row level security;

create policy "own cache - select"
  on public.insights_cache for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own cache - insert"
  on public.insights_cache for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own cache - update"
  on public.insights_cache for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own cache - delete"
  on public.insights_cache for delete
  to authenticated
  using ((select auth.uid()) = user_id);
