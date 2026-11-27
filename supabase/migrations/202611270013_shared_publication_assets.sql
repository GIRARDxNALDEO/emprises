-- EMPRISES : fichiers de communication communs a tous les collaborateurs.
-- Les images de communication (photo de couverture et logos) sont volontairement publiques.
-- Les documents des affaires restent dans le bucket PRIVE emprises-private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('emprises-brand-assets','emprises-brand-assets',true,15728640,
       array['image/png','image/jpeg','image/webp']::text[])
on conflict(id) do update set public=true,file_size_limit=15728640,
  allowed_mime_types=array['image/png','image/jpeg','image/webp']::text[];

-- L'enregistrement des visuels communs est reserve aux administrateurs
-- des organisations. Aucun collaborateur non-administrateur ne peut les modifier.
create policy emprises_brand_assets_admin_insert
on storage.objects for insert to authenticated
with check(
 bucket_id='emprises-brand-assets'
 and name in ('cover/illiwap-cover','logos/naldeo-logo','logos/rhotor-logo')
 and exists (
   select 1 from public.memberships m
   where m.user_id=(select auth.uid()) and m.active=true and m.role='admin'
 )
);
create policy emprises_brand_assets_admin_update
on storage.objects for update to authenticated
using(
 bucket_id='emprises-brand-assets'
 and name in ('cover/illiwap-cover','logos/naldeo-logo','logos/rhotor-logo')
 and exists (
   select 1 from public.memberships m
   where m.user_id=(select auth.uid()) and m.active=true and m.role='admin'
 )
)
with check(
 bucket_id='emprises-brand-assets'
 and name in ('cover/illiwap-cover','logos/naldeo-logo','logos/rhotor-logo')
 and exists (
   select 1 from public.memberships m
   where m.user_id=(select auth.uid()) and m.active=true and m.role='admin'
 )
);
-- Necessaire a l'operation upsert de Supabase Storage. Les images
-- sont de toute facon publiques car il s'agit uniquement de logos/photos marketing.
create policy emprises_brand_assets_read
on storage.objects for select to authenticated
using(bucket_id='emprises-brand-assets');
