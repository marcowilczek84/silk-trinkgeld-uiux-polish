-- V1.4 PREPARED ONLY. Explicit production database approval required.
-- No UPDATE/backfill of existing records. Apply only after backup and staging acceptance.
BEGIN;
CREATE TABLE IF NOT EXISTS private.tip_workspace_events_v14(
 workspace_id uuid NOT NULL REFERENCES public.tip_workspaces(id),
 revision bigint NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 actor uuid, changes jsonb NOT NULL, PRIMARY KEY(workspace_id,revision)
);
ALTER TABLE private.tip_workspace_events_v14 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.tip_workspace_events_v14 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.tip_v14_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE section text;k text;changes jsonb:='[]';before_value jsonb;after_value jsonb;
BEGIN
 IF NEW.workspace_id<>'edb875da-fea6-49a0-8e50-e314254752a6'::uuid THEN RETURN NEW;END IF;
 FOREACH section IN ARRAY ARRAY['days','settlements'] LOOP
  FOR k IN SELECT jsonb_object_keys(coalesce(OLD.payload->section,'{}')||coalesce(NEW.payload->section,'{}')) LOOP
   before_value:=OLD.payload->section->k;after_value:=NEW.payload->section->k;
   IF before_value IS DISTINCT FROM after_value THEN changes:=changes||jsonb_build_array(jsonb_build_object('path',jsonb_build_array(section,k),'before',before_value,'after',after_value));END IF;
  END LOOP;
 END LOOP;
 FOREACH section IN ARRAY ARRAY['staff','staffLabels','shifts','period'] LOOP
  IF OLD.payload->section IS DISTINCT FROM NEW.payload->section THEN changes:=changes||jsonb_build_array(jsonb_build_object('path',jsonb_build_array(section),'before',OLD.payload->section,'after',NEW.payload->section));END IF;
 END LOOP;
 INSERT INTO private.tip_workspace_events_v14(workspace_id,revision,actor,changes) VALUES(NEW.workspace_id,NEW.revision,auth.uid(),changes);RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.tip_v14_log() FROM PUBLIC;
DROP TRIGGER IF EXISTS tip_v14_log ON public.tip_workspace_state;
CREATE TRIGGER tip_v14_log AFTER UPDATE ON public.tip_workspace_state FOR EACH ROW EXECUTE FUNCTION private.tip_v14_log();
-- Exact rational arithmetic: numeric values below are integers, never approximate division.
CREATE OR REPLACE FUNCTION private.tip_rat(n numeric,d numeric DEFAULT 1) RETURNS numeric[]
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a numeric:=abs(n); b numeric:=d; t numeric;
BEGIN
 IF d<=0 OR n<>trunc(n) OR d<>trunc(d) THEN RAISE EXCEPTION 'SILK_INVALID_RATIONAL'; END IF;
 WHILE b<>0 LOOP t:=mod(a,b);a:=b;b:=t;END LOOP;
 RETURN ARRAY[div(n,a),div(d,a)];
