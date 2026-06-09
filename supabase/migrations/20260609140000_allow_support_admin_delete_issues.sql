-- Allow support staff to delete a support request from the admin
-- Support & Requests table (e.g. spam, duplicates, or test entries).
-- Mirrors "Support admins can update requests": gated on the manageSupport
-- permission, so ordinary customers can never delete a request.
create policy "Support admins can delete requests"
on public.issues for delete to authenticated
using ((select private.has_portal_permission('manageSupport')));
