-- নতুন বিজ্ঞাপন চালু করা: লেখা নির্দেশনা থেকে AI পরিকল্পনা, মালিক দেখে অনুমোদন দিলে Meta-তে তৈরি।
create table if not exists public.ad_launches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  ad_account_id text not null,
  brief text not null check (char_length(brief) <= 4000),
  spec jsonb not null,
  status text not null default 'draft'
    check (status in ('draft', 'creating', 'waiting_video', 'paused', 'active', 'failed')),
  meta jsonb not null default '{}'::jsonb, -- তৈরি হওয়া campaign/adset/creative/ad ID
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_launches_user_idx on public.ad_launches (user_id, created_at desc);

alter table public.ad_launches enable row level security;
create policy "ad launches - select own" on public.ad_launches for select to authenticated using ((select auth.uid()) = user_id);
create policy "ad launches - insert own" on public.ad_launches for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ad launches - update own" on public.ad_launches for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "ad launches - delete own" on public.ad_launches for delete to authenticated using ((select auth.uid()) = user_id);

-- বিজ্ঞাপনের ছবি/ভিডিও: ব্যক্তিগত স্টোরেজ, প্রতিটি ব্যবহারকারীর নিজের ফোল্ডার (user_id/...)।
-- ব্রাউজার থেকে সরাসরি আপলোড হয় (বড় ভিডিওও), তারপর Meta সেখান থেকে নেয়।
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ad-media', 'ad-media', false, 1073741824,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "ad media - read own" on storage.objects for select to authenticated
  using (bucket_id = 'ad-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "ad media - upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'ad-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "ad media - delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'ad-media' and (storage.foldername(name))[1] = (select auth.uid())::text);
