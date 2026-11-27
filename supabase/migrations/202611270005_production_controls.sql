-- Secure sensitive columns, protect trash, provide server-side estimate workflow.
-- IMPORTANT: apply only after 001-004 and review on staging first.

-- Restrict mutable columns. A client may not reassign ownership, change org or
-- bypass the privileged archive/trash function using generic table updates.
revoke update on public.affaires from authenticated;
grant update(title,client,commune,description) on public.affaires to authenticated;
revoke delete on public.affaires,public.missions,public.zones,public.documents from authenticated;

-- An operator cannot rewrite quote lines, ownership, or the organization via REST.
revoke insert,update,delete on public.estimate_lines,public.estimates,public.pricing_rules from authenticated;

-- Prevent content change on archived/deleted dossiers, even via directly granted columns.
create or replace function private.prevent_locked_affaire_edits()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.status in ('archivee','supprimee') and
 (new.title,new.client,new.commune,new.description) is distinct from
 (old.title,old.client,old.commune,old.description)
 then raise exception 'Archived or trashed affairs cannot be modified'; end if;
 return new;
end $$;
create trigger prevent_locked_affaire_edits before update on public.affaires
for each row execute function private.prevent_locked_affaire_edits();

-- Mission creation with explicit authorization, one allowed per business decision.
create or replace function public.create_affaire_mission(p_affaire uuid,p_title text default 'Mission drone')
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not private.can_edit_affaire(p_affaire) then raise exception 'Not authorized'; end if;
 if length(trim(p_title))=0 then raise exception 'Mission name required'; end if;
 insert into public.missions(affaire_id,title) values(p_affaire,trim(p_title)) returning id into v_id;
 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(p_affaire,auth.uid(),'mission_created',jsonb_build_object('mission_id',v_id));
 return v_id;
end $$;
revoke all on function public.create_affaire_mission(uuid,text) from public,anon;
grant execute on function public.create_affaire_mission(uuid,text) to authenticated;

-- Delete a zone only when the caller can edit the affair; audit the operation.
create or replace function public.delete_affaire_zone(p_zone uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_affaire uuid;
begin
 select affaire_id into v_affaire from public.zones where id=p_zone;
 if v_affaire is null or not private.can_edit_affaire(v_affaire) then raise exception 'Not authorized'; end if;
 delete from public.zones where id=p_zone;
 insert into public.activity_logs(affaire_id,actor_id,action,details)
 values(v_affaire,auth.uid(),'zone_deleted',jsonb_build_object('zone_id',p_zone));
end $$;
revoke all on function public.delete_affaire_zone(uuid) from public,anon;
grant execute on function public.delete_affaire_zone(uuid) to authenticated;

-- Pricing rules are updated exclusively through admin_publish_pricing.
-- Restrict mission creation/modification to audited RPCs and column-specific grants.
revoke insert,update,delete on public.missions from authenticated;
grant update(title,status,planned_date,performed_at) on public.missions to authenticated;

-- Invitation bootstrap: add membership only via trusted SQL editor/service role.
-- No automatic organization is assigned to new Auth accounts.