END $$;
CREATE OR REPLACE FUNCTION private.tip_radd(a numeric[],b numeric[]) RETURNS numeric[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT private.tip_rat(a[1]*b[2]+b[1]*a[2],a[2]*b[2])$$;
CREATE OR REPLACE FUNCTION private.tip_rsub(a numeric[],b numeric[]) RETURNS numeric[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT private.tip_radd(a,ARRAY[-b[1],b[2]])$$;
CREATE OR REPLACE FUNCTION private.tip_rmul(a numeric[],b numeric[]) RETURNS numeric[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT private.tip_rat(a[1]*b[1],a[2]*b[2])$$;
CREATE OR REPLACE FUNCTION private.tip_rdiv(a numeric[],b numeric[]) RETURNS numeric[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT private.tip_rmul(a,ARRAY[b[2],b[1]])$$;
CREATE OR REPLACE FUNCTION private.tip_rmin(a numeric[],b numeric[]) RETURNS numeric[] LANGUAGE sql IMMUTABLE SET search_path='' AS $$SELECT CASE WHEN a[1]*b[2]<b[1]*a[2] THEN a ELSE b END$$;
CREATE OR REPLACE FUNCTION private.tip_factor(v text) RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE d numeric;
BEGIN IF v IS NULL OR v !~ '^\d+(\.\d{1,8})?$' THEN RAISE EXCEPTION 'SILK_INVALID_FACTOR'; END IF;
 d:=power(10::numeric,CASE WHEN position('.' in v)>0 THEN length(split_part(v,'.',2)) ELSE 0 END);
 RETURN private.tip_rat(v::numeric*d,d);END $$;
CREATE OR REPLACE FUNCTION private.tip_cents(v text) RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN IF v IS NULL OR v !~ '^\d+(\.\d{1,2})?$' OR v::numeric>100000 THEN RAISE EXCEPTION 'SILK_INVALID_AMOUNT'; END IF;RETURN v::numeric*100;END $$;
CREATE OR REPLACE FUNCTION private.tip_add_claim(accounts jsonb,id text,name text,claim numeric[],day text DEFAULT NULL,shift text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE a jsonb:=coalesce(accounts->id,jsonb_build_object('id',id,'name',name,'n','0','d','1'));r numeric[];
BEGIN r:=private.tip_radd(ARRAY[(a->>'n')::numeric,(a->>'d')::numeric],claim);
 a:=a||jsonb_build_object('n',r[1]::text,'d',r[2]::text);
 IF day IS NOT NULL THEN a:=a||jsonb_build_object('days',coalesce((a->>'days')::integer,0)+1,'details',coalesce(a->'details','[]')||jsonb_build_array(day||' · '||shift));END IF;
 RETURN jsonb_set(accounts,ARRAY[id],a);END $$;
CREATE OR REPLACE FUNCTION private.tip_finance(input jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE sh jsonb:='{}';ac jsonb:='{}';day record;p jsonb;q jsonb;entry record;f numeric;s numeric;total numeric:=0;candidate numeric:=0;
 ef numeric[];es numeric[];wf numeric[];ws numeric[];cap numeric[];a numeric[];b numeric[];rest numeric[];extra numeric[];claim numeric[];pay numeric;lines jsonb:='[]';line jsonb;
BEGIN
 FOR q IN SELECT value FROM jsonb_array_elements(input->'shifts') LOOP
  a:=private.tip_factor(q->>'f');b:=private.tip_factor(q->>'s');
  IF private.tip_radd(a,b)<>ARRAY[1,1]::numeric[] THEN RAISE EXCEPTION 'SILK_INVALID_FACTOR';END IF;
  sh:=jsonb_set(sh,ARRAY[q->>'name'],jsonb_build_object('f',to_jsonb(a),'s',to_jsonb(b)));
 END LOOP;
 FOR day IN SELECT key,value FROM jsonb_each(input->'byDate') ORDER BY key LOOP
  f:=private.tip_cents(day.value->>'f');s:=private.tip_cents(day.value->>'s');total:=total+f+s;
  ef:=private.tip_rat(f*273,400);es:=private.tip_rat(s*273,400);
  ac:=private.tip_add_claim(ac,'kitchen','Küche gesamt',private.tip_rat((f+s)*117,400));
  ac:=private.tip_add_claim(ac,'housekeeping','Housekeeping gesamt',private.tip_rat(f+s,40));
  IF (SELECT count(*) FROM jsonb_array_elements(day.value->'assignments'))<>(SELECT count(DISTINCT v->>'name') FROM jsonb_array_elements(day.value->'assignments') v) THEN RAISE EXCEPTION 'SILK_DUPLICATE_ASSIGNMENT';END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(day.value->'assignments') LOOP
   IF NOT (input->'staff' ? (p->>'name')) OR NOT(sh ? (p->>'shift')) THEN RAISE EXCEPTION 'SILK_INVALID_ASSIGNMENT';END IF;
   IF p->>'name'='Emily' THEN
    q:=sh->(p->>'shift');cap:=private.tip_rmin(ARRAY[1000,1]::numeric[],private.tip_radd(ef,es));
    a:=private.tip_rmin(private.tip_rmul(cap,ARRAY[(q->'f'->>0)::numeric,(q->'f'->>1)::numeric]),ef);
    b:=private.tip_rmin(private.tip_rmul(cap,ARRAY[(q->'s'->>0)::numeric,(q->'s'->>1)::numeric]),es);
    rest:=private.tip_rsub(private.tip_rsub(cap,a),b);extra:=private.tip_rmin(rest,private.tip_rsub(ef,a));a:=private.tip_radd(a,extra);rest:=private.tip_rsub(rest,extra);b:=private.tip_radd(b,private.tip_rmin(rest,private.tip_rsub(es,b)));
    ef:=private.tip_rsub(ef,a);es:=private.tip_rsub(es,b);ac:=private.tip_add_claim(ac,'staff:Emily','Emily',private.tip_radd(a,b),day.key,p->>'shift');
   END IF;
  END LOOP;
  wf:=ARRAY[0,1];ws:=ARRAY[0,1];
  FOR p IN SELECT value FROM jsonb_array_elements(day.value->'assignments') WHERE value->>'name'<>'Emily' LOOP
   q:=sh->(p->>'shift');wf:=private.tip_radd(wf,ARRAY[(q->'f'->>0)::numeric,(q->'f'->>1)::numeric]);ws:=private.tip_radd(ws,ARRAY[(q->'s'->>0)::numeric,(q->'s'->>1)::numeric]);
  END LOOP;
  IF (ef[1]>0 AND wf[1]=0) OR (es[1]>0 AND ws[1]=0) THEN RAISE EXCEPTION 'SILK_UNASSIGNED_POOL';END IF;
  FOR p IN SELECT value FROM jsonb_array_elements(day.value->'assignments') WHERE value->>'name'<>'Emily' LOOP
   q:=sh->(p->>'shift');a:=ARRAY[0,1];b:=ARRAY[0,1];
   IF wf[1]>0 THEN a:=private.tip_rdiv(private.tip_rmul(ef,ARRAY[(q->'f'->>0)::numeric,(q->'f'->>1)::numeric]),wf);END IF;
   IF ws[1]>0 THEN b:=private.tip_rdiv(private.tip_rmul(es,ARRAY[(q->'s'->>0)::numeric,(q->'s'->>1)::numeric]),ws);END IF;
   ac:=private.tip_add_claim(ac,'staff:'||(p->>'name'),p->>'name',private.tip_radd(a,b),day.key,p->>'shift');
  END LOOP;
 END LOOP;
 FOR entry IN SELECT key,value FROM jsonb_each(ac) ORDER BY CASE WHEN key LIKE 'staff:%' THEN array_position(ARRAY(SELECT jsonb_array_elements_text(input->'staff')),value->>'name') WHEN key='kitchen' THEN 100000 ELSE 100001 END LOOP
  claim:=ARRAY[(entry.value->>'n')::numeric,(entry.value->>'d')::numeric];pay:=div(claim[1]+50*claim[2],100*claim[2])*100;candidate:=candidate+pay;
  line:=(entry.value-'n'-'d')||jsonb_build_object('claim',jsonb_build_object('numerator',claim[1]::text,'denominator',claim[2]::text),'amount',claim[1]/claim[2]/100,'candidatePayoutCents',pay);
  lines:=lines||jsonb_build_array(line);
 END LOOP;
 SELECT coalesce(jsonb_agg(v||jsonb_build_object('payoutCents',CASE WHEN candidate=total THEN (v->>'candidatePayoutCents')::numeric END,'payout',CASE WHEN candidate=total THEN (v->>'candidatePayoutCents')::numeric/100 END)),'[]') INTO lines FROM jsonb_array_elements(lines) v;
 RETURN jsonb_build_object('version','silk-exact-1','policy','whole-chf-balanced-only','inputCents',total,'total',total/100,'candidatePayoutCents',candidate,'payoutCents',CASE WHEN candidate=total THEN candidate END,'residualCents',total-candidate,'canFinalize',candidate=total,'lines',lines);
END $$;

-- Client writes on this workspace must use the versioned functions. Administrator maintenance
-- still cannot delete/change an archive through an ordinary UPDATE.
CREATE OR REPLACE FUNCTION private.tip_v14_scoped_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE e record;
BEGIN
 IF coalesce(NEW.workspace_id,OLD.workspace_id)<>'edb875da-fea6-49a0-8e50-e314254752a6'::uuid THEN IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;END IF;
 IF current_user IN ('authenticated','anon') THEN RAISE EXCEPTION 'SILK_UPDATE_REQUIRED: Versioned RPC required' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'SILK_ARCHIVE_PROTECTED' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' THEN
  FOR e IN SELECT key,value FROM jsonb_each(OLD.payload->'settlements') LOOP
   IF coalesce(e.value->>'dataFormat','') NOT LIKE 'draft%' AND NEW.payload->'settlements'->e.key IS DISTINCT FROM e.value THEN RAISE EXCEPTION 'SILK_ARCHIVE_PROTECTED' USING ERRCODE='42501';END IF;
  END LOOP;
 END IF;RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tip_integrity_write_guard ON public.tip_workspace_state;
DROP TRIGGER IF EXISTS tip_v14_guard ON public.tip_workspace_state;
CREATE TRIGGER tip_v14_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tip_workspace_state FOR EACH ROW EXECUTE FUNCTION private.tip_v14_scoped_guard();

CREATE OR REPLACE FUNCTION private.tip_v14_access(id uuid) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF id IS DISTINCT FROM 'edb875da-fea6-49a0-8e50-e314254752a6'::uuid OR auth.uid() IS NULL OR NOT private.tip_is_workspace_member(id) THEN RAISE EXCEPTION 'SILK_FORBIDDEN' USING ERRCODE='42501';END IF;
 IF coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-silk-client-protocol' IS DISTINCT FROM '4' THEN RAISE EXCEPTION 'SILK_UPDATE_REQUIRED' USING ERRCODE='42501';END IF;
END $$;
CREATE OR REPLACE FUNCTION public.tip_write_workspace_v14(p_workspace_id uuid,p_expected_revision bigint,p_payload jsonb) RETURNS public.tip_workspace_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.tip_workspace_state;e record;day record;a record;
BEGIN
 PERFORM private.tip_v14_access(p_workspace_id);
 SELECT * INTO r FROM public.tip_workspace_state WHERE workspace_id=p_workspace_id FOR UPDATE;
 -- Adoption of a legacy workspace requires its separately reviewed migration, never an implicit rewrite.
 IF NOT FOUND THEN RAISE EXCEPTION 'SILK_ADOPTION_REQUIRED';END IF;
 -- Rights may have been revoked while this transaction waited for the row lock.
 PERFORM private.tip_v14_access(p_workspace_id);
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'SILK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 IF p_payload->>'format' IS DISTINCT FROM '2' THEN RAISE EXCEPTION 'SILK_INVALID_DOCUMENT';END IF;
 FOR e IN SELECT * FROM (VALUES('days','object'),('period','object'),('staff','array'),('staffLabels','object'),('shifts','array'),('settlements','object'),('work','object')) AS t(k,v) LOOP
  IF jsonb_typeof(p_payload->e.k) IS DISTINCT FROM e.v THEN RAISE EXCEPTION 'SILK_INVALID_DOCUMENT';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'staff') v WHERE jsonb_typeof(v)<>'string' OR v#>>'{}'='') OR
 (SELECT count(*) FROM jsonb_array_elements(p_payload->'staff'))<>(SELECT count(DISTINCT v) FROM jsonb_array_elements(p_payload->'staff') v) OR
 EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'shifts') v WHERE jsonb_typeof(v->'name') IS DISTINCT FROM 'string' OR v->>'name'='') OR
 (SELECT count(*) FROM jsonb_array_elements(p_payload->'shifts'))<>(SELECT count(DISTINCT v->>'name') FROM jsonb_array_elements(p_payload->'shifts') v) THEN RAISE EXCEPTION 'SILK_INVALID_DOCUMENT';END IF;
 FOR e IN SELECT key,value FROM jsonb_each(p_payload->'settlements') LOOP
  IF e.value IS DISTINCT FROM r.payload->'settlements'->e.key AND coalesce(e.value->>'dataFormat','') NOT LIKE 'draft%' THEN RAISE EXCEPTION 'SILK_FINALIZATION_REQUIRED';END IF;
 END LOOP;
 FOR day IN SELECT key,value FROM jsonb_each(p_payload->'days') LOOP
  IF jsonb_typeof(day.value->'assignments') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'SILK_INVALID_DOCUMENT';END IF;
  FOR a IN SELECT key,value FROM jsonb_each_text(day.value->'assignments') LOOP
   IF r.payload->'days'->day.key->'assignments'->>a.key=a.value AND (r.payload->'staff' ? a.key)=(p_payload->'staff' ? a.key) AND
    EXISTS(SELECT 1 FROM jsonb_array_elements(r.payload->'shifts') v WHERE v->>'name'=a.value)=EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'shifts') v WHERE v->>'name'=a.value) THEN CONTINUE;END IF;
   IF NOT(p_payload->'staff' ? a.key) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'shifts') v WHERE v->>'name'=a.value) THEN RAISE EXCEPTION 'SILK_INVALID_DOCUMENT';END IF;
  END LOOP;
 END LOOP;
 IF p_payload=r.payload THEN RETURN r;END IF;
 UPDATE public.tip_workspace_state SET payload=p_payload WHERE workspace_id=p_workspace_id RETURNING * INTO r;RETURN r;
