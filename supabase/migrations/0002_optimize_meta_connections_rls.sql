-- auth.uid() প্রতি সারিতে না চালিয়ে কোয়েরিতে একবার চালানোর জন্য (select auth.uid())
-- Supabase advisor: auth_rls_initplan
drop policy if exists "own meta connection - select" on public.meta_connections;
drop policy if exists "own meta connection - insert" on public.meta_connections;
drop policy if exists "own meta connection - update" on public.meta_connections;
drop policy if exists "own meta connection - delete" on public.meta_connections;

create policy "own meta connection - select"
  on public.meta_connections for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "own meta connection - insert"
  on public.meta_connections for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "own meta connection - update"
  on public.meta_connections for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own meta connection - delete"
  on public.meta_connections for delete
  to authenticated
  using ((select auth.uid()) = user_id);
