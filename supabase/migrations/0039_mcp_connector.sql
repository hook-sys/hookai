-- Claude (claude.ai)-র কাস্টম কানেক্টর (MCP) এর জন্য: নিজস্ব OAuth লগইন, টোকেন আর সব write কাজের লগ।
-- টোকেন/কোড কখনো সরাসরি রাখা হয় না, শুধু sha256 hash। টেবিলে কেউ সরাসরি লিখতে পারে না;
-- সব কাজ নিচের security definer ফাংশন দিয়ে, যা hash মিলিয়ে তবেই কাজ করে।

create table if not exists public.mcp_oauth_clients (
  client_id text primary key check (client_id ~ '^hkc_[A-Za-z0-9_-]{20,64}$'),
  client_name text not null default 'MCP client' check (char_length(client_name) <= 100),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at timestamptz not null default now()
);

create table if not exists public.mcp_oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  access_hash text not null unique check (access_hash ~ '^[0-9a-f]{64}$'),
  refresh_hash text not null unique check (refresh_hash ~ '^[0-9a-f]{64}$'),
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mcp_tokens_user_idx on public.mcp_tokens (user_id, created_at desc);

-- কে, কখন, কোন ক্লায়েন্টে, কী বদলাল (শুধু যোগ হয়; বদলানো বা মোছা যায় না)
create table if not exists public.mcp_action_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  via text not null,
  client_name text,
  tool text not null,
  object_id text,
  summary text not null,
  params jsonb not null default '{}'::jsonb check (pg_column_size(params) < 20000),
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists mcp_action_log_user_idx on public.mcp_action_log (user_id, created_at desc);

alter table public.mcp_oauth_clients enable row level security;
alter table public.mcp_oauth_codes enable row level security;
alter table public.mcp_tokens enable row level security;
alter table public.mcp_action_log enable row level security;

-- নিজের টোকেন আর লগ দেখা যায় (পরে সেটিংস পাতায় দেখানোর জন্য); লেখা শুধু ফাংশন দিয়ে
create policy "mcp tokens - select own" on public.mcp_tokens for select to authenticated using ((select auth.uid()) = user_id);
create policy "mcp log - select own" on public.mcp_action_log for select to authenticated using ((select auth.uid()) = user_id);

-- ---------- OAuth ----------

