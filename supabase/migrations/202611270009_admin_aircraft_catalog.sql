-- EMPRISES — Gestion du parc aéronefs par administrateur.
-- À exécuter APRÈS la migration 007 (table aircraft_catalog créée).
-- Les droits sont vérifiés par l'organisation et non par le domaine e-mail.
create or replace function public.admin_save_aircraft(
 p_org uuid,
 p_registration text,
 p_model text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
 v_id uuid;
 v_registration text := upper(trim(p_registration));
 v_model text := trim(p_model);
begin
 if not private.has_org_role(p_org,array['admin']::public.app_role[]) then
  raise exception 'Administrator role required for this organization';
 end if;
 if length(v_registration) < 5 or length(v_registration) > 80
    or length(v_model) < 2 or length(v_model) > 160 then
  raise exception 'Invalid aircraft registration or model';
 end if;
 insert into public.aircraft_catalog(organization_id,registration,model,active)
 values(p_org,v_registration,v_model,true)
 on conflict(organization_id,registration)
 do update set model=excluded.model, active=true
 returning id into v_id;
 return v_id;
end $$;
revoke all on function public.admin_save_aircraft(uuid,text,text) from public,anon;
grant execute on function public.admin_save_aircraft(uuid,text,text) to authenticated;

create or replace function public.admin_set_aircraft_active(
 p_aircraft uuid,p_active boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
 select organization_id into v_org from public.aircraft_catalog where id=p_aircraft;
 if v_org is null or not private.has_org_role(v_org,array['admin']::public.app_role[]) then
  raise exception 'Administrator role required for this organization';
 end if;
 update public.aircraft_catalog set active=p_active where id=p_aircraft;
end $$;
revoke all on function public.admin_set_aircraft_active(uuid,boolean) from public,anon;
grant execute on function public.admin_set_aircraft_active(uuid,boolean) to authenticated;
