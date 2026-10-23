-- ব্লগ পোস্ট। লেখা Markdown-এ। published_at ভবিষ্যতে হলে সেই সময় পর্যন্ত লুকানো থাকে (শিডিউল)।
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  title text not null check (length(title) between 1 and 200),
  excerpt text check (length(excerpt) <= 400),
  content text not null default '',
  cover_image_url text,
  category text check (length(category) <= 60),
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  author_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists blog_posts_published_idx
  on public.blog_posts (published_at desc)
  where status = 'published';

alter table public.blog_posts enable row level security;

-- সবাই (লগইন ছাড়াও) শুধু প্রকাশিত ও সময় হয়ে যাওয়া পোস্ট পড়তে পারে
create policy "anyone reads published posts"
  on public.blog_posts for select
  to anon, authenticated
  using (status = 'published' and published_at is not null and published_at <= now());

-- সুপার অ্যাডমিন সব পোস্ট (খসড়াসহ) দেখতে ও বদলাতে পারে
create policy "admins manage posts"
  on public.blog_posts for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ব্লগের ছবি: সবাই দেখতে পারে, শুধু অ্যাডমিন আপলোড/মুছতে পারে
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog-images', 'blog-images', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "admins upload blog images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'blog-images' and (select public.is_admin()));

create policy "admins update blog images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()));

create policy "admins delete blog images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()));
