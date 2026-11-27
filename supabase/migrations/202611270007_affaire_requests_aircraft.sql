-- EMPRISES: submission -> admin validation + aircraft assignment
-- Apply ONCE after migrations 001-006. Review in staging before production.

create table public.aircraft_catalog (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 registration text not null,
 model text not null,
 active boolean not null default true,
 unique(organization_id,registration)
);
create index aircraft_catalog_org_idx on public.aircraft_catalog(organization_id);
alter table public.aircraft_catalog enable row level security;
revoke all on public.aircraft_catalog from anon, authenticated;
grant select on public.aircraft_catalog to authenticated;
create policy aircraft_catalog_read on public.aircraft_catalog for select to authenticated
 using(private.is_org_member(organization_id));

insert into public.aircraft_catalog(organization_id,registration,model)
select o.id,v.registration,v.model from public.organizations o
join (values
 ('rhotor','UAS-FR-372350','DJI Avata'),
 ('rhotor','UAS-FR-307814','DJI Matrice 300 RTK'),
 ('rhotor','UAS-FR-302496','DJI Mavic 2 Pro'),
 ('rhotor','UAS-FR-477723','DJI Mavic 3 Pro'),
 ('rhotor','UAS-FR-355706','DJI Mavic 3E'),
 ('rhotor','UAS-FR-377968','flying eye Mavic 3 Pro Flysafe'),
 ('naldeo','UAS-FR-307814','DJI Matrice 300 RTK'),
 ('naldeo','UAS-FR-477723','DJI Mavic 3 Pro'),
 ('naldeo','UAS-FR-399722','DJI Mavic 3T'),
 ('naldeo','UAS-FR-305622','DJI Phantom 4 RTK'),
 ('naldeo','UAS-FR-377968','flying eye Mavic 3 Pro Flysafe')
) as v(slug,registration,model) on o.slug=v.slug
on conflict(organization_id,registration) do nothing;

alter table public.affaires
 add column selected_aircraft_id uuid references public.aircraft_catalog(id);

-- A request is submitted only after at least one polygon has been saved.
create function public.submit_affaire_request(p_affaire uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_status public.affaire_status;
begin
 select a.organization_id,a.status into v_org,v_status
 from public.affaires a where a.id=p_affaire for update;
 if v_org is null or not private.can_edit_affaire(p_affaire)
 then raise exception 'Not authorized'; end if;
 if v_status <> 'brouillon' then raise exception 'Only draft affairs can be submitted'; end if;
 if not exists(select 1 from public.zones z where z.affaire_id=p_affaire)
 then raise exception 'Add at least one zone before submitting'; end if;
 update public.affaires set status='a_chiffrer' where id=p_affaire;
 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(p_affaire,auth.uid(),'request_submitted','{}'::jsonb);
end $$;
revoke all on function public.submit_affaire_request(uuid) from public,anon;
grant execute on function public.submit_affaire_request(uuid) to authenticated;

-- Only a member with administrator role IN THAT ORGANIZATION can assign a
-- catalogued aircraft and approve a submitted request.
create function public.admin_validate_affaire(p_affaire uuid,p_aircraft uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid;v_status public.affaire_status;
begin
 select organization_id,status into v_org,v_status
 from public.affaires where id=p_affaire for update;
 if v_org is null or not private.has_org_role(v_org,array['admin']::public.app_role[])
 then raise exception 'Administrator role required'; end if;
 if v_status <> 'a_chiffrer' then raise exception 'Request is not awaiting approval'; end if;
 if not exists(select 1 from public.aircraft_catalog c where c.id=p_aircraft
   and c.organization_id=v_org and c.active)
 then raise exception 'Aircraft does not belong to this organization'; end if;
 update public.affaires set selected_aircraft_id=p_aircraft,status='a_preparer'
 where id=p_affaire;
 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(p_affaire,auth.uid(),'request_approved',jsonb_build_object('aircraft_id',p_aircraft));
end $$;
revoke all on function public.admin_validate_affaire(uuid,uuid) from public,anon;
grant execute on function public.admin_validate_affaire(uuid,uuid) to authenticated;

-- The selected aircraft is deliberately NOT granted for direct client updates.
revoke update on public.affaires from authenticated;
grant update(title,client,commune,description) on public.affaires to authenticated;
