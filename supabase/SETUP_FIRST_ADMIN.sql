-- EMPRISES — execute only in Supabase SQL Editor (trusted owner session).
-- 1. First invite your own email under Authentication > Users > Invite user.
-- 2. After the invited user exists, replace the placeholder below.
-- 3. Run this script ONLY after applying migrations 001–006.
-- Do not commit an edited version containing personal email addresses.

do $bootstrap$
declare
  v_email text := 'REPLACE_WITH_YOUR_INVITED_EMAIL';
  v_user uuid;
  v_org record;
begin
  if v_email = 'REPLACE_WITH_YOUR_INVITED_EMAIL' then
    raise exception 'Replace the email placeholder with the email of your invited Auth user';
  end if;

  select u.id into v_user from auth.users u where lower(u.email)=lower(v_email);
  if v_user is null then
    raise exception 'Auth user not found. Invite the email under Authentication > Users first';
  end if;

  insert into public.profiles(id) values(v_user) on conflict(id) do nothing;

  for v_org in
    select id, slug from public.organizations where slug in ('rhotor','naldeo')
  loop
    insert into public.memberships(organization_id,user_id,role,active)
    values(v_org.id,v_user,'admin',true)
    on conflict (organization_id,user_id,role)
      do update set active=true;
  end loop;

  if (select count(*) from public.memberships m
      join public.organizations o on o.id=m.organization_id
      where m.user_id=v_user and m.role='admin' and m.active
      and o.slug in ('rhotor','naldeo')) <> 2 then
    raise exception 'Bootstrap failed: both organization admin roles were not assigned';
  end if;
end $bootstrap$;

-- Expected: two rows (one per organization), both role admin and active=true.
-- Replace the placeholder once more if using this SELECT independently:
-- select o.slug,m.role,m.active from public.memberships m
-- join public.organizations o on o.id=m.organization_id
-- join auth.users u on u.id=m.user_id where u.email='REPLACE_WITH_YOUR_INVITED_EMAIL';
