-- Metadata-only reconstruction of the read-only verified Trinkgeld schema.
-- Isolated restore fixture only. No production data or credentials.
CREATE SCHEMA private;
SET search_path=public;
CREATE TABLE public.tip_drafts (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,label text,period_start date,period_end date,input_snapshot jsonb NOT NULL,saved_at timestamp with time zone NOT NULL DEFAULT now(),revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_sync_mutations (mutation_id uuid NOT NULL,workspace_id uuid NOT NULL,device_installation_id uuid NOT NULL,entity_type text NOT NULL,entity_id uuid,applied_at timestamp with time zone NOT NULL DEFAULT now(),result_revision bigint);
CREATE TABLE public.tip_pairing_codes (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,code_hash bytea NOT NULL,active boolean NOT NULL DEFAULT true,max_uses integer NOT NULL DEFAULT 2,use_count integer NOT NULL DEFAULT 0,expires_at timestamp with time zone,created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_workspaces (id uuid NOT NULL DEFAULT gen_random_uuid(),name text NOT NULL,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now(),revision bigint NOT NULL DEFAULT 1);
CREATE TABLE public.tip_workspace_members (workspace_id uuid NOT NULL,user_id uuid NOT NULL,role text NOT NULL DEFAULT 'member'::text,active boolean NOT NULL DEFAULT true,created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_devices (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,user_id uuid NOT NULL,device_installation_id uuid NOT NULL,display_name text,last_seen_at timestamp with time zone,revoked_at timestamp with time zone,revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_staff_members (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,display_name text NOT NULL,aliases text[] NOT NULL DEFAULT '{}'::text[],active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_shift_types (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,code text NOT NULL,early_weight numeric(8,6) NOT NULL,late_weight numeric(8,6) NOT NULL,color text,active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_days (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,business_date date NOT NULL,early_amount numeric(12,2) NOT NULL DEFAULT 0,late_amount numeric(12,2) NOT NULL DEFAULT 0,revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_assignments (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,tip_day_id uuid NOT NULL,staff_member_id uuid NOT NULL,shift_type_id uuid,shift_code_snapshot text,revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_settlements (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,period_start date,period_end date,label text,calculation_version text,input_snapshot jsonb,result jsonb,data_format text NOT NULL DEFAULT 'structured-v1'::text,legacy_id bigint,legacy_html text,source_device_installation_id uuid,saved_at timestamp with time zone NOT NULL DEFAULT now(),revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_settlement_lines (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,settlement_id uuid NOT NULL,line_type text NOT NULL,staff_member_id uuid,display_name text,amount numeric(14,6) NOT NULL,days integer,details jsonb NOT NULL DEFAULT '[]'::jsonb,sort_order integer NOT NULL DEFAULT 0,created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_legacy_snapshots (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,legacy_id bigint,label text,saved_at timestamp with time zone,legacy_html text NOT NULL,source_device_installation_id uuid,source_hash text NOT NULL,data_format text NOT NULL DEFAULT 'legacy-html-v1'::text,created_at timestamp with time zone NOT NULL DEFAULT now());
CREATE TABLE public.tip_migrations (id uuid NOT NULL DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,device_installation_id uuid NOT NULL,source_hash text NOT NULL,status text NOT NULL,summary jsonb NOT NULL DEFAULT '{}'::jsonb,conflict_data jsonb NOT NULL DEFAULT '[]'::jsonb,created_at timestamp with time zone NOT NULL DEFAULT now(),completed_at timestamp with time zone);
CREATE TABLE public.tip_workspace_state (workspace_id uuid NOT NULL,payload jsonb NOT NULL,revision bigint NOT NULL DEFAULT 1,created_at timestamp with time zone NOT NULL DEFAULT now(),updated_at timestamp with time zone NOT NULL DEFAULT now());
ALTER TABLE public."tip_drafts" ADD CONSTRAINT "tip_drafts_period_check" CHECK (((period_start IS NULL) OR (period_end IS NULL) OR (period_start <= period_end)));
ALTER TABLE public."tip_drafts" ADD CONSTRAINT "tip_drafts_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_sync_mutations" ADD CONSTRAINT "tip_sync_mutations_pkey" PRIMARY KEY (mutation_id);
ALTER TABLE public."tip_pairing_codes" ADD CONSTRAINT "tip_pairing_codes_max_uses_check" CHECK ((max_uses > 0));
ALTER TABLE public."tip_pairing_codes" ADD CONSTRAINT "tip_pairing_codes_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_pairing_codes" ADD CONSTRAINT "tip_pairing_codes_use_count_check" CHECK ((use_count >= 0));
ALTER TABLE public."tip_workspaces" ADD CONSTRAINT "tip_workspaces_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_workspace_members" ADD CONSTRAINT "tip_workspace_members_pkey" PRIMARY KEY (workspace_id, user_id);
ALTER TABLE public."tip_workspace_members" ADD CONSTRAINT "tip_workspace_members_role_check" CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'member'::text])));
ALTER TABLE public."tip_devices" ADD CONSTRAINT "tip_devices_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_devices" ADD CONSTRAINT "tip_devices_workspace_id_device_installation_id_key" UNIQUE (workspace_id, device_installation_id);
ALTER TABLE public."tip_staff_members" ADD CONSTRAINT "tip_staff_members_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_shift_types" ADD CONSTRAINT "tip_shift_types_check" CHECK (((early_weight >= (0)::numeric) AND (late_weight >= (0)::numeric) AND (abs(((early_weight + late_weight) - (1)::numeric)) < 0.000001)));
ALTER TABLE public."tip_shift_types" ADD CONSTRAINT "tip_shift_types_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_days" ADD CONSTRAINT "tip_days_check" CHECK (((early_amount >= (0)::numeric) AND (late_amount >= (0)::numeric)));
ALTER TABLE public."tip_days" ADD CONSTRAINT "tip_days_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_days" ADD CONSTRAINT "tip_days_workspace_id_business_date_key" UNIQUE (workspace_id, business_date);
ALTER TABLE public."tip_assignments" ADD CONSTRAINT "tip_assignments_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_assignments" ADD CONSTRAINT "tip_assignments_tip_day_id_staff_member_id_key" UNIQUE (tip_day_id, staff_member_id);
ALTER TABLE public."tip_settlements" ADD CONSTRAINT "tip_settlements_check" CHECK (((period_start IS NULL) OR (period_end IS NULL) OR (period_start <= period_end)));
ALTER TABLE public."tip_settlements" ADD CONSTRAINT "tip_settlements_data_format_check" CHECK ((data_format = ANY (ARRAY['structured-v1'::text, 'legacy-html-v1'::text])));
ALTER TABLE public."tip_settlements" ADD CONSTRAINT "tip_settlements_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_settlement_lines" ADD CONSTRAINT "tip_settlement_lines_line_type_check" CHECK ((line_type = ANY (ARRAY['employee'::text, 'kitchen'::text, 'housekeeping'::text, 'other'::text])));
ALTER TABLE public."tip_settlement_lines" ADD CONSTRAINT "tip_settlement_lines_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_legacy_snapshots" ADD CONSTRAINT "tip_legacy_snapshots_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_legacy_snapshots" ADD CONSTRAINT "tip_legacy_snapshots_workspace_id_source_hash_key" UNIQUE (workspace_id, source_hash);
ALTER TABLE public."tip_migrations" ADD CONSTRAINT "tip_migrations_pkey" PRIMARY KEY (id);
ALTER TABLE public."tip_migrations" ADD CONSTRAINT "tip_migrations_status_check" CHECK ((status = ANY (ARRAY['preview'::text, 'pending'::text, 'completed'::text, 'conflict'::text, 'failed'::text])));
ALTER TABLE public."tip_migrations" ADD CONSTRAINT "tip_migrations_workspace_id_device_installation_id_source_h_key" UNIQUE (workspace_id, device_installation_id, source_hash);
ALTER TABLE public."tip_workspace_state" ADD CONSTRAINT "tip_workspace_state_payload_check" CHECK (((payload ->> 'format'::text) = '2'::text));
ALTER TABLE public."tip_workspace_state" ADD CONSTRAINT "tip_workspace_state_pkey" PRIMARY KEY (workspace_id);
ALTER TABLE public."tip_drafts" ADD CONSTRAINT "tip_drafts_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_sync_mutations" ADD CONSTRAINT "tip_sync_mutations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_pairing_codes" ADD CONSTRAINT "tip_pairing_codes_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_workspace_members" ADD CONSTRAINT "tip_workspace_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."tip_workspace_members" ADD CONSTRAINT "tip_workspace_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_devices" ADD CONSTRAINT "tip_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."tip_devices" ADD CONSTRAINT "tip_devices_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_staff_members" ADD CONSTRAINT "tip_staff_members_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_shift_types" ADD CONSTRAINT "tip_shift_types_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_days" ADD CONSTRAINT "tip_days_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_assignments" ADD CONSTRAINT "tip_assignments_shift_type_id_fkey" FOREIGN KEY (shift_type_id) REFERENCES tip_shift_types(id) ON DELETE SET NULL;
ALTER TABLE public."tip_assignments" ADD CONSTRAINT "tip_assignments_staff_member_id_fkey" FOREIGN KEY (staff_member_id) REFERENCES tip_staff_members(id) ON DELETE RESTRICT;
ALTER TABLE public."tip_assignments" ADD CONSTRAINT "tip_assignments_tip_day_id_fkey" FOREIGN KEY (tip_day_id) REFERENCES tip_days(id) ON DELETE CASCADE;
ALTER TABLE public."tip_assignments" ADD CONSTRAINT "tip_assignments_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_settlements" ADD CONSTRAINT "tip_settlements_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_settlement_lines" ADD CONSTRAINT "tip_settlement_lines_settlement_id_fkey" FOREIGN KEY (settlement_id) REFERENCES tip_settlements(id) ON DELETE CASCADE;
ALTER TABLE public."tip_settlement_lines" ADD CONSTRAINT "tip_settlement_lines_staff_member_id_fkey" FOREIGN KEY (staff_member_id) REFERENCES tip_staff_members(id) ON DELETE SET NULL;
ALTER TABLE public."tip_settlement_lines" ADD CONSTRAINT "tip_settlement_lines_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_legacy_snapshots" ADD CONSTRAINT "tip_legacy_snapshots_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_migrations" ADD CONSTRAINT "tip_migrations_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
ALTER TABLE public."tip_workspace_state" ADD CONSTRAINT "tip_workspace_state_workspace_id_fkey" FOREIGN KEY (workspace_id) REFERENCES tip_workspaces(id) ON DELETE CASCADE;
CREATE INDEX tip_settlement_lines_settlement_idx ON public.tip_settlement_lines USING btree (settlement_id, sort_order);
CREATE INDEX tip_assignments_staff_idx ON public.tip_assignments USING btree (staff_member_id);
CREATE INDEX tip_assignments_workspace_idx ON public.tip_assignments USING btree (workspace_id);
CREATE INDEX tip_sync_mutations_workspace_idx ON public.tip_sync_mutations USING btree (workspace_id, applied_at DESC);
CREATE UNIQUE INDEX tip_staff_members_workspace_name_uq ON public.tip_staff_members USING btree (workspace_id, lower(btrim(display_name)));
CREATE INDEX tip_devices_user_idx ON public.tip_devices USING btree (user_id);
CREATE INDEX tip_settlement_lines_workspace_idx ON public.tip_settlement_lines USING btree (workspace_id);
CREATE INDEX tip_settlement_lines_staff_idx ON public.tip_settlement_lines USING btree (staff_member_id);
CREATE INDEX tip_assignments_shift_idx ON public.tip_assignments USING btree (shift_type_id);
CREATE INDEX tip_workspace_members_user_idx ON public.tip_workspace_members USING btree (user_id);
CREATE INDEX tip_settlements_workspace_idx ON public.tip_settlements USING btree (workspace_id);
CREATE INDEX tip_drafts_workspace_saved_idx ON public.tip_drafts USING btree (workspace_id, saved_at DESC);
CREATE INDEX tip_pairing_codes_workspace_idx ON public.tip_pairing_codes USING btree (workspace_id);
CREATE UNIQUE INDEX tip_shift_types_workspace_code_uq ON public.tip_shift_types USING btree (workspace_id, lower(btrim(code)));
SET check_function_bodies=false;
CREATE OR REPLACE FUNCTION public.tip_create_workspace_state(p_workspace_id uuid, p_payload jsonb, p_legacy_revision text)
 RETURNS SETOF tip_workspace_state
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not private.tip_is_workspace_member(p_workspace_id) then raise exception 'Workspace access denied' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_workspace_id::text,0));
  if public.tip_legacy_revision(p_workspace_id) is distinct from p_legacy_revision then raise exception 'Legacy state changed; retry' using errcode='40001'; end if;
  return query insert into public.tip_workspace_state(workspace_id,payload) values(p_workspace_id,p_payload) returning *;
end; $function$
;
CREATE OR REPLACE FUNCTION private.tip_is_workspace_member(p_workspace_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select exists (
    select 1
    from public.tip_workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = auth.uid()
      and m.active = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.tip_legacy_revision(p_workspace_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
end; $function$
;
CREATE OR REPLACE FUNCTION public.tip_redeem_pairing_code(p_code text, p_device_installation_id uuid, p_device_name text DEFAULT NULL::text)
 RETURNS TABLE(workspace_id uuid, workspace_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid();
  v_code public.tip_pairing_codes%rowtype;
  v_workspace_name text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select pc.*
  into v_code
  from public.tip_pairing_codes pc
  where pc.active = true
    and pc.code_hash = extensions.digest(upper(trim(p_code)), 'sha256'::text)
    and (pc.expires_at is null or pc.expires_at > now())
    and pc.use_count < pc.max_uses
  order by pc.created_at desc
  limit 1
  for update;

  if not found then
    raise exception 'INVALID_OR_EXPIRED_PAIRING_CODE' using errcode = '22023';
  end if;

  insert into public.tip_workspace_members(workspace_id, user_id, role, active)
  values (v_code.workspace_id, v_user_id, 'member', true)
  on conflict (workspace_id, user_id)
  do update set active = true;

  insert into public.tip_devices(
    workspace_id, user_id, device_installation_id, display_name, last_seen_at
  )
  values (
    v_code.workspace_id, v_user_id, p_device_installation_id, nullif(trim(p_device_name), ''), now()
  )
  on conflict (workspace_id, device_installation_id)
  do update set
    user_id = excluded.user_id,
    display_name = coalesce(excluded.display_name, public.tip_devices.display_name),
    last_seen_at = now(),
    revoked_at = null;

  update public.tip_pairing_codes pc
  set use_count = pc.use_count + 1,
      active = case when pc.use_count + 1 >= pc.max_uses then false else pc.active end
  where pc.id = v_code.id;

  select w.name into v_workspace_name
  from public.tip_workspaces w
  where w.id = v_code.workspace_id;

  return query select v_code.workspace_id, v_workspace_name;
end;
$function$
;
CREATE OR REPLACE FUNCTION private.tip_require_current_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.tip_touch_revision()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at := now();
  new.revision := coalesce(old.revision, 0) + 1;
  return new;
end;
$function$
;
SET check_function_bodies=true;
CREATE TRIGGER tip_workspaces_touch BEFORE UPDATE ON public.tip_workspaces FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_devices_touch BEFORE UPDATE ON public.tip_devices FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_staff_members_touch BEFORE UPDATE ON public.tip_staff_members FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_shift_types_touch BEFORE UPDATE ON public.tip_shift_types FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_days_touch BEFORE UPDATE ON public.tip_days FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_assignments_touch BEFORE UPDATE ON public.tip_assignments FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_settlements_touch BEFORE UPDATE ON public.tip_settlements FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_drafts_touch BEFORE UPDATE ON public.tip_drafts FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_workspace_state_touch BEFORE UPDATE ON public.tip_workspace_state FOR EACH ROW EXECUTE FUNCTION tip_touch_revision();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_staff_members FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_shift_types FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_days FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_assignments FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_settlements FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_settlement_lines FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_legacy_snapshots FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
CREATE TRIGGER tip_current_client_guard BEFORE INSERT OR DELETE OR UPDATE ON public.tip_drafts FOR EACH ROW EXECUTE FUNCTION private.tip_require_current_client();
ALTER TABLE "public"."tip_drafts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_drafts" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_drafts" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_drafts" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_drafts" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_drafts" TO "service_role";
ALTER TABLE "public"."tip_sync_mutations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_sync_mutations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_sync_mutations" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_sync_mutations" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_sync_mutations" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_sync_mutations" TO "service_role";
ALTER TABLE "public"."tip_pairing_codes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_pairing_codes" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_pairing_codes" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_pairing_codes" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_pairing_codes" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_pairing_codes" TO "service_role";
ALTER TABLE "public"."tip_workspaces" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_workspaces" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspaces" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspaces" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspaces" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspaces" TO "service_role";
ALTER TABLE "public"."tip_workspace_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_workspace_members" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspace_members" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspace_members" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspace_members" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspace_members" TO "service_role";
ALTER TABLE "public"."tip_devices" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_devices" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_devices" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_devices" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_devices" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_devices" TO "service_role";
ALTER TABLE "public"."tip_staff_members" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_staff_members" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_staff_members" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_staff_members" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_staff_members" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_staff_members" TO "service_role";
ALTER TABLE "public"."tip_shift_types" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_shift_types" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_shift_types" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_shift_types" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_shift_types" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_shift_types" TO "service_role";
ALTER TABLE "public"."tip_days" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_days" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_days" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_days" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_days" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_days" TO "service_role";
ALTER TABLE "public"."tip_assignments" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_assignments" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_assignments" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_assignments" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_assignments" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_assignments" TO "service_role";
ALTER TABLE "public"."tip_settlements" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_settlements" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlements" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlements" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlements" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlements" TO "service_role";
ALTER TABLE "public"."tip_settlement_lines" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_settlement_lines" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlement_lines" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlement_lines" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlement_lines" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_settlement_lines" TO "service_role";
ALTER TABLE "public"."tip_legacy_snapshots" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_legacy_snapshots" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_legacy_snapshots" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_legacy_snapshots" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_legacy_snapshots" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_legacy_snapshots" TO "service_role";
ALTER TABLE "public"."tip_migrations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_migrations" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_migrations" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_migrations" TO "anon";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_migrations" TO "authenticated";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_migrations" TO "service_role";
ALTER TABLE "public"."tip_workspace_state" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "public"."tip_workspace_state" FROM PUBLIC,anon,authenticated,service_role;
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspace_state" TO "postgres";
GRANT INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON TABLE "public"."tip_workspace_state" TO "service_role";
GRANT SELECT ON TABLE "public"."tip_workspace_state" TO "authenticated";
GRANT INSERT ("workspace_id") ON public."tip_workspace_state" TO "authenticated";
GRANT INSERT ("payload") ON public."tip_workspace_state" TO "authenticated";
GRANT UPDATE ("payload") ON public."tip_workspace_state" TO "authenticated";
REVOKE ALL ON FUNCTION "public"."tip_create_workspace_state"(p_workspace_id uuid, p_payload jsonb, p_legacy_revision text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."tip_create_workspace_state"(p_workspace_id uuid, p_payload jsonb, p_legacy_revision text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."tip_create_workspace_state"(p_workspace_id uuid, p_payload jsonb, p_legacy_revision text) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."tip_create_workspace_state"(p_workspace_id uuid, p_payload jsonb, p_legacy_revision text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."tip_create_workspace_state"(p_workspace_id uuid, p_payload jsonb, p_legacy_revision text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."tip_is_workspace_member"(p_workspace_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "private"."tip_is_workspace_member"(p_workspace_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "private"."tip_is_workspace_member"(p_workspace_id uuid) TO "authenticated";
REVOKE ALL ON FUNCTION "public"."tip_legacy_revision"(p_workspace_id uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."tip_legacy_revision"(p_workspace_id uuid) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."tip_legacy_revision"(p_workspace_id uuid) TO "anon";
GRANT EXECUTE ON FUNCTION "public"."tip_legacy_revision"(p_workspace_id uuid) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."tip_legacy_revision"(p_workspace_id uuid) TO "service_role";
REVOKE ALL ON FUNCTION "public"."tip_redeem_pairing_code"(p_code text, p_device_installation_id uuid, p_device_name text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."tip_redeem_pairing_code"(p_code text, p_device_installation_id uuid, p_device_name text) TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."tip_redeem_pairing_code"(p_code text, p_device_installation_id uuid, p_device_name text) TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."tip_redeem_pairing_code"(p_code text, p_device_installation_id uuid, p_device_name text) TO "service_role";
REVOKE ALL ON FUNCTION "private"."tip_require_current_client"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "private"."tip_require_current_client"() TO "postgres";
REVOKE ALL ON FUNCTION "public"."tip_touch_revision"() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION "public"."tip_touch_revision"() TO "postgres";
GRANT EXECUTE ON FUNCTION "public"."tip_touch_revision"() TO "service_role";
GRANT USAGE ON SCHEMA private TO authenticated;
CREATE POLICY "tip_drafts_member_all" ON "public"."tip_drafts" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_sync_mutations_member_all" ON "public"."tip_sync_mutations" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_pairing_codes_deny_all" ON "public"."tip_pairing_codes" AS RESTRICTIVE FOR ALL TO "authenticated" USING (false) WITH CHECK (false);
CREATE POLICY "tip_workspaces_select" ON "public"."tip_workspaces" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.tip_is_workspace_member(id));
CREATE POLICY "tip_members_select" ON "public"."tip_workspace_members" AS PERMISSIVE FOR SELECT TO "authenticated" USING (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_devices_member_all" ON "public"."tip_devices" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_staff_member_all" ON "public"."tip_staff_members" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_shift_member_all" ON "public"."tip_shift_types" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_days_member_all" ON "public"."tip_days" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_assignments_member_all" ON "public"."tip_assignments" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_settlements_member_all" ON "public"."tip_settlements" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_settlement_lines_member_all" ON "public"."tip_settlement_lines" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_legacy_member_all" ON "public"."tip_legacy_snapshots" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_migrations_member_all" ON "public"."tip_migrations" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
CREATE POLICY "tip_workspace_state_member" ON "public"."tip_workspace_state" AS PERMISSIVE FOR ALL TO "authenticated" USING (private.tip_is_workspace_member(workspace_id)) WITH CHECK (private.tip_is_workspace_member(workspace_id));
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;
