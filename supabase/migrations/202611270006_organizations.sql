-- EMPRISES: two separate tenants. Does not grant any user access.
insert into public.organizations(name,slug)
values ('RHOTOR SOLUTIONS','rhotor'),('NALDEO','naldeo')
on conflict (slug) do nothing;

-- Access remains invitation/membership-only. No public signup and no
-- automatic enrollment by email domain.
