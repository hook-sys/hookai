-- রিপোর্টের অন্য ভাষার সংস্করণ (বাংলা বা ইংরেজি)। প্রতিটি রিপোর্টে প্রতি ভাষায় একটিই,
-- তাই অনুবাদের AI খরচ রিপোর্টের সংখ্যার বেশি হতে পারে না।
create table if not exists public.report_translations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  report_kind text not null check (report_kind in ('summary', 'campaign')),
  report_id uuid not null,
  locale text not null check (locale in ('en', 'bn')),
  content jsonb not null,
  created_at timestamptz not null default now(),
  unique (report_kind, report_id, locale)
);

create index if not exists report_translations_user_idx on public.report_translations (user_id);

alter table public.report_translations enable row level security;

create policy "report translations - select own"
  on public.report_translations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "report translations - insert own"
  on public.report_translations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "report translations - delete own"
  on public.report_translations for delete
  to authenticated
  using ((select auth.uid()) = user_id);
