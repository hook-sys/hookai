-- is_admin()-কে security invoker করা হলো। ব্যবহারকারী admin_users-এ শুধু নিজের সারি
-- দেখতে পারে, তাই বাড়তি অধিকার ছাড়াই একই ফল দেয় (Supabase advisor 0029)।
create or replace function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users where user_id = (select auth.uid())
  );
$$;