-- Claude নিজেকে নিবন্ধন করে (Dynamic Client Registration)। কোন redirect চলবে তা Node-এ আর এখানে দুই জায়গায় যাচাই।
create or replace function public.mcp_register_client(p_client_id text, p_name text, p_redirects text[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from unnest(p_redirects) r where r !~ '^(https://(claude\.ai|claude\.com)/api/mcp/auth_callback|http://(localhost|127\.0\.0\.1):[0-9]{2,5}/callback)$') then
    raise exception 'redirect not allowed';
  end if;
  if (select count(*) from public.mcp_oauth_clients where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'too many registrations';
  end if;
  insert into public.mcp_oauth_clients (client_id, client_name, redirect_uris)
  values (p_client_id, left(coalesce(nullif(trim(p_name), ''), 'MCP client'), 100), p_redirects);
end $$;

-- লগইন করা Admin "Allow" চাপলে এককালীন কোড (১০ মিনিট)
create or replace function public.mcp_issue_code(p_code_hash text, p_client_id text, p_redirect_uri text, p_challenge text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if auth.uid() is null or not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'not allowed';
  end if;
  select client_name into v_name from public.mcp_oauth_clients
   where client_id = p_client_id and p_redirect_uri = any (redirect_uris);
  if v_name is null then raise exception 'unknown client'; end if;
  delete from public.mcp_oauth_codes where expires_at < now() - interval '1 day';
  insert into public.mcp_oauth_codes (code_hash, client_id, user_id, redirect_uri, code_challenge, expires_at)
  values (p_code_hash, p_client_id, auth.uid(), p_redirect_uri, p_challenge, now() + interval '10 minutes');
  return v_name;
end $$;

-- কোড → টোকেন (PKCE মিলিয়ে)। p_challenge_check = Node-এ verifier থেকে বানানো S256।
create or replace function public.mcp_exchange_code(
  p_code_hash text, p_client_id text, p_redirect_uri text, p_challenge_check text, p_access_hash text, p_refresh_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare c public.mcp_oauth_codes%rowtype;
begin
  -- ভুল হলেও কোডটা খরচ হয়ে যায় (exception না দিয়ে false ফেরত, যাতে used_at থেকে যায়)
  update public.mcp_oauth_codes set used_at = now()
   where code_hash = p_code_hash and used_at is null and expires_at > now()
   returning * into c;
  if c.code_hash is null or c.client_id <> p_client_id or c.redirect_uri <> p_redirect_uri or c.code_challenge <> p_challenge_check then
    return false;
  end if;
  insert into public.mcp_tokens (user_id, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
  values (c.user_id, c.client_id, p_access_hash, p_refresh_hash, now() + interval '1 hour', now() + interval '30 days');
  return true;
end $$;

-- refresh টোকেন একবারই চলে: পুরোনোটা বাতিল, নতুন জোড়া
create or replace function public.mcp_refresh(p_refresh_hash text, p_client_id text, p_access_hash text, p_new_refresh_hash text)
returns void language plpgsql security definer set search_path = '' as $$
declare t public.mcp_tokens%rowtype;
begin
  update public.mcp_tokens set revoked_at = now()
   where refresh_hash = p_refresh_hash and client_id = p_client_id and revoked_at is null and refresh_expires_at > now()
   returning * into t;
  if t.id is null then raise exception 'invalid_grant'; end if;
  if not exists (select 1 from public.admin_users where user_id = t.user_id) then raise exception 'invalid_grant'; end if;
  insert into public.mcp_tokens (user_id, client_id, access_hash, refresh_hash, access_expires_at, refresh_expires_at)
  values (t.user_id, t.client_id, p_access_hash, p_new_refresh_hash, now() + interval '1 hour', now() + interval '30 days');
end $$;

-- টোকেন যাচাই; ঠিক থাকলে user id
create or replace function public.mcp_token_user(p_access_hash text)
returns table (user_id uuid, via text) language plpgsql security definer set search_path = '' as $$
begin
  return query
  with hit as (
    update public.mcp_tokens t set last_used_at = now()
      from public.mcp_oauth_clients c
     where t.access_hash = p_access_hash and t.revoked_at is null and t.access_expires_at > now()
       and c.client_id = t.client_id
       and exists (select 1 from public.admin_users a where a.user_id = t.user_id)
    returning t.user_id as uid, c.client_name as name
  )
  select hit.uid, hit.name from hit;
end $$;

-- ---------- টুলের জন্য ডেটা ----------

-- এই ব্যবহারকারীর Meta টোকেন (এনক্রিপ্ট করা) আর ক্লায়েন্টদের তালিকা
create or replace function public.mcp_context(p_access_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_via text;
begin
  select u.user_id, u.via into v_user, v_via from public.mcp_token_user(p_access_hash) u;
  if v_user is null then raise exception 'unauthorized'; end if;
  return jsonb_build_object(
    'user_id', v_user,
    'via', v_via,
    'token', (select access_token_encrypted from public.meta_connections where user_id = v_user),
    'clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'name', c.name, 'website_url', c.website_url, 'profile', c.profile,
        'accounts', coalesce((select jsonb_agg(jsonb_build_object('id', a.ad_account_id, 'name', a.ad_account_name) order by a.created_at)
                                from public.client_ad_accounts a where a.client_id = c.id), '[]'::jsonb)
      ) order by c.name)
      from public.clients c where c.user_id = v_user), '[]'::jsonb)
  );
end $$;

create or replace function public.mcp_log(
  p_access_hash text, p_client_name text, p_tool text, p_object_id text, p_summary text, p_params jsonb, p_ok boolean, p_error text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_via text;
begin
  select u.user_id, u.via into v_user, v_via from public.mcp_token_user(p_access_hash) u;
  if v_user is null then raise exception 'unauthorized'; end if;
  insert into public.mcp_action_log (user_id, via, client_name, tool, object_id, summary, params, ok, error)
  values (v_user, v_via, left(p_client_name, 80), left(p_tool, 60), left(p_object_id, 60), left(p_summary, 500),
          coalesce(p_params, '{}'::jsonb), p_ok, left(p_error, 500));
end $$;

create or replace function public.mcp_recent_log(p_access_hash text, p_limit int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_via text;
begin
  select u.user_id, u.via into v_user, v_via from public.mcp_token_user(p_access_hash) u;
  if v_user is null then raise exception 'unauthorized'; end if;
  return coalesce((select jsonb_agg(to_jsonb(l) - 'user_id' - 'id' order by l.created_at desc) from (
    select * from public.mcp_action_log where user_id = v_user order by created_at desc limit least(greatest(p_limit, 1), 100)) l), '[]'::jsonb);
end $$;

-- ক্লায়েন্টের কনফিগ: না থাকলে তৈরি, প্রোফাইলে মিশিয়ে দেওয়া, Ad Account যুক্ত করা
create or replace function public.mcp_set_client(
  p_access_hash text, p_name text, p_profile_patch jsonb, p_website text, p_ad_account_id text, p_ad_account_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_via text; v_id uuid; v_owner uuid;
begin
  select u.user_id, u.via into v_user, v_via from public.mcp_token_user(p_access_hash) u;
  if v_user is null then raise exception 'unauthorized'; end if;
  if char_length(trim(p_name)) not between 1 and 80 then raise exception 'bad client name'; end if;

  select id into v_id from public.clients where user_id = v_user and lower(name) = lower(trim(p_name)) limit 1;
  if v_id is null then
    insert into public.clients (user_id, name) values (v_user, trim(p_name)) returning id into v_id;
  end if;
  update public.clients
     set profile = profile || coalesce(p_profile_patch, '{}'::jsonb),
         website_url = coalesce(nullif(trim(p_website), ''), website_url)
   where id = v_id;

  if p_ad_account_id is not null then
    if p_ad_account_id !~ '^act_[0-9]{1,20}$' then raise exception 'bad ad account id'; end if;
    select client_id into v_owner from public.client_ad_accounts where user_id = v_user and ad_account_id = p_ad_account_id;
    if v_owner is not null and v_owner <> v_id then raise exception 'ad account belongs to another client'; end if;
    if v_owner is null then
      insert into public.client_ad_accounts (user_id, client_id, ad_account_id, ad_account_name)
      values (v_user, v_id, p_ad_account_id, left(p_ad_account_name, 200));
    end if;
  end if;
  return jsonb_build_object('client_id', v_id);
end $$;

revoke all on function public.mcp_register_client(text, text, text[]) from public, anon, authenticated;
revoke all on function public.mcp_issue_code(text, text, text, text) from public, anon, authenticated;
revoke all on function public.mcp_exchange_code(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.mcp_refresh(text, text, text, text) from public, anon, authenticated;
revoke all on function public.mcp_token_user(text) from public, anon, authenticated;
revoke all on function public.mcp_context(text) from public, anon, authenticated;
revoke all on function public.mcp_log(text, text, text, text, text, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.mcp_recent_log(text, int) from public, anon, authenticated;
revoke all on function public.mcp_set_client(text, text, jsonb, text, text, text) from public, anon, authenticated;

grant execute on function public.mcp_register_client(text, text, text[]) to anon, authenticated;
grant execute on function public.mcp_issue_code(text, text, text, text) to authenticated;
grant execute on function public.mcp_exchange_code(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.mcp_refresh(text, text, text, text) to anon, authenticated;
grant execute on function public.mcp_context(text) to anon, authenticated;
grant execute on function public.mcp_log(text, text, text, text, text, jsonb, boolean, text) to anon, authenticated;
grant execute on function public.mcp_recent_log(text, int) to anon, authenticated;
grant execute on function public.mcp_set_client(text, text, jsonb, text, text, text) to anon, authenticated;
