-- Meta-র মতো যেকোনো তারিখ (আজ, গতকাল, কাস্টম, সর্বোচ্চ) দেখানোর জন্য
alter table public.meta_connections
  -- "আজ" কোন দিন তা Ad Account-এর টাইমজোনে হিসাব হয়, Meta-ও তাই করে
  add column if not exists selected_ad_account_timezone text,
  -- ডাটাবেসে এই তারিখ থেকে আজ পর্যন্ত ডাটা আনা আছে
  add column if not exists insights_synced_from date,
  -- আজ ও গতকালের ডাটা শেষ কখন আনা হয়েছে (দিনের মধ্যে বারবার বদলায়)
  add column if not exists insights_today_synced_at timestamptz;

-- সারসংক্ষেপ এখন নির্দিষ্ট তারিখের জন্য, শুধু ৭/১৪/৩০ দিন নয়
alter table public.ai_summaries
  add column if not exists date_from date,
  add column if not exists date_to date,
  alter column range_days drop not null;

alter table public.ai_summaries drop constraint if exists ai_summaries_range_days_check;

create index if not exists ai_summaries_dates_idx
  on public.ai_summaries (user_id, ad_account_id, date_from, date_to, created_at desc);
