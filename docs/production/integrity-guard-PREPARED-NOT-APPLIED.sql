-- PREPARED ONLY. Never run without Marco's explicit database/rollout approval.
-- Scoped to the verified Restaurant Silk workspace; other applications/workspaces are untouched.
-- Existing payloads are NOT rewritten. The trigger runs only on future client writes.
BEGIN;
CREATE OR REPLACE FUNCTION private.tip_integrity_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  headers jsonb := coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
  record_entry record;
  day_entry record;
  assignment_entry record;
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF TG_ARGV[0] = 'paused' THEN
    RAISE EXCEPTION 'SILK_ROLLOUT_PAUSED: Shared writes are paused; preserve local inputs.' USING ERRCODE='55000';
  END IF;
  IF headers->>'x-silk-client-protocol' IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'SILK_UPDATE_REQUIRED: Reload the compatible SILK client; preserve local inputs.' USING ERRCODE='42501';
  END IF;
  IF NEW.payload->>'format' IS DISTINCT FROM '2'
    OR jsonb_typeof(NEW.payload->'period') IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.payload->'days') IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.payload->'staff') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.payload->'staffLabels') IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.payload->'shifts') IS DISTINCT FROM 'array'
    OR jsonb_typeof(NEW.payload->'settlements') IS DISTINCT FROM 'object'
    OR jsonb_typeof(NEW.payload->'work') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SILK_INVALID_DOCUMENT: Invalid document shape.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'staff') v WHERE jsonb_typeof(v) <> 'string' OR v#>>'{}' = '')
    OR (SELECT count(*) FROM jsonb_array_elements(NEW.payload->'staff')) <> (SELECT count(DISTINCT v) FROM jsonb_array_elements(NEW.payload->'staff') v)
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'shifts') v WHERE jsonb_typeof(v->'name') IS DISTINCT FROM 'string' OR v->>'name'='')
    OR (SELECT count(*) FROM jsonb_array_elements(NEW.payload->'shifts')) <> (SELECT count(DISTINCT v->>'name') FROM jsonb_array_elements(NEW.payload->'shifts') v) THEN
    RAISE EXCEPTION 'SILK_INVALID_DOCUMENT: Invalid or duplicate identity.' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' THEN
    FOR record_entry IN SELECT key,value FROM jsonb_each(coalesce(OLD.payload->'settlements','{}')) LOOP
      IF coalesce(record_entry.value->>'dataFormat','') NOT LIKE 'draft%'
        AND (NEW.payload->'settlements'->record_entry.key) IS DISTINCT FROM record_entry.value THEN
        RAISE EXCEPTION 'SILK_ARCHIVE_PROTECTED: Existing archived results cannot be changed or deleted.' USING ERRCODE='42501';
      END IF;
    END LOOP;
  END IF;
  FOR day_entry IN SELECT key,value FROM jsonb_each(NEW.payload->'days') LOOP
    IF jsonb_typeof(day_entry.value->'assignments') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'SILK_INVALID_DOCUMENT: Invalid assignments.' USING ERRCODE='23514';
    END IF;
    FOR assignment_entry IN SELECT key,value FROM jsonb_each_text(day_entry.value->'assignments') LOOP
      -- Preserve unresolved legacy references verbatim; never create a new dangling reference.
      IF TG_OP='UPDATE' AND OLD.payload->'days'->day_entry.key->'assignments'->>assignment_entry.key = assignment_entry.value
        AND (OLD.payload->'staff' ? assignment_entry.key) = (NEW.payload->'staff' ? assignment_entry.key)
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(OLD.payload->'shifts') v WHERE v->>'name'=assignment_entry.value)
          = EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.payload->'shifts') v WHERE v->>'name'=assignment_entry.value) THEN CONTINUE; END IF;
      IF NOT (NEW.payload->'staff' ? assignment_entry.key) OR NOT EXISTS
        (SELECT 1 FROM jsonb_array_elements(NEW.payload->'shifts') v WHERE v->>'name'=assignment_entry.value) THEN
        RAISE EXCEPTION 'SILK_INVALID_DOCUMENT: New assignment has an unknown identity.' USING ERRCODE='23514';
      END IF;
    END LOOP;
  END LOOP;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.tip_integrity_write_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS tip_integrity_write_guard ON public.tip_workspace_state;
CREATE TRIGGER tip_integrity_write_guard BEFORE INSERT OR UPDATE OF payload ON public.tip_workspace_state
FOR EACH ROW WHEN (NEW.workspace_id='edb875da-fea6-49a0-8e50-e314254752a6'::uuid)
EXECUTE FUNCTION private.tip_integrity_write_guard('active');
COMMIT;
-- Maintenance pause: recreate ONLY this trigger with argument 'paused', same WHEN condition.
-- Safe rollback: keep protocol-3 guard and restore a tested protocol-3 client build.
-- Do not remove the guard or restore an old data snapshot after newer entries were saved.
