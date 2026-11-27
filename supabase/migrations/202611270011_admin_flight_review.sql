-- EMPRISES : revue technique des demandes et validation directe admin.
-- Prerequis : migration 007 executee. Ne pas executer 007 une seconde fois.
-- Cette migration conserve les affaires et les affectations existantes.
alter table public.affaires
 add column if not exists planned_altitude_m numeric(7,1),
 add column if not exists feasibility text not null default 'a_verifier',
 add column if not exists feasibility_notes text not null default '',
 add column if not exists reviewed_at timestamptz,
 add column if not exists reviewed_by uuid references public.profiles(id);

alter table public.affaires
 add constraint affaires_altitude_positive
 check(planned_altitude_m is null or (planned_altitude_m>0 and planned_altitude_m<=1000));
alter table public.affaires
 add constraint affaires_feasibility_known
 check(feasibility in ('a_verifier','faisable','non_faisable'));

-- A pilot can use an aircraft from the other managed fleet, ONLY if the
-- reviewing administrator is independently admin of the aircraft's organization.
create or replace function public.admin_review_affaire(
 p_affaire uuid,
 p_aircraft uuid,
 p_altitude_m numeric,
 p_feasibility text,
 p_notes text,
 p_approve boolean default false
)
returns void
language plpgsql security definer set search_path=''
as $$
declare
 v_org uuid;
 v_aircraft_org uuid;
 v_status public.affaire_status;
begin
 select organization_id,status into v_org,v_status
 from public.affaires where id=p_affaire for update;
 if v_org is null or not private.has_org_role(v_org,array['admin']::public.app_role[]) then
  raise exception 'Administrateur de l affaire requis';
 end if;
 if v_status not in ('brouillon','a_chiffrer','a_preparer') then
  raise exception 'Le dossier est clos ou archive';
 end if;
 if p_feasibility not in ('a_verifier','faisable','non_faisable') then
  raise exception 'Avis de faisabilite non reconnu';
 end if;
 if p_altitude_m is not null and (p_altitude_m<=0 or p_altitude_m>1000) then
  raise exception 'Altitude hors plage';
 end if;
 if length(coalesce(p_notes,''))>3000 then
  raise exception 'Observations trop longues';
 end if;
 if p_aircraft is not null then
  select organization_id into v_aircraft_org
  from public.aircraft_catalog where id=p_aircraft and active=true;
  if v_aircraft_org is null
    or not private.has_org_role(v_aircraft_org,array['admin']::public.app_role[]) then
   raise exception 'Acces au parc de cet aeronef non autorise';
  end if;
 end if;
 if p_approve then
  if p_feasibility<>'faisable' then raise exception 'Avis faisable requis avant validation'; end if;
  if p_aircraft is null then raise exception 'Un aeronef est requis pour valider'; end if;
  if p_altitude_m is null then raise exception 'Altitude de vol requise pour valider'; end if;
  if not exists(select 1 from public.zones where affaire_id=p_affaire) then
   raise exception 'Ajouter une emprise avant validation';
  end if;
 end if;

 update public.affaires set
  selected_aircraft_id=p_aircraft,
  planned_altitude_m=p_altitude_m,
  feasibility=p_feasibility,
  feasibility_notes=coalesce(trim(p_notes),''),
  reviewed_by=auth.uid(),
  reviewed_at=now(),
  status=case when p_approve then 'a_preparer'::public.affaire_status else status end
 where id=p_affaire;

 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(p_affaire,auth.uid(),
        case when p_approve then 'request_approved' else 'technical_review_saved' end,
        jsonb_build_object('aircraft_id',p_aircraft,'altitude_m',p_altitude_m,
                           'feasibility',p_feasibility,'approved',p_approve));
end $$;
revoke all on function public.admin_review_affaire(uuid,uuid,numeric,text,text,boolean) from public,anon;
grant execute on function public.admin_review_affaire(uuid,uuid,numeric,text,text,boolean) to authenticated;
