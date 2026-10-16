-- C2 RELEASE CANDIDATE, PREPARED ONLY: separate SQL production approval required.
-- Verified in disposable synthetic DB. Apply after v14-integrity and variant-c-postgres only after release checks.
-- No historical backfill. No gate/operator rows are inserted. Real finalization stays locked.
BEGIN;
CREATE TABLE private.tip_c2_gate(workspace_id uuid PRIMARY KEY REFERENCES public.tip_workspaces(id), synthetic_only boolean NOT NULL DEFAULT true, sql_approval_ref text, approved_at timestamptz, CHECK(synthetic_only OR (sql_approval_ref IS NOT NULL AND length(btrim(sql_approval_ref))>=8 AND approved_at IS NOT NULL)));
CREATE TABLE private.tip_c2_operators(workspace_id uuid REFERENCES public.tip_workspaces(id), actor uuid, can_finalize boolean NOT NULL DEFAULT false, can_confirm_cash boolean NOT NULL DEFAULT false, PRIMARY KEY(workspace_id,actor));
CREATE TABLE private.tip_c2_chains(workspace_id uuid REFERENCES public.tip_workspaces(id),root_id text,revision bigint NOT NULL DEFAULT 0,baseline_confirmed boolean NOT NULL DEFAULT false,latest_id text NOT NULL,PRIMARY KEY(workspace_id,root_id));
CREATE TABLE private.tip_c2_cash(workspace_id uuid,root_id text,event_id uuid,recipient_id text,amount_cents bigint NOT NULL CHECK(amount_cents%100=0),kind text NOT NULL CHECK(kind IN ('baseline','payout','refund')),evidence_ref text NOT NULL,confirmed_by uuid NOT NULL,confirmed_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,event_id,recipient_id),FOREIGN KEY(workspace_id,root_id) REFERENCES private.tip_c2_chains(workspace_id,root_id));
CREATE TABLE private.tip_c2_operations(workspace_id uuid REFERENCES public.tip_workspaces(id),request_id uuid,request jsonb NOT NULL,result jsonb NOT NULL,actor uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(workspace_id,request_id));
CREATE UNIQUE INDEX tip_c2_evidence_once ON private.tip_c2_operations(workspace_id,(request->>'evidenceRef')) WHERE request->>'type'='cash';
CREATE UNIQUE INDEX tip_c2_rounding_evidence_once ON private.tip_c2_operations(workspace_id,(btrim(request->'cashEvidence'->>'reference'))) WHERE request->>'type'='finalize' AND request->'cashEvidence'->>'reference' IS NOT NULL;
ALTER TABLE private.tip_c2_gate ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tip_c2_operators ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tip_c2_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tip_c2_cash ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.tip_c2_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tip_c2_gate,private.tip_c2_operators,private.tip_c2_chains,private.tip_c2_cash,private.tip_c2_operations FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.tip_c2_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'SILK_C2_APPEND_ONLY';END $$;
CREATE TRIGGER tip_c2_cash_immutable BEFORE UPDATE OR DELETE ON private.tip_c2_cash FOR EACH ROW EXECUTE FUNCTION private.tip_c2_immutable();
CREATE TRIGGER tip_c2_operations_immutable BEFORE UPDATE OR DELETE ON private.tip_c2_operations FOR EACH ROW EXECUTE FUNCTION private.tip_c2_immutable();
-- No gate rows are created. App builds separately require their explicit release flag.
CREATE FUNCTION private.tip_c2_permissions(w uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('enabled',coalesce(g.workspace_id IS NOT NULL AND (NOT g.synthetic_only OR current_database() ~ '^silk_c2_test_[a-z0-9_]+$' OR position('PGlite' in version())>0),false),
 'syntheticOnly',coalesce(g.synthetic_only,true),'canFinalize',coalesce(o.can_finalize,false),'canConfirmCash',coalesce(o.can_confirm_cash,false))
 FROM (SELECT w AS id) source LEFT JOIN private.tip_c2_gate g ON g.workspace_id=source.id LEFT JOIN private.tip_c2_operators o ON o.workspace_id=source.id AND o.actor=auth.uid();
$$;
CREATE FUNCTION private.tip_c2_authorize(w uuid,operation text) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE permissions jsonb;
BEGIN
 PERFORM private.tip_v14_access(w);permissions:=private.tip_c2_permissions(w);
 IF NOT (permissions->>'enabled')::boolean THEN RAISE EXCEPTION 'SILK_C2_ACCEPTANCE_REQUIRED' USING ERRCODE='42501';END IF;
 IF NOT (permissions->>(CASE WHEN operation='cash' THEN 'canConfirmCash' ELSE 'canFinalize' END))::boolean THEN RAISE EXCEPTION 'SILK_C2_ROLE_REQUIRED' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION private.tip_c2_validate(r public.tip_workspace_state,p_input jsonb) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE period jsonb;firstday date;lastday date;e record;assignments jsonb;
BEGIN
 IF jsonb_typeof(p_input->'byDate') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SILK_INVALID_PERIOD';END IF;
 period:=r.payload->'period';firstday:=(p_input->>'periodStart')::date;lastday:=(p_input->>'periodEnd')::date;
 IF firstday IS NULL OR lastday IS NULL OR lastday<firstday OR lastday-firstday>365 OR (SELECT count(*) FROM jsonb_object_keys(p_input->'byDate'))<>lastday-firstday+1 THEN RAISE EXCEPTION 'SILK_INVALID_PERIOD';END IF;
 IF p_input->>'mode' IS DISTINCT FROM period->>'mode' OR p_input->'staff' IS DISTINCT FROM r.payload->'staff' OR p_input->'shifts' IS DISTINCT FROM r.payload->'shifts' OR coalesce(p_input->'staffLabels','{}') IS DISTINCT FROM coalesce(r.payload->'staffLabels','{}') THEN RAISE EXCEPTION 'SILK_STALE_CALCULATION';END IF;
 IF (CASE WHEN period->>'mode'='day' THEN period->>'singleDate' ELSE period->>'periodStart' END)::date IS DISTINCT FROM firstday OR (CASE WHEN period->>'mode'='day' THEN period->>'singleDate' ELSE period->>'periodEnd' END)::date IS DISTINCT FROM lastday THEN RAISE EXCEPTION 'SILK_STALE_CALCULATION';END IF;
 FOR e IN SELECT key,value FROM jsonb_each(p_input->'byDate') LOOP
  IF e.key::date<firstday OR e.key::date>lastday OR e.key<>to_char(e.key::date,'YYYY-MM-DD') THEN RAISE EXCEPTION 'SILK_INVALID_PERIOD';END IF;
  SELECT coalesce(jsonb_object_agg(v->>'name',v->>'shift'),'{}') INTO assignments FROM jsonb_array_elements(e.value->'assignments') v;
  IF e.value->>'f' IS DISTINCT FROM r.payload->'days'->e.key->>'f' OR e.value->>'s' IS DISTINCT FROM r.payload->'days'->e.key->>'s' OR assignments IS DISTINCT FROM r.payload->'days'->e.key->'assignments' THEN RAISE EXCEPTION 'SILK_STALE_CALCULATION';END IF;
 END LOOP;
END $$;
CREATE FUNCTION private.tip_c2_net(w uuid,root text,target jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE lines jsonb;chain private.tip_c2_chains;
BEGIN
 SELECT * INTO chain FROM private.tip_c2_chains WHERE workspace_id=w AND root_id=root;
 IF NOT FOUND OR NOT chain.baseline_confirmed THEN RAISE EXCEPTION 'SILK_CORRECTION_UNVERIFIED_BASELINE';END IF;
 WITH desired AS (SELECT v->>'id' id,(v->>'payoutCents')::numeric::bigint cents FROM jsonb_array_elements(target->'lines') v), paid AS (SELECT recipient_id id,sum(amount_cents)::bigint cents FROM private.tip_c2_cash WHERE workspace_id=w AND root_id=root GROUP BY recipient_id),delta AS (SELECT coalesce(d.id,p.id) id,coalesce(d.cents,0) desired,coalesce(p.cents,0) paid FROM desired d FULL JOIN paid p USING(id))
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'desiredCents',desired,'previouslyPaidCents',paid,'signedDeltaCents',desired-paid,'additionalDueCents',greatest(0,desired-paid),'overpaidCents',greatest(0,paid-desired)) ORDER BY id),'[]') INTO lines FROM delta;
 RETURN jsonb_build_object('rootFinalId',root,'chainRevision',chain.revision,'previousReceiptId',chain.latest_id,'lines',lines,'additionalDueCents',(SELECT coalesce(sum((v->>'additionalDueCents')::numeric::bigint),0) FROM jsonb_array_elements(lines) v),'overpaidCents',(SELECT coalesce(sum((v->>'overpaidCents')::numeric::bigint),0) FROM jsonb_array_elements(lines) v),'netDeltaCents',(SELECT coalesce(sum((v->>'signedDeltaCents')::numeric::bigint),0) FROM jsonb_array_elements(lines) v),'automaticPayoutAllowed',false);
