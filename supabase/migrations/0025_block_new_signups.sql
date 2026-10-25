-- এখন শুধু মালিক ব্যবহার করে: কেউ নতুন অ্যাকাউন্ট খুলতে পারবে না, ওয়েবসাইট ছাড়া সরাসরি Supabase দিয়েও না।
-- আবার খুলতে: drop trigger block_new_signups on auth.users; (আর Vercel-এ NEXT_PUBLIC_SIGNUP_OPEN=true)
create or replace function public.block_new_signups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'New sign-ups are closed' using errcode = '42501';
end;
$$;

revoke all on function public.block_new_signups() from public, anon, authenticated;

drop trigger if exists block_new_signups on auth.users;
create trigger block_new_signups
  before insert on auth.users
  for each row execute function public.block_new_signups();
