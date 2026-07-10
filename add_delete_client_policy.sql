-- Run this in your Supabase SQL Editor to enable deleting clients
drop policy if exists "clients_delete_admin" on public.clients;
create policy "clients_delete_admin" on public.clients for delete using (public.is_admin());
