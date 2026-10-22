-- সুপার অ্যাডমিন তালিকা। এখানে সারি যোগ/মোছা শুধু Supabase ড্যাশবোর্ড বা SQL থেকে হয়,
-- অ্যাপ থেকে নয়, যাতে কেউ নিজেকে অ্যাডমিন বানাতে না পারে।
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- ব্যবহারকারী শুধু জানতে পারে সে নিজে অ্যাডমিন কিনা
create policy "own admin row - select"
  on public.admin_users for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- RLS policy-তে ব্যবহারের জন্য। security definer, যাতে admin_users-এর RLS-এ আটকে না যায়।
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- প্রতিটি AI প্রোভাইডারের কী (এনক্রিপ্টেড) ও মডেল। প্রোভাইডার বদলালেও অন্যদের কী থেকে যায়।
create table if not exists public.ai_provider_configs (
  provider text primary key
    check (provider in ('fal', 'openai', 'gemini', 'anthropic')),
  api_key_encrypted text,
  model text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- কোন প্রোভাইডার এখন চালু আছে (একটিমাত্র সারি)
create table if not exists public.ai_settings (
  id smallint primary key default 1 check (id = 1),
  active_provider text
    check (active_provider in ('fal', 'openai', 'gemini', 'anthropic')),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.ai_settings (id) values (1) on conflict (id) do nothing;

alter table public.ai_provider_configs enable row level security;
alter table public.ai_settings enable row level security;

create policy "admins manage ai provider configs"
  on public.ai_provider_configs for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "admins manage ai settings"
  on public.ai_settings for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