END $$;
CREATE OR REPLACE FUNCTION public.tip_finalize_workspace_v14(p_workspace_id uuid,p_expected_revision bigint,p_id uuid,p_input jsonb) RETURNS public.tip_workspace_state
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.tip_workspace_state;old jsonb;receipt jsonb;finance jsonb;e record;assignments jsonb;firstday date;lastday date;period jsonb;id text:=p_id::text;
BEGIN
 PERFORM private.tip_v14_access(p_workspace_id);
 SELECT * INTO r FROM public.tip_workspace_state WHERE workspace_id=p_workspace_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SILK_ADOPTION_REQUIRED';END IF;
 old:=r.payload->'settlements'->id;
 IF old->>'dataFormat'='final-v3' THEN
  IF old->'inputSnapshot'=p_input THEN RETURN r;END IF;
  RAISE EXCEPTION 'SILK_IDEMPOTENCY_CONFLICT';
 END IF;
 IF old IS NOT NULL AND coalesce(old->>'dataFormat','') NOT LIKE 'draft%' THEN RAISE EXCEPTION 'SILK_ARCHIVE_PROTECTED';END IF;
 IF r.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'SILK_REVISION_CONFLICT' USING ERRCODE='40001';END IF;
 period:=r.payload->'period';firstday:=(p_input->>'periodStart')::date;lastday:=(p_input->>'periodEnd')::date;
 IF firstday IS NULL OR lastday IS NULL OR lastday<firstday OR lastday-firstday>365 OR (SELECT count(*) FROM jsonb_object_keys(p_input->'byDate'))<>lastday-firstday+1 THEN RAISE EXCEPTION 'SILK_INVALID_PERIOD';END IF;
 IF p_input->>'mode' IS DISTINCT FROM period->>'mode' OR p_input->'staff' IS DISTINCT FROM r.payload->'staff' OR p_input->'shifts' IS DISTINCT FROM r.payload->'shifts' OR coalesce(p_input->'staffLabels','{}') IS DISTINCT FROM coalesce(r.payload->'staffLabels','{}') THEN RAISE EXCEPTION 'SILK_STALE_CALCULATION';END IF;
 IF (CASE WHEN period->>'mode'='day' THEN period->>'singleDate' ELSE period->>'periodStart' END)::date IS DISTINCT FROM firstday OR (CASE WHEN period->>'mode'='day' THEN period->>'singleDate' ELSE period->>'periodEnd' END)::date IS DISTINCT FROM lastday THEN RAISE EXCEPTION 'SILK_STALE_CALCULATION';END IF;
 FOR e IN SELECT key,value FROM jsonb_each(p_input->'byDate') LOOP
  IF e.key::date<firstday OR e.key::date>lastday OR e.key<>to_char(e.key::date,'YYYY-MM-DD') THEN RAISE EXCEPTION 'SILK_INVALID_PERIOD';END IF;
  SELECT coalesce(jsonb_object_agg(v->>'name',v->>'shift'),'{}') INTO assignments FROM jsonb_array_elements(e.value->'assignments') v;
  IF e.value->>'f' IS DISTINCT FROM r.payload->'days'->e.key->>'f' OR e.value->>'s' IS DISTINCT FROM r.payload->'days'->e.key->>'s' OR assignments IS DISTINCT FROM r.payload->'days'->e.key->'assignments' THEN RAISE EXCEPTION 'SILK_STALE_CALCULATION';END IF;
 END LOOP;
 FOR e IN SELECT key,value FROM jsonb_each(r.payload->'settlements') LOOP
  IF coalesce(e.value->>'dataFormat','') LIKE 'draft%' THEN CONTINUE;END IF;
  IF coalesce(e.value->>'periodStart',e.value->'inputSnapshot'->>'periodStart') IS NULL OR coalesce(e.value->>'periodEnd',e.value->'inputSnapshot'->>'periodEnd') IS NULL THEN RAISE EXCEPTION 'SILK_ARCHIVE_COVERAGE_UNKNOWN';END IF;
  IF firstday<=coalesce(e.value->>'periodEnd',e.value->'inputSnapshot'->>'periodEnd')::date AND lastday>=coalesce(e.value->>'periodStart',e.value->'inputSnapshot'->>'periodStart')::date THEN RAISE EXCEPTION 'SILK_PERIOD_ALREADY_FINALIZED';END IF;
 END LOOP;
 finance:=private.tip_finance(p_input);
 IF finance->>'canFinalize'<>'true' THEN RAISE EXCEPTION 'SILK_ROUNDING_DECISION_REQUIRED';END IF;
 receipt:=jsonb_build_object('id',id,'dataFormat','final-v3','label',firstday||' – '||lastday,'periodStart',firstday,'periodEnd',lastday,'savedAt',clock_timestamp(),'finalizedAt',clock_timestamp(),'finalizedBy',auth.uid(),'serverRevision',r.revision+1,'inputSnapshot',p_input,'resultData',finance);
 UPDATE public.tip_workspace_state SET payload=jsonb_set(jsonb_set(payload,ARRAY['settlements',id],receipt),'{work}',jsonb_build_object('activeId',id,'checkpoint',p_input,'calculation',null)) WHERE workspace_id=p_workspace_id RETURNING * INTO r;RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.tip_write_workspace_v14(uuid,bigint,jsonb),public.tip_finalize_workspace_v14(uuid,bigint,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tip_write_workspace_v14(uuid,bigint,jsonb),public.tip_finalize_workspace_v14(uuid,bigint,uuid,jsonb) TO authenticated;
-- Private helpers must never become exposed RPCs, including future schema exposure changes.
REVOKE ALL ON FUNCTION private.tip_rat(numeric,numeric),private.tip_radd(numeric[],numeric[]),private.tip_rsub(numeric[],numeric[]),private.tip_rmul(numeric[],numeric[]),private.tip_rdiv(numeric[],numeric[]),private.tip_rmin(numeric[],numeric[]),private.tip_factor(text),private.tip_cents(text),private.tip_add_claim(jsonb,text,text,numeric[],text,text),private.tip_finance(jsonb),private.tip_v14_access(uuid),private.tip_v14_scoped_guard() FROM PUBLIC;
COMMIT;
