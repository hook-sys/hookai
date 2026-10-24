-- ব্যবহারকারীর সব Ad Account-এর ক্যাম্পেইনের নাম। একটা দোকানের অর্ডার কয়েকটা Ad Account-এর বিজ্ঞাপন
-- থেকে আসে; শুধু বেছে রাখা অ্যাকাউন্টের ডাটা থাকলে বাকিগুলোর জায়গায় ক্যাম্পেইন ID দেখাত।
create table if not exists public.campaign_directory (
  user_id uuid not null references auth.users (id) on delete cascade,
  campaign_id text not null,
  name text not null,
  ad_account_id text not null,
  ad_account_name text,
  updated_at timestamptz not null default now(),
  primary key (user_id, campaign_id)
);

alter table public.campaign_directory enable row level security;

create policy "campaign directory - select own" on public.campaign_directory for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "campaign directory - insert own" on public.campaign_directory for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "campaign directory - update own" on public.campaign_directory for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "campaign directory - delete own" on public.campaign_directory for delete to authenticated
  using ((select auth.uid()) = user_id);
