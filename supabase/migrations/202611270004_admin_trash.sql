-- Allow administrators to view and restore soft-deleted affairs. Non-admin users
-- still cannot see items in the trash.
create or replace function private.can_read_affaire(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.affaires a where a.id=p_id and
 (private.has_org_role(a.organization_id,array['admin']::public.app_role[])
 or (a.status <> 'supprimee' and
 ( (a.owner_id=(select auth.uid()) and private.is_org_member(a.organization_id))
 or (exists(select 1 from public.affaire_access x where x.affaire_id=a.id and x.user_id=(select auth.uid())) and private.is_org_member(a.organization_id))
 or (exists(select 1 from public.missions m where m.affaire_id=a.id and m.telepilote_id=(select auth.uid())) and private.has_org_role(a.organization_id,array['telepilote']::public.app_role[])) ))));
$$;
revoke all on function private.can_read_affaire(uuid) from public,anon;
grant execute on function private.can_read_affaire(uuid) to authenticated;
