-- LOCAL REVIEW ONLY. Apply to a remote database only with separate authorization.
-- Super admin (SUPER_ADMIN_PASSWORD) can hide an event from regular admins. The flag lives on
-- the events row, outside the content document, so saving an event never changes it. Guests
-- are not affected: a published hidden event stays reachable by its link.
begin;

alter table public.events add column admin_hidden boolean not null default false;
alter table public.admin_access_log add column role text check (role is null or role in ('admin','super'));

alter table public.event_audit drop constraint event_audit_action_check;
alter table public.event_audit add constraint event_audit_action_check
  check (action in ('create','publish','archive','draft','delete_rsvp','delete_feedback','hide','unhide'));

create function public.set_event_admin_hidden(p_id uuid, p_hidden boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare previous boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'FORBIDDEN'; end if;
  select admin_hidden into previous from public.events where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if previous is distinct from p_hidden then
    update public.events set admin_hidden = p_hidden where id = p_id;
    insert into public.event_audit(event_id, actor_id, action) values (p_id, null, case when p_hidden then 'hide' else 'unhide' end);
  end if;
  return p_hidden;
end $$;
revoke all on function public.set_event_admin_hidden(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_event_admin_hidden(uuid, boolean) to service_role;

commit;
