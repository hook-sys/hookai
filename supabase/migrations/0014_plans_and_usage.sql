-- প্ল্যান (free, solo, pro, agency)। সারি না থাকলে free ধরা হয়।
-- ব্যবহারকারী নিজের প্ল্যান শুধু দেখতে পারে; বদলাতে পারে শুধু অ্যাডমিন (পেমেন্ট চালু হলে সার্ভার)।
create table if not exists public.user_plans (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'solo', 'pro', 'agency')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.user_plans enable row level security;

create policy "user plans - select own or admin"
  on public.user_plans for select
  to authenticated
  using ((select auth.uid()) = user_id or (select public.is_admin()));

create policy "user plans - admin insert"
  on public.user_plans for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "user plans - admin update"
  on public.user_plans for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- প্রতিটি AI কাজের হিসাব (মাসিক/দৈনিক সীমার জন্য)। মুছে ফেলার অনুমতি নেই,
-- তাই রিপোর্ট বা সারসংক্ষেপ মুছেও সীমা ফিরে পাওয়া যায় না।
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('summary', 'campaign_report', 'ad_copy', 'funnel')),
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_lookup_idx
  on public.ai_usage (user_id, kind, created_at desc);

alter table public.ai_usage enable row level security;

create policy "ai usage - select own"
  on public.ai_usage for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "ai usage - insert own"
  on public.ai_usage for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- AI দিয়ে লেখা অ্যাডের লেখা (Primary text, Headline ইত্যাদি), পরে আবার দেখার জন্য
create table if not exists public.ad_copies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  input jsonb not null,
  content jsonb not null,
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index if not exists ad_copies_lookup_idx
  on public.ad_copies (user_id, created_at desc);

alter table public.ad_copies enable row level security;

create policy "ad copies - select own"
  on public.ad_copies for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "ad copies - insert own"
  on public.ad_copies for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "ad copies - delete own"
  on public.ad_copies for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- অ্যাডমিনের জন্য সব ব্যবহারকারী ও তাদের প্ল্যান (auth.users সরাসরি পড়া যায় না)
create or replace function public.admin_list_users()
returns table (user_id uuid, email text, plan text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.admin_users a where a.user_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  return query
    select u.id, u.email::text, coalesce(p.plan, 'free'), u.created_at
    from auth.users u
    left join public.user_plans p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
