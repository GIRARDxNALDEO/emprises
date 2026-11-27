-- Tarification commerciale des déplacements, configurable par administrateur et organisation.
-- Aucune modification du barème fiscal, des devis existants ou des estimations figées.
create or replace function public.admin_set_km_rate(p_org uuid,p_rate numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.has_org_role(p_org,array['admin']::public.app_role[]) then
  raise exception 'Accès administrateur requis';
 end if;
 if p_rate is null or p_rate<0 or p_rate>10 then
  raise exception 'Tarif kilométrique invalide';
 end if;
 insert into public.app_settings(organization_id,setting_key,setting_value)
 values(p_org,'km_rate_eur',to_jsonb(round(p_rate,3)))
 on conflict(organization_id,setting_key)
 do update set setting_value=excluded.setting_value;
end $$;
revoke all on function public.admin_set_km_rate(uuid,numeric) from public,anon;
grant execute on function public.admin_set_km_rate(uuid,numeric) to authenticated;
