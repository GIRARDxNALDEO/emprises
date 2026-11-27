-- EMPRISES V2 / RHOTOR SOLUTIONS — Initial schema
-- Deploy to a NEW Supabase project. Review before executing in production.
create schema if not exists extensions;
create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('admin','charge_affaires','telepilote');
create type public.affaire_status as enum ('brouillon','a_chiffrer','a_preparer','en_cours','realisee','archivee','supprimee');
create type public.mission_status as enum ('non_attribuee','attribuee','preparee','planifiee','realisee','cloturee');
create type public.survey_type as enum ('lidar','photogrammetrie');

create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique,
 created_at timestamptz not null default now()
);
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 first_name text not null default '', last_name text not null default '',
 created_at timestamptz not null default now()
);
create table public.memberships (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 role public.app_role not null, active boolean not null default true,
 created_at timestamptz not null default now(),
 primary key(organization_id,user_id,role)
);
create index memberships_user_idx on public.memberships(user_id,organization_id);

create table public.affaires (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 reference text not null, title text not null,
 client text not null default '', commune text not null default '',
 description text not null default '',
 owner_id uuid not null references public.profiles(id),
 status public.affaire_status not null default 'brouillon',
 archived_at timestamptz, deleted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,reference), unique(id,organization_id)
);
create index affaires_org_status_idx on public.affaires(organization_id,status);
create table public.affaire_access (
 affaire_id uuid not null references public.affaires(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 can_edit boolean not null default false,
 primary key(affaire_id,user_id)
);
create table public.zones (
 id uuid primary key default gen_random_uuid(),
 affaire_id uuid not null references public.affaires(id) on delete cascade,
 name text not null,
 survey_type public.survey_type not null default 'lidar',
 geom extensions.geometry(MultiPolygon,4326) not null,
 surface_m2 numeric(16,2) not null default 0,
 color text not null default '#009c99' check(color ~ '^#[0-9A-Fa-f]{6}$'),
 sort_order integer not null default 0,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint zones_valid_geom check (extensions.ST_IsValid(geom) and not extensions.ST_IsEmpty(geom))
);
create index zones_geom_idx on public.zones using gist(geom);
create index zones_affaire_idx on public.zones(affaire_id);
create table public.missions (
 id uuid primary key default gen_random_uuid(),
 affaire_id uuid not null references public.affaires(id) on delete cascade,
 title text not null, telepilote_id uuid references public.profiles(id),
 status public.mission_status not null default 'non_attribuee',
 planned_date date, performed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.mission_zones (
 mission_id uuid not null references public.missions(id) on delete cascade,
 zone_id uuid not null references public.zones(id) on delete cascade,
 primary key (mission_id,zone_id)
);
create table public.pricing_rules (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 version integer not null check(version>0),
 gcp_per_ha numeric(10,3) not null default 4 check(gcp_per_ha>=0),
 min_gcp_per_mission integer not null default 4 check(min_gcp_per_mission>=0),
 lidar_eur_ha numeric(14,2) not null default 0 check(lidar_eur_ha>=0),
 photogrammetrie_eur_ha numeric(14,2) not null default 0 check(photogrammetrie_eur_ha>=0),
 gcp_eur_unit numeric(14,2) not null default 0 check(gcp_eur_unit>=0),
 amene_repli_eur numeric(14,2) not null default 0 check(amene_repli_eur>=0),
 setup_eur numeric(14,2) not null default 0 check(setup_eur>=0),
 processing_eur_ha numeric(14,2) not null default 0 check(processing_eur_ha>=0),
 active boolean not null default false,
 created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(),
 unique(organization_id,version)
);
create unique index one_active_pricing_per_org on public.pricing_rules(organization_id) where active;
create table public.estimates (
 id uuid primary key default gen_random_uuid(),
 mission_id uuid not null references public.missions(id),
 pricing_rule_id uuid not null references public.pricing_rules(id),
 rules_snapshot jsonb not null,
 surface_ha numeric(14,4) not null,
 gcp_count integer not null,
 total_ht numeric(16,2) not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.estimate_lines (
 id uuid primary key default gen_random_uuid(),
 estimate_id uuid not null references public.estimates(id) on delete cascade,
 label text not null, quantity numeric(14,4) not null,
 unit text not null, unit_price numeric(14,2) not null,
 total_ht numeric(16,2) not null,
 sort_order integer not null default 0
);
create table public.documents (
 id uuid primary key default gen_random_uuid(),
 affaire_id uuid not null references public.affaires(id),
 document_type text not null,
 storage_path text not null unique,
 file_name text not null,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table public.document_templates (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 name text not null, logo_storage_path text,
 header_text text not null default '', is_active boolean not null default true,
 created_at timestamptz not null default now()
);
create table public.activity_logs (
 id bigint generated always as identity primary key,
 affaire_id uuid references public.affaires(id),
 actor_id uuid references public.profiles(id),
 action text not null, details jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create table public.app_settings (
 organization_id uuid not null references public.organizations(id),
 setting_key text not null, setting_value jsonb not null,
 primary key(organization_id,setting_key)
);

-- Profiles created automatically when an invited auth user first appears.
create function private.create_profile() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
 insert into public.profiles(id) values(new.id) on conflict(id) do nothing;
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.create_profile();

-- SECURITY DEFINER helpers avoid recursion through memberships RLS.
create function private.has_org_role(p_org uuid, p_roles public.app_role[])
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships m
 where m.organization_id=p_org and m.user_id=(select auth.uid())
 and m.active and m.role=any(p_roles));
$$;
create function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.memberships m where m.organization_id=p_org
 and m.user_id=(select auth.uid()) and m.active);
$$;
create function private.can_read_affaire(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.affaires a where a.id=p_id and
 a.status <> 'supprimee' and
 (private.has_org_role(a.organization_id,array['admin']::public.app_role[])
 or (a.owner_id=(select auth.uid()) and private.is_org_member(a.organization_id))
 or (exists(select 1 from public.affaire_access x where x.affaire_id=a.id and x.user_id=(select auth.uid())) and private.is_org_member(a.organization_id))
 or (exists(select 1 from public.missions m where m.affaire_id=a.id and m.telepilote_id=(select auth.uid())) and private.has_org_role(a.organization_id,array['telepilote']::public.app_role[]))));
$$;
create function private.can_edit_affaire(p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.affaires a where a.id=p_id and a.status not in ('archivee','supprimee') and
 (private.has_org_role(a.organization_id,array['admin']::public.app_role[])
 or (private.has_org_role(a.organization_id,array['charge_affaires']::public.app_role[]) and
 (a.owner_id=(select auth.uid()) or exists(select 1 from public.affaire_access x
 where x.affaire_id=a.id and x.user_id=(select auth.uid()) and x.can_edit)))));
$$;
revoke all on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_org_role(uuid,public.app_role[]) to authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.can_read_affaire(uuid) to authenticated;
grant execute on function private.can_edit_affaire(uuid) to authenticated;

create function private.touch_updated_at() returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end $$;
create trigger touch_affaires before update on public.affaires for each row execute function private.touch_updated_at();
create trigger touch_zones before update on public.zones for each row execute function private.touch_updated_at();
create trigger touch_missions before update on public.missions for each row execute function private.touch_updated_at();
create function private.zone_area() returns trigger language plpgsql set search_path='' as $$
begin
 new.surface_m2=round(extensions.ST_Area(new.geom::extensions.geography)::numeric,2);
 return new;
end $$;
create trigger calculate_zone_area before insert or update of geom on public.zones
for each row execute function private.zone_area();

-- Explicit table privileges: admin-managed tables are read-only from browser.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.organizations,public.memberships,public.profiles,public.affaires,
 public.affaire_access,public.zones,public.missions,public.mission_zones,
 public.pricing_rules,public.estimates,public.estimate_lines,public.documents,
 public.document_templates,public.activity_logs,public.app_settings to authenticated;
grant insert on public.affaires,public.zones,public.missions,public.mission_zones to authenticated;
grant update on public.zones,public.missions to authenticated;
grant delete on public.zones,public.mission_zones to authenticated;
-- Only harmless fields of the core affair record can be edited directly.
grant update(title,client,commune,description) on public.affaires to authenticated;
grant update(first_name,last_name) on public.profiles to authenticated;

-- RLS enabled for every public table.
do $$ declare t text; begin
 foreach t in array array['organizations','profiles','memberships','affaires','affaire_access','zones','missions',
 'mission_zones','pricing_rules','estimates','estimate_lines','documents','document_templates','activity_logs','app_settings']
 loop execute format('alter table public.%I enable row level security',t); end loop; end $$;

create policy org_read on public.organizations for select to authenticated using(private.is_org_member(id));
create policy profile_read on public.profiles for select to authenticated using(
 id=(select auth.uid()) or exists(select 1 from public.memberships m where m.user_id=profiles.id and private.is_org_member(m.organization_id)));
create policy profile_self_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy memberships_read on public.memberships for select to authenticated using(private.is_org_member(organization_id));

create policy affaires_read on public.affaires for select to authenticated using(private.can_read_affaire(id));
create policy affaires_create on public.affaires for insert to authenticated with check(
 owner_id=(select auth.uid()) and private.has_org_role(organization_id,array['admin','charge_affaires']::public.app_role[]) and status='brouillon');
create policy affaires_modify on public.affaires for update to authenticated using(private.can_edit_affaire(id)) with check(private.can_edit_affaire(id));
create policy affaire_access_read on public.affaire_access for select to authenticated using(private.can_read_affaire(affaire_id));

create policy zones_read on public.zones for select to authenticated using(private.can_read_affaire(affaire_id));
create policy zones_insert on public.zones for insert to authenticated with check(private.can_edit_affaire(affaire_id) and created_by=(select auth.uid()));
create policy zones_update on public.zones for update to authenticated using(private.can_edit_affaire(affaire_id)) with check(private.can_edit_affaire(affaire_id));
create policy zones_delete on public.zones for delete to authenticated using(private.can_edit_affaire(affaire_id));
create policy missions_read on public.missions for select to authenticated using(private.can_read_affaire(affaire_id));
create policy missions_create on public.missions for insert to authenticated with check(private.can_edit_affaire(affaire_id));
create policy missions_update on public.missions for update to authenticated using(private.can_edit_affaire(affaire_id)) with check(private.can_edit_affaire(affaire_id));
create policy mz_read on public.mission_zones for select to authenticated using(
 exists(select 1 from public.missions m where m.id=mission_id and private.can_read_affaire(m.affaire_id)));
-- Mission-zone linking is only allowed if both entities belong to the same affair.
create policy mz_insert on public.mission_zones for insert to authenticated with check(
 exists(select 1 from public.missions m join public.zones z on z.affaire_id=m.affaire_id
 where m.id=mission_id and z.id=zone_id and private.can_edit_affaire(m.affaire_id)));
create policy mz_delete on public.mission_zones for delete to authenticated using(
 exists(select 1 from public.missions m where m.id=mission_id and private.can_edit_affaire(m.affaire_id)));
create policy pricing_read on public.pricing_rules for select to authenticated using(private.is_org_member(organization_id));
create policy estimates_read on public.estimates for select to authenticated using(
 exists(select 1 from public.missions m where m.id=mission_id and private.can_read_affaire(m.affaire_id)));
create policy lines_read on public.estimate_lines for select to authenticated using(
 exists(select 1 from public.estimates e join public.missions m on m.id=e.mission_id
 where e.id=estimate_id and private.can_read_affaire(m.affaire_id)));
create policy docs_read on public.documents for select to authenticated using(private.can_read_affaire(affaire_id));
create policy templates_read on public.document_templates for select to authenticated using(private.is_org_member(organization_id));
create policy logs_read on public.activity_logs for select to authenticated using(private.can_read_affaire(affaire_id));
create policy settings_read on public.app_settings for select to authenticated using(private.is_org_member(organization_id));

-- Controlled status transition, protected by privilege check inside the function.
create function public.admin_set_affaire_status(p_affaire uuid,p_status public.affaire_status)
returns void language plpgsql security definer set search_path='' as $$
declare v_org uuid; begin
 select organization_id into v_org from public.affaires where id=p_affaire for update;
 if v_org is null or not private.has_org_role(v_org,array['admin']::public.app_role[]) then
 raise exception 'Not authorized'; end if;
 if p_status not in ('archivee','supprimee','realisee','a_preparer','en_cours','brouillon') then
 raise exception 'Unsupported admin status'; end if;
 update public.affaires set status=p_status,
 archived_at=case when p_status='archivee' then now() else null end,
 deleted_at=case when p_status='supprimee' then now() else null end
 where id=p_affaire;
 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(p_affaire,auth.uid(),'status_change',jsonb_build_object('status',p_status));
end $$;
revoke all on function public.admin_set_affaire_status(uuid,public.affaire_status) from public,anon;
grant execute on function public.admin_set_affaire_status(uuid,public.affaire_status) to authenticated;

-- Controlled geometry writes: frontend supplies GeoJSON, PostGIS validates and measures.
create function public.save_zone(p_affaire uuid,p_name text,p_geojson jsonb,
 p_survey_type public.survey_type default 'lidar',p_zone uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_geom extensions.geometry; v_id uuid; begin
 if not private.can_edit_affaire(p_affaire) then raise exception 'Not authorized'; end if;
 if length(trim(p_name))=0 or length(p_name)>160 then raise exception 'Invalid zone name'; end if;
 v_geom=extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_geojson::text),4326));
 if extensions.ST_GeometryType(v_geom)<>'ST_MultiPolygon' or not extensions.ST_IsValid(v_geom)
 or extensions.ST_IsEmpty(v_geom) then raise exception 'Invalid polygon'; end if;
 if p_zone is null then
  insert into public.zones(affaire_id,name,survey_type,geom,created_by)
  values(p_affaire,trim(p_name),p_survey_type,v_geom,auth.uid()) returning id into v_id;
 else
  update public.zones set name=trim(p_name), survey_type=p_survey_type,geom=v_geom
  where id=p_zone and affaire_id=p_affaire returning id into v_id;
  if v_id is null then raise exception 'Zone not found'; end if;
 end if;
 return v_id;
end $$;
revoke all on function public.save_zone(uuid,text,jsonb,public.survey_type,uuid) from public,anon;
grant execute on function public.save_zone(uuid,text,jsonb,public.survey_type,uuid) to authenticated;

create function public.get_affaire_zones_geojson(p_affaire uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.can_read_affaire(p_affaire) then raise exception 'Not authorized'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',z.id,'name',z.name,'type',z.survey_type,
 'surface_m2',z.surface_m2,'geometry',extensions.ST_AsGeoJSON(z.geom)::jsonb) order by z.sort_order,z.created_at)
 from public.zones z where z.affaire_id=p_affaire),'[]'::jsonb);
end $$;
revoke all on function public.get_affaire_zones_geojson(uuid) from public,anon;
grant execute on function public.get_affaire_zones_geojson(uuid) to authenticated;

-- For safety, direct geometry column updates are not exposed via REST.
revoke insert,update,delete on public.zones from authenticated;
-- direct mission writes remain possible but the UI will not expose permission changes.
