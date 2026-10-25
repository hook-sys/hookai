-- উপরের Ad Account বদলের মেনুর জন্য Meta-র Ad Account তালিকা জমা রাখা (প্রতি পাতায় Meta-কে না ডেকে)
alter table public.meta_connections
  add column if not exists ad_accounts_cache jsonb,
  add column if not exists ad_accounts_cached_at timestamptz;
