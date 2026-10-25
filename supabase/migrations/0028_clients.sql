-- ক্লায়েন্ট (ব্র্যান্ড): প্রতিটি ক্লায়েন্টের নিজের Ad Account, দোকান ও কুরিয়ার। একজন ব্যবহারকারী (মালিক)
-- অনেক ক্লায়েন্ট সামলায়; Orders পাতায় শুধু বেছে নেওয়া ক্লায়েন্টের অর্ডার, দোকান ও কুরিয়ার দেখায়।
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create index if not exists clients_user_idx on public.clients (user_id);

-- একটা Ad Account একটাই ক্লায়েন্টের
create table if not exists public.client_ad_accounts (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  ad_account_id text not null check (ad_account_id ~ '^act_[0-9]{1,20}$'),
  ad_account_name text,
  created_at timestamptz not null default now(),
  primary key (user_id, ad_account_id)
);
create index if not exists client_ad_accounts_client_idx on public.client_ad_accounts (client_id);

alter table public.clients enable row level security;
alter table public.client_ad_accounts enable row level security;

create policy "clients - select own" on public.clients for select to authenticated using ((select auth.uid()) = user_id);
create policy "clients - insert own" on public.clients for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "clients - update own" on public.clients for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "clients - delete own" on public.clients for delete to authenticated using ((select auth.uid()) = user_id);

create policy "client ad accounts - select own" on public.client_ad_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy "client ad accounts - insert own" on public.client_ad_accounts for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid())));
create policy "client ad accounts - update own" on public.client_ad_accounts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.clients c where c.id = client_id and c.user_id = (select auth.uid())));
create policy "client ad accounts - delete own" on public.client_ad_accounts for delete to authenticated using ((select auth.uid()) = user_id);

-- দোকান, কুরিয়ার আর অর্ডার কোন ক্লায়েন্টের
alter table public.shop_connections add column if not exists client_id uuid references public.clients (id) on delete cascade;
alter table public.courier_connections add column if not exists client_id uuid references public.clients (id) on delete cascade;
alter table public.orders add column if not exists client_id uuid references public.clients (id) on delete set null;
alter table public.meta_connections add column if not exists selected_client_id uuid references public.clients (id) on delete set null;

create index if not exists orders_client_date_idx on public.orders (client_id, order_date);

-- প্রতিটি ক্লায়েন্টে প্রতি ধরনের কুরিয়ার একটাই (আগে ছিল প্রতি ব্যবহারকারী একটাই)
alter table public.courier_connections drop constraint if exists courier_connections_user_id_courier_key;
create unique index if not exists courier_connections_client_courier_key on public.courier_connections (client_id, courier);

-- এখনকার ডাটা: মালিকের প্রথম ক্লায়েন্ট "Formal Men BD", তার Ad Account, দোকান ও অর্ডার
do $$
declare
  v_user uuid;
  v_client uuid;
begin
  select user_id into v_user from public.shop_connections where shop_domain = 'formalmenbd.com' limit 1;
  if v_user is null then
    return;
  end if;
  select id into v_client from public.clients where user_id = v_user and name = 'Formal Men BD';
  if v_client is null then
    insert into public.clients (user_id, name) values (v_user, 'Formal Men BD') returning id into v_client;
  end if;
  insert into public.client_ad_accounts (user_id, client_id, ad_account_id, ad_account_name) values
    (v_user, v_client, 'act_927414092991616', 'Formal Men USA'),
    (v_user, v_client, 'act_457513100782945', 'AU338 FM Moto'),
    (v_user, v_client, 'act_1603671611131779', 'HOOK US 02'),
    (v_user, v_client, 'act_1042046774265968', 'AX393 Hook Content Solution')
  on conflict (user_id, ad_account_id) do nothing;
  update public.shop_connections set client_id = v_client where user_id = v_user and client_id is null;
  update public.courier_connections set client_id = v_client where user_id = v_user and client_id is null;
  update public.orders set client_id = v_client where user_id = v_user and client_id is null;
  update public.meta_connections set selected_client_id = v_client where user_id = v_user;
end;
$$;
