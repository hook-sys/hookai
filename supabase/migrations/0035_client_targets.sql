-- সব ক্লায়েন্টের হোম: প্রতিটা ক্লায়েন্টের লক্ষ্য (অর্ডারপ্রতি খরচ, Ad Account-এর মুদ্রায়)।
-- এর সাথে মিলিয়ে হোমে সবুজ/হলুদ/লাল দেখায়।
alter table public.clients
  add column if not exists target_cost_per_order numeric check (target_cost_per_order is null or target_cost_per_order > 0);
