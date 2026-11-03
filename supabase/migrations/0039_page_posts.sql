-- Page Posts: Hook থেকে সরাসরি Facebook Page-এ রেগুলার (organic) পোস্ট।
-- সব পোস্ট আগে খসড়া; মালিক approve করলেই শুধু প্রকাশ হয় (হাতে বা শিডিউলের cron দিয়ে)।
create table if not exists public.page_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid references public.clients (id) on delete set null,
  page_id text not null,
  page_name text,
  kind text not null check (kind in ('text', 'photo', 'video')),
  caption text not null default '',
  -- media: [{path, kind, name, url?, url_expires_at?}] — path হয় storage পাথ ("userId/posts/...")
  -- নয়তো "drive:FILE_ID" (launch-এর মতোই)। url: approve-এর সময় বানানো সাময়িক signed লিংক (cron-এর জন্য)।
  media jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'scheduled', 'publishing', 'published', 'failed')),
  scheduled_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  fb_post_id text,
  permalink text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists page_posts_user_created_idx on public.page_posts (user_id, created_at desc);
create index if not exists page_posts_due_idx on public.page_posts (status, scheduled_at) where scheduled_at is not null;

alter table public.page_posts enable row level security;

-- ব্যবহারকারী শুধু নিজের সারি দেখতে ও বদলাতে পারবে (0001-এর মতো)
create policy "own page posts - select"
  on public.page_posts for select
  using (auth.uid() = user_id);

create policy "own page posts - insert"
  on public.page_posts for insert
  with check (auth.uid() = user_id);

create policy "own page posts - update"
  on public.page_posts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own page posts - delete"
  on public.page_posts for delete
  using (auth.uid() = user_id);

-- ---------- cron: শিডিউল হয়ে যাওয়া approve করা পোস্ট (0031-এর cron_check প্যাটার্ন) ----------

-- সময় হয়েছে এমন পোস্ট আর তাদের Meta টোকেন; টোকেন এনক্রিপ্টেডই ফেরত যায়, route ডিক্রিপ্ট করে।
-- user_email ফেরত যায় যাতে route PAGE_POSTS_ALLOWED_EMAILS যাচাই করতে পারে।
create or replace function public.cron_page_posts_due(p_secret text) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  perform public.cron_check(p_secret);
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_result
  from (
    select
      pp.id,
      pp.user_id,
      u.email as user_email,
      m.access_token_encrypted as token,
      pp.page_id,
      pp.page_name,
      pp.kind,
      pp.caption,
      pp.media,
      pp.scheduled_at,
      pp.approved_at
    from public.page_posts pp
    join public.meta_connections m on m.user_id = pp.user_id
    join auth.users u on u.id = pp.user_id
    where pp.status in ('approved', 'scheduled')
      and pp.approved_at is not null
      and pp.scheduled_at is not null
      and pp.scheduled_at <= now()
      and m.access_token_encrypted is not null
      and (m.token_expires_at is null or m.token_expires_at > now())
    order by pp.scheduled_at asc
    limit 50
  ) p;
  return v_result;
end;
$$;
revoke all on function public.cron_page_posts_due(text) from public, authenticated;
grant execute on function public.cron_page_posts_due(text) to anon;

-- অবস্থা লেখা: publishing দাবি করা (শুধু approved/scheduled থেকে), তারপর published/failed।
-- দাবি সফল হলে true ফেরত দেয় (একই পোস্ট দুইবার প্রকাশ ঠেকাতে)।
create or replace function public.cron_page_posts_mark(
  p_secret text,
  p_id uuid,
  p_status text,
  p_fb_post_id text default null,
  p_permalink text default null,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  perform public.cron_check(p_secret);
  if p_status = 'publishing' then
    update public.page_posts
      set status = 'publishing', error = null, updated_at = now()
      where id = p_id and status in ('approved', 'scheduled') and approved_at is not null;
  elsif p_status in ('published', 'failed') then
    update public.page_posts
      set status = p_status,
          fb_post_id = coalesce(p_fb_post_id, fb_post_id),
          permalink = coalesce(p_permalink, permalink),
          error = p_error,
          published_at = case when p_status = 'published' then now() else published_at end,
          updated_at = now()
      where id = p_id and status = 'publishing';
  else
    return false;
  end if;
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;
revoke all on function public.cron_page_posts_mark(text, uuid, text, text, text, text) from public, authenticated;
grant execute on function public.cron_page_posts_mark(text, uuid, text, text, text, text) to anon;

-- প্রতি ১৫ মিনিটে শিডিউল যাচাই (0032-এর ধাঁচে; একই Vault secret)
select cron.schedule(
  'hook-page-posts',
  '3,18,33,48 * * * *',
  $job$
  select net.http_post(
    url := 'https://www.hook.com.bd/api/cron/page-posts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'hook_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 290000
  );
  $job$
);
