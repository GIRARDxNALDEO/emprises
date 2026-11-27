-- EMPRISES — Corbeille / suppression définitive sécurisée
-- Appliquer UNE FOIS après les migrations 001 à 007.
-- Attention : suppression IRRÉVERSIBLE, sans restauration possible.
-- Les documents/objets Storage associés empêchent la purge afin d'éviter des
-- fichiers orphelins ou une suppression non contrôlée.

create function private.purge_trashed_affaire(p_affaire uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
 v_org uuid;
 v_status public.affaire_status;
begin
 select a.organization_id,a.status into v_org,v_status
 from public.affaires a where a.id=p_affaire for update;
 if v_org is null then
  raise exception 'Affaire introuvable';
 end if;
 if not private.has_org_role(v_org,array['admin']::public.app_role[]) then
  raise exception 'Accès refusé : administrateur de l’organisation requis';
 end if;
 if v_status <> 'supprimee' then
  raise exception 'Seules les affaires dans la corbeille peuvent être supprimées définitivement';
 end if;
 if exists(select 1 from public.documents d where d.affaire_id=p_affaire)
    or exists(select 1 from storage.objects o
      where o.bucket_id='emprises-private'
      and o.name like p_affaire::text || '/%') then
  raise exception 'Des documents sont encore associés à cette affaire. Leur suppression sécurisée doit être effectuée avant la purge.';
 end if;
 -- estimate_lines are cascade-deleted with the parent estimate
 delete from public.estimates e
  using public.missions m
  where e.mission_id=m.id and m.affaire_id=p_affaire;
 delete from public.activity_logs where affaire_id=p_affaire;
 -- affaire_access, zones, missions, mission_zones: ON DELETE CASCADE
 delete from public.affaires where id=p_affaire;
end $$;
revoke all on function private.purge_trashed_affaire(uuid) from public,anon,authenticated;

create function public.admin_purge_trashed_affaire(p_affaire uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
 perform private.purge_trashed_affaire(p_affaire);
end $$;
revoke all on function public.admin_purge_trashed_affaire(uuid) from public,anon;
grant execute on function public.admin_purge_trashed_affaire(uuid) to authenticated;

-- Purges the trash of ONE specific organization, never both by accident.
-- All operations are atomic: on any failure, no affair is deleted.
create function public.admin_empty_trash(p_org uuid)
returns integer language plpgsql security definer set search_path = ''
as $$
declare v_affaire uuid; v_count integer:=0;
begin
 if not private.has_org_role(p_org,array['admin']::public.app_role[]) then
  raise exception 'Accès refusé : administrateur de l’organisation requis';
 end if;
 for v_affaire in
  select id from public.affaires
  where organization_id=p_org and status='supprimee'
  order by deleted_at nulls last, id
 loop
  perform private.purge_trashed_affaire(v_affaire);
  v_count:=v_count+1;
 end loop;
 return v_count;
end $$;
revoke all on function public.admin_empty_trash(uuid) from public,anon;
grant execute on function public.admin_empty_trash(uuid) to authenticated;
