-- Additional hardening: prevent accidental mutation of immutable quote / zone metadata.
-- Use authenticated RPC save_zone; no client direct writes to zones.
-- Keep mission update restricted to operational fields only; affair/reassignment handled by admin in next lot.
revoke update on public.missions from authenticated;
grant update(title,status,planned_date,performed_at) on public.missions to authenticated;
-- Revoke mission creation by charge d'affaires only if policy will be tightened in later release.
-- Lock membership role management, document templates and estimates at database level.
revoke all on public.memberships from authenticated;
grant select on public.memberships to authenticated;
-- No table-level insert/update on pricing or estimates: only audited SECURITY DEFINER RPC.
revoke insert,update,delete on public.pricing_rules,public.estimates,public.estimate_lines from authenticated;
