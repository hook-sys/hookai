-- দোকানের অর্ডার, যাতে কোন ক্যাম্পেইন থেকে কয়টা অর্ডার কনফার্ম, ডেলিভারি বা ক্যানসেল হলো দেখা যায়।
-- Meta শুধু Purchase জানে; অর্ডারের আসল অবস্থা আসে হাতে লেখা, CSV, দোকান বা কুরিয়ার থেকে।
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ad_account_id text not null,
  external_id text not null check (char_length(external_id) between 1 and 100),
  order_date date not null,
  campaign_id text check (campaign_id ~ '^[0-9]{1,30}$'),
  campaign_name text check (char_length(campaign_name) <= 300),
  amount numeric(14, 2) not null default 0 check (amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned')),
  source text not null default 'manual'
    check (source in ('manual', 'csv', 'api', 'shopify', 'woocommerce', 'courier')),
  courier text check (courier in ('steadfast', 'pathao', 'redx', 'paperfly', 'other')),
  tracking_code text check (char_length(tracking_code) <= 100),
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, ad_account_id, external_id)
);

create index if not exists orders_account_date_idx
  on public.orders (user_id, ad_account_id, order_date);

alter table public.orders enable row level security;

create policy "orders - select own"
  on public.orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "orders - insert own"
  on public.orders for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "orders - update own"
  on public.orders for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "orders - delete own"
  on public.orders for delete
  to authenticated
  using ((select auth.uid()) = user_id);
