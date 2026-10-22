-- প্রতিটি ব্যবহারকারীর Meta সংযোগ (এনক্রিপ্টেড টোকেনসহ)
create table if not exists public.meta_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  meta_user_id text not null,
  meta_user_name text,
  -- AES-256-GCM দিয়ে এনক্রিপ্টেড; কী শুধু সার্ভারের কাছে থাকে
  access_token_encrypted text not null,
  token_expires_at timestamptz,
  selected_ad_account_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.meta_connections enable row level security;

-- ব্যবহারকারী শুধু নিজের সারি দেখতে ও বদলাতে পারবে
create policy "own meta connection - select"
  on public.meta_connections for select
  using (auth.uid() = user_id);

create policy "own meta connection - insert"
  on public.meta_connections for insert
  with check (auth.uid() = user_id);

create policy "own meta connection - update"
  on public.meta_connections for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own meta connection - delete"
  on public.meta_connections for delete
  using (auth.uid() = user_id);
