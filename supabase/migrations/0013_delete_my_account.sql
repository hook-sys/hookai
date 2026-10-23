-- ব্যবহারকারী নিজের অ্যাকাউন্ট মুছতে পারে। auth.users থেকে মুছলে on delete cascade-এর কারণে
-- Meta সংযোগ, বিজ্ঞাপনের ডাটা, AI রিপোর্ট, অ্যালার্ট, ক্যাশ সব একসাথে মুছে যায়।
-- security definer লাগে কারণ auth.users-এ সাধারণ ব্যবহারকারীর লেখার অধিকার নেই;
-- ফাংশনটি শুধু ডাকা ব্যক্তির নিজের সারি মোছে।
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- ভুল করে শেষ সুপার অ্যাডমিন মুছে গেলে অ্যাপ পরিচালনা করা যাবে না
  if exists (select 1 from public.admin_users where user_id = uid) then
    raise exception 'admin accounts cannot be deleted from the app';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
