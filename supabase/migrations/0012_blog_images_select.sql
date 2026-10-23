-- Storage API দিয়ে ফাইল মুছতে ফাইলটি "পড়ার" অনুমতিও লাগে; না থাকলে কোনো ত্রুটি ছাড়াই কিছু মোছে না।
-- (ছবি সবার কাছে পাবলিক লিংকে দেখায়; এই নিয়ম শুধু API দিয়ে তালিকা/মোছার জন্য)
create policy "admins read blog images"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'blog-images' and (select public.is_admin()));
