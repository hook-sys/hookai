-- AI সহকারী: কাজ অনুযায়ী মডেল (সহকারী আর রিপোর্ট আলাদা), আর চ্যাটের ইতিহাস ও অনুমোদনের অপেক্ষায় থাকা কাজ।

alter table public.ai_settings
  add column if not exists assistant_model text check (assistant_model is null or char_length(assistant_model) <= 200),
  add column if not exists report_model text check (report_model is null or char_length(report_model) <= 200);

-- task: 'assistant' বা 'report'; সেট না থাকলে প্রোভাইডারের সাধারণ মডেল
create or replace function public.get_task_ai_config(p_task text)
returns table (provider text, model text, api_key_encrypted text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.provider,
         case p_task
           when 'assistant' then coalesce(nullif(s.assistant_model, ''), c.model)
           when 'report' then coalesce(nullif(s.report_model, ''), c.model)
           else c.model
         end,
         c.api_key_encrypted
  from public.ai_settings s
  join public.ai_provider_configs c on c.provider = s.active_provider
  where s.id = 1 and c.api_key_encrypted is not null;
$$;
revoke execute on function public.get_task_ai_config(text) from public, anon;
grant execute on function public.get_task_ai_config(text) to authenticated;

create table if not exists public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  ad_account_id text,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 20000),
  -- অনুমোদনের অপেক্ষায় থাকা কাজ: {action, args, summary}
  proposal jsonb,
  proposal_status text check (proposal_status in ('pending', 'approved', 'rejected', 'done', 'failed')),
  result text,
  model text,
  created_at timestamptz not null default now()
);
create index if not exists assistant_messages_user_idx on public.assistant_messages (user_id, created_at desc);

alter table public.assistant_messages enable row level security;
create policy "assistant messages - select own" on public.assistant_messages for select to authenticated using ((select auth.uid()) = user_id);
create policy "assistant messages - insert own" on public.assistant_messages for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "assistant messages - update own" on public.assistant_messages for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "assistant messages - delete own" on public.assistant_messages for delete to authenticated using ((select auth.uid()) = user_id);

-- সহকারী শুরুতে Claude Opus 5.5 (fal.ai-এর মাধ্যমে); সেটিং থেকে বদলানো যায়
update public.ai_settings set assistant_model = 'anthropic/claude-opus-5.5' where id = 1 and assistant_model is null;

-- প্রতিটি উত্তরের AI খরচ (ডলারে, প্রোভাইডার জানালে)
alter table public.assistant_messages add column if not exists cost_usd numeric;
