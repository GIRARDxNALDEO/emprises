-- Versioned pricing, safe server-side estimate generation, private file storage.
create function public.admin_publish_pricing(
 p_org uuid,p_gcp_per_ha numeric,p_min_gcp integer,p_lidar numeric,p_photo numeric,
 p_gcp_unit numeric,p_mobilisation numeric,p_setup numeric,p_processing numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_version integer; begin
 if not private.has_org_role(p_org,array['admin']::public.app_role[]) then raise exception 'Not authorized'; end if;
 if least(p_gcp_per_ha,p_min_gcp,p_lidar,p_photo,p_gcp_unit,p_mobilisation,p_setup,p_processing)<0
 then raise exception 'Negative price/rule'; end if;
 perform pg_advisory_xact_lock(hashtext(p_org::text));
 select coalesce(max(version),0)+1 into v_version from public.pricing_rules where organization_id=p_org;
 update public.pricing_rules set active=false where organization_id=p_org and active;
 insert into public.pricing_rules(organization_id,version,gcp_per_ha,min_gcp_per_mission,
 lidar_eur_ha,photogrammetrie_eur_ha,gcp_eur_unit,amene_repli_eur,setup_eur,processing_eur_ha,active,created_by)
 values(p_org,v_version,p_gcp_per_ha,p_min_gcp,p_lidar,p_photo,p_gcp_unit,
 p_mobilisation,p_setup,p_processing,true,auth.uid()) returning id into v_id;
 return v_id;
end $$;
revoke all on function public.admin_publish_pricing(uuid,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric) from public,anon;
grant execute on function public.admin_publish_pricing(uuid,numeric,integer,numeric,numeric,numeric,numeric,numeric,numeric) to authenticated;

-- One estimate per mission execution. Geometry UNION per acquisition type prevents
-- counting overlapping polygons twice within the same method.
create function public.create_mission_estimate(p_mission uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
 v_affaire uuid; v_org uuid; v_pr public.pricing_rules%rowtype;
 v_lidar_ha numeric:=0; v_photo_ha numeric:=0; v_area numeric:=0;
 v_gcp integer; v_id uuid; v_total numeric; v_count integer;
begin
 select m.affaire_id,a.organization_id into v_affaire,v_org
 from public.missions m join public.affaires a on a.id=m.affaire_id where m.id=p_mission;
 if v_org is null or not private.can_edit_affaire(v_affaire) then raise exception 'Not authorized'; end if;
 select * into v_pr from public.pricing_rules where organization_id=v_org and active;
 if v_pr.id is null then raise exception 'No active pricing rule'; end if;
 select count(*) into v_count from public.mission_zones where mission_id=p_mission;
 select coalesce(sum(hectares) filter(where survey_type='lidar'),0),
 coalesce(sum(hectares) filter(where survey_type='photogrammetrie'),0)
 into v_lidar_ha,v_photo_ha
 from (
  select z.survey_type,
    extensions.ST_Area(extensions.ST_UnaryUnion(extensions.ST_Collect(z.geom))::extensions.geography)::numeric/10000 as hectares
  from public.zones z
  where z.affaire_id=v_affaire and (v_count=0 or exists(
    select 1 from public.mission_zones mz where mz.mission_id=p_mission and mz.zone_id=z.id))
  group by z.survey_type
 ) x;
 v_area:=v_lidar_ha+v_photo_ha;
 if v_area<=0 then raise exception 'Mission has no zones'; end if;
 v_gcp:=greatest(ceil(v_area*v_pr.gcp_per_ha)::integer,v_pr.min_gcp_per_mission);
 v_total:=round(v_lidar_ha*v_pr.lidar_eur_ha +v_photo_ha*v_pr.photogrammetrie_eur_ha+
 v_gcp*v_pr.gcp_eur_unit+v_pr.amene_repli_eur+v_pr.setup_eur+v_area*v_pr.processing_eur_ha,2);
 insert into public.estimates(mission_id,pricing_rule_id,rules_snapshot,surface_ha,gcp_count,total_ht,created_by)
 values(p_mission,v_pr.id,to_jsonb(v_pr),round(v_area,4),v_gcp,v_total,auth.uid()) returning id into v_id;
 insert into public.estimate_lines(estimate_id,label,quantity,unit,unit_price,total_ht,sort_order) values
 (v_id,'Leve LiDAR',round(v_lidar_ha,4),'ha',v_pr.lidar_eur_ha,round(v_lidar_ha*v_pr.lidar_eur_ha,2),1),
 (v_id,'Photogrammetrie',round(v_photo_ha,4),'ha',v_pr.photogrammetrie_eur_ha,round(v_photo_ha*v_pr.photogrammetrie_eur_ha,2),2),
 (v_id,'Points GCP',v_gcp,'point',v_pr.gcp_eur_unit,v_gcp*v_pr.gcp_eur_unit,3),
 (v_id,'Amene / repli',1,'forfait',v_pr.amene_repli_eur,v_pr.amene_repli_eur,4),
 (v_id,'Mise en place',1,'forfait',v_pr.setup_eur,v_pr.setup_eur,5),
 (v_id,'Traitement',round(v_area,4),'ha',v_pr.processing_eur_ha,round(v_area*v_pr.processing_eur_ha,2),6);
 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(v_affaire,auth.uid(),'estimate_created',jsonb_build_object('estimate_id',v_id,'total_ht',v_total));
 return v_id;
end $$;
revoke all on function public.create_mission_estimate(uuid) from public,anon;
grant execute on function public.create_mission_estimate(uuid) to authenticated;

-- Private bucket. Object paths must start with affaire UUID, e.g. <affaire_id>/prefecture/file.pdf.
insert into storage.buckets(id,name,public,file_size_limit)
values('emprises-private','emprises-private',false,52428800)
on conflict(id) do nothing;
create policy emprises_storage_read on storage.objects for select to authenticated
using(bucket_id='emprises-private' and
 case when split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then private.can_read_affaire((split_part(name,'/',1))::uuid) else false end);
-- Uploads only via a controlled server function or server endpoint in a later lot.
-- No browser write or delete policy on storage.objects deliberately.

-- Do not enable self sign-up in dashboard; Auth invitation must be admin initiated.
-- Important: no user is granted membership automatically. Seed org/roles after invite.
