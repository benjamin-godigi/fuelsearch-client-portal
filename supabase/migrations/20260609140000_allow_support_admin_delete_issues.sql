-- Allow deleting a support request from the admin Support & Requests table
-- (e.g. spam, duplicates, or test entries). Deletion is destructive and
-- irreversible, so it is restricted to SUPER ADMINS only — regular admins (even
-- with manageSupport) and customers can never delete a request.
--
-- A DELETE policy alone is not enough: the authenticated role was only granted
-- select/insert/update on public.issues (see 20260605213000), so it also needs
-- the table-level DELETE privilege or the delete fails with "permission denied".
grant delete on table public.issues to authenticated;

create policy "Super admins can delete requests"
on public.issues for delete to authenticated
using ((select private.is_portal_super_admin()));
