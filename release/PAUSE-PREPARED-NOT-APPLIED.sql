-- Safe forward rollback after activation. Separate explicit SQL approval required.
-- Keep the compatible candidate app. Do not restore an old database over newer events.
-- Does not remove a single receipt, payment event or revision. Other workspaces untouched.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE public.tip_workspace_state IN SHARE ROW EXCLUSIVE MODE;
CREATE OR REPLACE FUNCTION private.tip_c2_release_pause() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF coalesce(NEW.workspace_id,OLD.workspace_id)='edb875da-fea6-49a0-8e50-e314254752a6'::uuid THEN
  RAISE EXCEPTION 'SILK_ROLLOUT_PAUSED: Eingaben lokal sichern; gemeinsame Speicherung vorübergehend gesperrt.' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.tip_c2_release_pause() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS tip_c2_release_pause ON public.tip_workspace_state;
CREATE TRIGGER tip_c2_release_pause BEFORE INSERT OR UPDATE OR DELETE ON public.tip_workspace_state
FOR EACH ROW
EXECUTE FUNCTION private.tip_c2_release_pause();
DELETE FROM private.tip_c2_gate WHERE workspace_id='edb875da-fea6-49a0-8e50-e314254752a6';
UPDATE private.tip_c2_operators SET can_finalize=false,can_confirm_cash=false WHERE workspace_id='edb875da-fea6-49a0-8e50-e314254752a6';
COMMIT;
