-- Hook থেকে বিজ্ঞাপনে করা প্রতিটি পরিবর্তনের লগ (চালু-বন্ধ, বাজেট)। শুধু যোগ করা যায়, বদলানো বা মোছা যায় না।
create table if not exists public.ad_change_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  object_id text not null,
  object_name text,
  action text not null check (action in ('status', 'daily_budget')),
  old_value text,
  new_value text,
  ok boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists ad_change_log_user_idx on public.ad_change_log (user_id, created_at desc);

alter table public.ad_change_log enable row level security;

create policy "ad change log - select own" on public.ad_change_log for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "ad change log - insert own" on public.ad_change_log for insert to authenticated
  with check ((select auth.uid()) = user_id);
