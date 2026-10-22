-- AI-এর তৈরি সারসংক্ষেপ। content-এ কাঠামোবদ্ধ JSON (শিরোনাম, ভালো দিক, সমস্যা, সুপারিশ)।
create table if not exists public.ai_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  range_days int not null check (range_days in (7, 14, 30)),
  provider text not null,
  model text not null,
  content jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_summaries_lookup_idx
  on public.ai_summaries (user_id, ad_account_id, range_days, created_at desc);

alter table public.ai_summaries enable row level security;

create policy "own summaries - select"
  on public.ai_summaries for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own summaries - insert"
  on public.ai_summaries for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own summaries - delete"
  on public.ai_summaries for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- সাধারণ ব্যবহারকারীর সারসংক্ষেপ তৈরির সময় সার্ভারকে চালু প্রোভাইডারের কনফিগ পড়তে হয়,
-- অথচ ai_* টেবিল শুধু অ্যাডমিন পড়তে পারে। তাই এই ফাংশন শুধু চালু প্রোভাইডারের সারিটি দেয়।
-- কী এনক্রিপ্টেড অবস্থায় আসে; ডিক্রিপ্ট করার কী শুধু সার্ভারের env-এ থাকে।
create or replace function public.get_active_ai_config()
returns table (provider text, model text, api_key_encrypted text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.provider, c.model, c.api_key_encrypted
  from public.ai_settings s
  join public.ai_provider_configs c on c.provider = s.active_provider
  where s.id = 1 and c.api_key_encrypted is not null;
$$;

revoke execute on function public.get_active_ai_config() from public, anon;
grant execute on function public.get_active_ai_config() to authenticated;
