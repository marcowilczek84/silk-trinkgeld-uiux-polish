-- One revision protects the complete working state and atomic draft finalization.
-- Legacy records remain intact. A workspace opts in only on its first v2 save.
create table public.tip_workspace_state (
  workspace_id uuid primary key references public.tip_workspaces(id) on delete cascade,
  payload jsonb not null check (payload->>'format' = '2'),
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.tip_workspace_state enable row level security;
create policy tip_workspace_state_member on public.tip_workspace_state for all to authenticated
  using (private.tip_is_workspace_member(workspace_id))
  with check (private.tip_is_workspace_member(workspace_id));
revoke all on public.tip_workspace_state from authenticated;
grant select on public.tip_workspace_state to authenticated;
grant insert (workspace_id,payload), update (payload) on public.tip_workspace_state to authenticated;
revoke all on public.tip_workspace_state from anon;
create trigger tip_workspace_state_touch before update on public.tip_workspace_state
  for each row execute function public.tip_touch_revision();
alter publication supabase_realtime add table public.tip_workspace_state;

-- An already-open legacy client must not silently change the superseded store.
-- Its local data remains available and is reconciled after the app is reloaded.
create function private.tip_require_current_client() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(coalesce(new.workspace_id,old.workspace_id)::text,0));
  if current_user in ('authenticated','anon') and exists (
    select 1 from public.tip_workspace_state where workspace_id = coalesce(new.workspace_id,old.workspace_id)
  ) then
    raise exception 'SILK_UPDATE_REQUIRED: Bitte SILK neu laden. Lokale Eingaben bleiben erhalten.' using errcode = '40001';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.tip_require_current_client() from public;
do $$ declare t text; begin
  foreach t in array array['tip_staff_members','tip_shift_types','tip_days','tip_assignments','tip_settlements','tip_settlement_lines','tip_legacy_snapshots','tip_drafts'] loop
    execute format('create trigger tip_current_client_guard before insert or update or delete on public.%I for each row execute function private.tip_require_current_client()',t);
  end loop;
end $$;

-- Detect any legacy edit between the first read and the atomic handover.
create function public.tip_legacy_revision(p_workspace_id uuid) returns text
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.tip_is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  return md5(jsonb_build_object(
'tip_staff_members',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_staff_members r where r.workspace_id=p_workspace_id),
'tip_shift_types',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_shift_types r where r.workspace_id=p_workspace_id),
'tip_days',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_days r where r.workspace_id=p_workspace_id),
'tip_assignments',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_assignments r where r.workspace_id=p_workspace_id),
'tip_settlements',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_settlements r where r.workspace_id=p_workspace_id),
'tip_settlement_lines',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_settlement_lines r where r.workspace_id=p_workspace_id),
'tip_legacy_snapshots',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_legacy_snapshots r where r.workspace_id=p_workspace_id),
'tip_drafts',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.tip_drafts r where r.workspace_id=p_workspace_id)
  )::text);
end; $$;
revoke all on function public.tip_legacy_revision(uuid) from public;
grant execute on function public.tip_legacy_revision(uuid) to authenticated;

create function public.tip_create_workspace_state(p_workspace_id uuid,p_payload jsonb,p_legacy_revision text)
returns setof public.tip_workspace_state language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or not private.tip_is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,0));
  if public.tip_legacy_revision(p_workspace_id) is distinct from p_legacy_revision then raise exception 'Legacy state changed; retry' using errcode='40001'; end if;
  return query insert into public.tip_workspace_state(workspace_id,payload) values(p_workspace_id,p_payload) returning *;
end; $$;
revoke all on function public.tip_create_workspace_state(uuid,jsonb,text) from public;
grant execute on function public.tip_create_workspace_state(uuid,jsonb,text) to authenticated;