END $$;
CREATE FUNCTION private.tip_c2_cash_due(payload jsonb,root_id text,net jsonb,finance jsonb) RETURNS bigint LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE previous jsonb;prior bigint:=0;
BEGIN
 IF root_id IS NOT NULL THEN
  previous:=payload->'settlements'->(net->>'previousReceiptId')->'resultData';
  IF previous->>'version'='silk-whole-chf-c-2' THEN
   IF previous->>'cashReconciliationStatus' NOT IN ('not-required','synthetic-confirmed','confirmed') THEN RAISE EXCEPTION 'SILK_CASH_BASELINE_UNVERIFIED';END IF;
   prior:=(previous->>'roundingAdjustmentCents')::numeric::bigint;
  ELSIF (previous->>'inputCents')::numeric IS DISTINCT FROM (previous->>'payoutCents')::numeric OR previous->>'inputCents' IS NULL THEN
   RAISE EXCEPTION 'SILK_CASH_BASELINE_UNVERIFIED';
  END IF;
 END IF;
 RETURN (finance->>'roundingAdjustmentCents')::numeric::bigint-prior;
END $$;
CREATE FUNCTION public.tip_c2_preview(p_workspace_id uuid,p_expected_revision bigint,p_input jsonb,p_root_id text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.tip_workspace_state;candidate jsonb;correction jsonb;root jsonb;
BEGIN
 PERFORM private.tip_v14_access(p_workspace_id);
 SELECT * INTO r FROM public.tip_workspace_state WHERE workspace_id=p_workspace_id;
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'SILK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 PERFORM private.tip_c2_validate(r,p_input);candidate:=private.tip_finance_variant_c_candidate(p_input);
 IF p_root_id IS NOT NULL THEN
  root:=r.payload->'settlements'->p_root_id;
  IF coalesce(root->>'dataFormat','') NOT IN ('final-v3','final-v4-c2') OR root ? 'correctionOf' OR root->>'periodStart' IS DISTINCT FROM p_input->>'periodStart' OR root->>'periodEnd' IS DISTINCT FROM p_input->>'periodEnd' THEN RAISE EXCEPTION 'SILK_C2_INVALID_ROOT';END IF;
  correction:=private.tip_c2_net(p_workspace_id,p_root_id,candidate);
 END IF;
 RETURN jsonb_build_object('revision',r.revision,'candidate',candidate,'netCorrection',correction,'cashReconciliationDueCents',private.tip_c2_cash_due(r.payload,p_root_id,correction,candidate),'permissions',private.tip_c2_permissions(p_workspace_id),'realFinalizationAllowed',(private.tip_c2_permissions(p_workspace_id)->>'enabled')::boolean AND NOT (private.tip_c2_permissions(p_workspace_id)->>'syntheticOnly')::boolean AND (private.tip_c2_permissions(p_workspace_id)->>'canFinalize')::boolean);
END $$;
-- Older clients must not bypass the C2 release gate by calling the V1.4 endpoint.
CREATE OR REPLACE FUNCTION public.tip_finalize_workspace_v14(p_workspace_id uuid,p_expected_revision bigint,p_id uuid,p_input jsonb) RETURNS public.tip_workspace_state LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.tip_v14_access(p_workspace_id);RAISE EXCEPTION 'SILK_C2_ACCEPTANCE_REQUIRED' USING ERRCODE='42501';END $$;
CREATE FUNCTION public.tip_c2_finalize(p_workspace_id uuid,p_expected_revision bigint,p_id uuid,p_input jsonb,p_root_id text DEFAULT NULL,p_chain_revision bigint DEFAULT NULL,p_reason text DEFAULT NULL,p_cash_evidence jsonb DEFAULT NULL) RETURNS public.tip_workspace_state LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.tip_workspace_state;req jsonb;op private.tip_c2_operations;finance jsonb;net jsonb;receipt jsonb;root jsonb;e record;chain private.tip_c2_chains;adjustment bigint;cash jsonb;now_at timestamptz:=clock_timestamp();synthetic boolean;
BEGIN
 PERFORM private.tip_c2_authorize(p_workspace_id,'finalize');
 IF p_id IS NULL THEN RAISE EXCEPTION 'SILK_C2_REQUEST_ID_REQUIRED';END IF;
 SELECT * INTO r FROM public.tip_workspace_state WHERE workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SILK_ADOPTION_REQUIRED';END IF;
 -- Recheck current rights after a potentially blocking lock, including retries.
 PERFORM private.tip_c2_authorize(p_workspace_id,'finalize');
 synthetic:=(private.tip_c2_permissions(p_workspace_id)->>'syntheticOnly')::boolean;
 req:=jsonb_build_object('type','finalize','input',p_input,'rootId',p_root_id,'reason',p_reason,'cashEvidence',p_cash_evidence,'chainRevision',p_chain_revision);
 SELECT * INTO op FROM private.tip_c2_operations WHERE workspace_id=p_workspace_id AND request_id=p_id;
 IF FOUND THEN IF op.request IS DISTINCT FROM req THEN RAISE EXCEPTION 'SILK_IDEMPOTENCY_CONFLICT';END IF;RETURN r;END IF;
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'SILK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 IF r.payload->'settlements' ? p_id::text THEN RAISE EXCEPTION 'SILK_IDEMPOTENCY_CONFLICT';END IF;
 PERFORM private.tip_c2_validate(r,p_input);finance:=private.tip_finance_variant_c_candidate(p_input);
 IF p_root_id IS NOT NULL THEN
  root:=r.payload->'settlements'->p_root_id;
  IF coalesce(root->>'dataFormat','') NOT IN ('final-v3','final-v4-c2') OR root ? 'correctionOf' OR root->>'periodStart' IS DISTINCT FROM p_input->>'periodStart' OR root->>'periodEnd' IS DISTINCT FROM p_input->>'periodEnd' THEN RAISE EXCEPTION 'SILK_C2_INVALID_ROOT';END IF;
  IF length(trim(coalesce(p_reason,'')))<5 THEN RAISE EXCEPTION 'SILK_C2_REASON_REQUIRED';END IF;
  net:=private.tip_c2_net(p_workspace_id,p_root_id,finance);
  IF (net->>'chainRevision')::numeric::bigint IS DISTINCT FROM p_chain_revision THEN RAISE EXCEPTION 'SILK_CORRECTION_STALE_REVISION' USING ERRCODE='40001';END IF;
 ELSE
  FOR e IN SELECT key,value FROM jsonb_each(r.payload->'settlements') LOOP
   IF coalesce(e.value->>'dataFormat','') LIKE 'draft%' THEN CONTINUE;END IF;
   IF e.value->>'periodStart' IS NULL OR e.value->>'periodEnd' IS NULL THEN RAISE EXCEPTION 'SILK_ARCHIVE_COVERAGE_UNKNOWN';END IF;
   IF (p_input->>'periodStart')::date<=(e.value->>'periodEnd')::date AND (p_input->>'periodEnd')::date>=(e.value->>'periodStart')::date THEN RAISE EXCEPTION 'SILK_PERIOD_ALREADY_FINALIZED';END IF;
  END LOOP;
 END IF;
 adjustment:=private.tip_c2_cash_due(r.payload,p_root_id,net,finance);
 -- Reconciliation is explicit evidence on this target, never inferred from the calculated delta.
 IF adjustment<>0 THEN
  IF jsonb_typeof(p_cash_evidence) IS DISTINCT FROM 'object' OR p_cash_evidence->>'adjustmentCents' IS DISTINCT FROM adjustment::text OR length(trim(coalesce(p_cash_evidence->>'reference','')))<5 OR p_cash_evidence->>'kind' IS DISTINCT FROM (CASE WHEN adjustment>0 THEN 'funding' ELSE 'remainder' END) THEN RAISE EXCEPTION 'SILK_CASH_EVIDENCE_REQUIRED';END IF;
  cash:=p_cash_evidence||jsonb_build_object('confirmedBy',auth.uid(),'confirmedAt',now_at,'syntheticOnly',synthetic,'targetAdjustmentCents',finance->'roundingAdjustmentCents');
 ELSE
  IF p_cash_evidence IS NOT NULL THEN RAISE EXCEPTION 'SILK_CASH_EVIDENCE_UNEXPECTED';END IF;cash:=NULL;
 END IF;
 finance:=finance||jsonb_build_object('previewOnly',false,'canFinalize',false,'cashReconciliationStatus',CASE WHEN adjustment=0 THEN 'not-required' WHEN synthetic THEN 'synthetic-confirmed' ELSE 'confirmed' END,'cashReconciliationEvidence',cash,'cashReconciliationDueCents',adjustment);
 receipt:=jsonb_build_object('id',p_id,'dataFormat','final-v4-c2','syntheticOnly',synthetic,'label',(CASE WHEN synthetic THEN 'TEST · ' ELSE '' END)||(p_input->>'periodStart')||' – '||(p_input->>'periodEnd'),'periodStart',p_input->>'periodStart','periodEnd',p_input->>'periodEnd','savedAt',now_at,'finalizedAt',now_at,'finalizedBy',auth.uid(),'serverRevision',r.revision+1,'inputSnapshot',p_input,'resultData',finance,'paymentStatus','not-confirmed','automaticPayoutAllowed',false);
 IF p_root_id IS NOT NULL THEN
  receipt:=receipt||jsonb_build_object('correctionOf',p_root_id,'correctionReason',p_reason,'netCorrection',net);
  UPDATE private.tip_c2_chains SET revision=revision+1,latest_id=p_id::text WHERE workspace_id=p_workspace_id AND root_id=p_root_id;
 ELSE
  INSERT INTO private.tip_c2_chains(workspace_id,root_id,latest_id) VALUES(p_workspace_id,p_id::text,p_id::text);
 END IF;
 UPDATE public.tip_workspace_state SET payload=jsonb_set(jsonb_set(payload,ARRAY['settlements',p_id::text],receipt),'{work}',jsonb_build_object('activeId',p_id,'checkpoint',p_input,'calculation',NULL)) WHERE workspace_id=p_workspace_id RETURNING * INTO r;
 INSERT INTO private.tip_c2_operations VALUES(p_workspace_id,p_id,req,receipt,auth.uid(),now_at);RETURN r;
END $$;
CREATE FUNCTION public.tip_c2_confirm_cash(p_workspace_id uuid,p_expected_revision bigint,p_id uuid,p_root_id text,p_chain_revision bigint,p_receipt_id text,p_kind text,p_lines jsonb,p_evidence_ref text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.tip_workspace_state;root jsonb;target jsonb;chain private.tip_c2_chains;req jsonb;op private.tip_c2_operations;line jsonb;delta jsonb;amount bigint;result jsonb;
BEGIN
 PERFORM private.tip_c2_authorize(p_workspace_id,'cash');
 IF p_id IS NULL OR length(trim(coalesce(p_evidence_ref,'')))<5 OR p_kind IS NULL OR p_kind NOT IN ('baseline','payout','refund') THEN RAISE EXCEPTION 'SILK_C2_INVALID_CASH';END IF;
 SELECT * INTO r FROM public.tip_workspace_state WHERE workspace_id=p_workspace_id FOR UPDATE;
 PERFORM private.tip_c2_authorize(p_workspace_id,'cash');
 req:=jsonb_build_object('type','cash','rootId',p_root_id,'receiptId',p_receipt_id,'kind',p_kind,'lines',p_lines,'evidenceRef',trim(p_evidence_ref),'chainRevision',p_chain_revision);
 SELECT * INTO op FROM private.tip_c2_operations WHERE workspace_id=p_workspace_id AND request_id=p_id;
 IF FOUND THEN IF op.request IS DISTINCT FROM req THEN RAISE EXCEPTION 'SILK_IDEMPOTENCY_CONFLICT';END IF;RETURN op.result;END IF;
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'SILK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 root:=r.payload->'settlements'->p_root_id;
 IF coalesce(root->>'dataFormat','') NOT IN ('final-v3','final-v4-c2') OR root ? 'correctionOf' THEN RAISE EXCEPTION 'SILK_C2_INVALID_ROOT';END IF;
 INSERT INTO private.tip_c2_chains(workspace_id,root_id,latest_id) VALUES(p_workspace_id,p_root_id,p_root_id) ON CONFLICT DO NOTHING;
 SELECT * INTO chain FROM private.tip_c2_chains WHERE workspace_id=p_workspace_id AND root_id=p_root_id;
 IF chain.revision IS DISTINCT FROM p_chain_revision OR chain.latest_id IS DISTINCT FROM p_receipt_id THEN RAISE EXCEPTION 'SILK_CORRECTION_STALE_REVISION' USING ERRCODE='40001';END IF;
 target:=r.payload->'settlements'->chain.latest_id->'resultData';
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)=0 OR (SELECT count(*) FROM jsonb_array_elements(p_lines))<>(SELECT count(DISTINCT v->>'id') FROM jsonb_array_elements(p_lines) v) THEN RAISE EXCEPTION 'SILK_C2_INVALID_CASH';END IF;
 IF p_kind='baseline' THEN
  IF chain.baseline_confirmed THEN RAISE EXCEPTION 'SILK_C2_BASELINE_ALREADY_CONFIRMED';END IF;
  IF (SELECT jsonb_agg(v->>'id' ORDER BY v->>'id') FROM jsonb_array_elements(p_lines) v) IS DISTINCT FROM (SELECT jsonb_agg(v->>'id' ORDER BY v->>'id') FROM jsonb_array_elements(target->'lines') v) THEN RAISE EXCEPTION 'SILK_C2_INCOMPLETE_BASELINE';END IF;
 ELSE
  result:=private.tip_c2_net(p_workspace_id,p_root_id,target);
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF jsonb_typeof(line->'amountCents') IS DISTINCT FROM 'number' OR (line->>'amountCents') !~ '^-?[0-9]+$' OR line->>'id' IS NULL THEN RAISE EXCEPTION 'SILK_C2_INVALID_CASH';END IF;
  amount:=(line->>'amountCents')::numeric::bigint;
  IF abs(amount::numeric)>7320000000 OR amount%100<>0 OR (p_kind IN ('baseline','payout') AND amount<0) OR (p_kind='refund' AND amount>=0) OR (p_kind='payout' AND amount=0) THEN RAISE EXCEPTION 'SILK_C2_INVALID_CASH';END IF;
  IF p_kind<>'baseline' THEN
   SELECT v INTO delta FROM jsonb_array_elements(result->'lines') v WHERE v->>'id'=line->>'id';
   IF delta IS NULL OR (p_kind='payout' AND amount>(delta->>'additionalDueCents')::numeric::bigint) OR (p_kind='refund' AND -amount>(delta->>'overpaidCents')::numeric::bigint) THEN RAISE EXCEPTION 'SILK_C2_CASH_EXCEEDS_NET';END IF;
  END IF;
  INSERT INTO private.tip_c2_cash(workspace_id,root_id,event_id,recipient_id,amount_cents,kind,evidence_ref,confirmed_by) VALUES(p_workspace_id,p_root_id,p_id,line->>'id',amount,p_kind,trim(p_evidence_ref),auth.uid());
 END LOOP;
 UPDATE private.tip_c2_chains SET revision=revision+1,baseline_confirmed=true WHERE workspace_id=p_workspace_id AND root_id=p_root_id;
 result:=private.tip_c2_net(p_workspace_id,p_root_id,target)||jsonb_build_object('syntheticOnly',(private.tip_c2_permissions(p_workspace_id)->>'syntheticOnly')::boolean,'eventId',p_id,'evidenceRef',trim(p_evidence_ref),'confirmedBy',auth.uid());
 INSERT INTO private.tip_c2_operations VALUES(p_workspace_id,p_id,req,result,auth.uid(),clock_timestamp());RETURN result;
END $$;
CREATE FUNCTION public.tip_c2_ledger(p_workspace_id uuid,p_expected_revision bigint,p_root_id text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.tip_workspace_state;root jsonb;chain private.tip_c2_chains;
BEGIN
 PERFORM private.tip_v14_access(p_workspace_id);
 SELECT * INTO r FROM public.tip_workspace_state WHERE workspace_id=p_workspace_id;
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'SILK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 root:=r.payload->'settlements'->p_root_id;
 IF coalesce(root->>'dataFormat','') NOT IN ('final-v3','final-v4-c2') OR root ? 'correctionOf' THEN RAISE EXCEPTION 'SILK_C2_INVALID_ROOT';END IF;
 SELECT * INTO chain FROM private.tip_c2_chains WHERE workspace_id=p_workspace_id AND root_id=p_root_id;
 RETURN jsonb_build_object('permissions',private.tip_c2_permissions(p_workspace_id),'rootFinalId',p_root_id,'revision',r.revision,'chainRevision',coalesce(chain.revision,0),'baselineConfirmed',coalesce(chain.baseline_confirmed,false),'latestReceiptId',coalesce(chain.latest_id,p_root_id),
  'movements',coalesce((SELECT jsonb_agg(jsonb_build_object('eventId',event_id,'recipientId',recipient_id,'amountCents',amount_cents,'kind',kind,'evidenceRef',evidence_ref,'confirmedBy',confirmed_by,'confirmedAt',confirmed_at) ORDER BY confirmed_at,event_id,recipient_id) FROM private.tip_c2_cash WHERE workspace_id=p_workspace_id AND root_id=p_root_id),'[]'::jsonb),
  'confirmations',coalesce((SELECT jsonb_agg(result||jsonb_build_object('confirmedAt',created_at) ORDER BY created_at,request_id) FROM private.tip_c2_operations WHERE workspace_id=p_workspace_id AND request->>'type'='cash' AND request->>'rootId'=p_root_id),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.tip_c2_ledger(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tip_c2_ledger(uuid,bigint,text) TO authenticated;
REVOKE ALL ON FUNCTION private.tip_c2_permissions(uuid),private.tip_c2_immutable(),private.tip_c2_authorize(uuid,text),private.tip_c2_validate(public.tip_workspace_state,jsonb),private.tip_c2_net(uuid,text,jsonb),private.tip_c2_cash_due(jsonb,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tip_c2_preview(uuid,bigint,jsonb,text),public.tip_c2_finalize(uuid,bigint,uuid,jsonb,text,bigint,text,jsonb),public.tip_c2_confirm_cash(uuid,bigint,uuid,text,bigint,text,text,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tip_c2_preview(uuid,bigint,jsonb,text),public.tip_c2_finalize(uuid,bigint,uuid,jsonb,text,bigint,text,jsonb),public.tip_c2_confirm_cash(uuid,bigint,uuid,text,bigint,text,text,jsonb,text) TO authenticated;
COMMIT;
