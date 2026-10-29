-- ক্লায়েন্ট প্রোফাইল: নতুন বিজ্ঞাপনের সাধারণ মান (পেজ, Pixel, বাজেট, অডিয়েন্স, ভাষা, ব্যবসার তথ্য)।
-- একবার লিখে রাখলে নতুন বিজ্ঞাপনে নিজে বসে যায়; ওয়েবসাইট আর লক্ষ্য আগের কলামেই থাকে।
alter table public.clients
  add column if not exists profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) < 20000);
