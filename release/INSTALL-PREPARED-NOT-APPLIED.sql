-- PREPARED ONLY. Separate SQL approval + fresh verified backup required.
-- One transaction: a failure rolls back every DDL step. No data backfill, gate or operators.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF current_setting('server_version_num')::int/10000 <> 17 THEN RAISE EXCEPTION 'Release requires verified PostgreSQL 17';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tip_workspace_state WHERE workspace_id='edb875da-fea6-49a0-8e50-e314254752a6' AND payload->>'format'='2') THEN RAISE EXCEPTION 'Workspace adoption required; no automatic migration';END IF;
 IF to_regclass('private.tip_c2_gate') IS NOT NULL OR to_regclass('private.tip_workspace_events_v14') IS NOT NULL OR to_regprocedure('public.tip_write_workspace_v14(uuid,bigint,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Candidate partly present; stop and compare schema';END IF;
END $$;
LOCK TABLE public.tip_workspace_state IN SHARE ROW EXCLUSIVE MODE;
-- Source: docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql
-- V1.4 PREPARED ONLY. Explicit production database approval required.
-- No UPDATE/backfill of existing records. Apply only after backup and staging acceptance.

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

-- Source: v14-prototypes/variant-c-postgres-PREPARED-NOT-APPLIED.sql
-- SILK Trinkgeld V1.4 Variant C — STAGING PROPOSAL ONLY / NOT APPLIED
-- DEPENDENCY: docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql
-- Provides exact whole-CHF candidate arithmetic with one gross-period rounding, NOT a finalization RPC.
-- Never execute in production until a separate reviewed/approved release.
-- SQL preview only: no tables, exposed RPCs, triggers, write calls or history migrations.
-- The following DDL must only be run after isolated staging approval.


-- Match JavaScript's existing stable-ID UTF-16 comparison independently of DB collation.
CREATE OR REPLACE FUNCTION private.tip_c_utf16_key(value text) RETURNS integer[]
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE result integer[]:='{}';cp integer;i integer;
BEGIN
 FOR i IN 1..length(value) LOOP
  cp:=ascii(substr(value,i,1));
  IF cp>65535 THEN result:=result||ARRAY[55296+(cp-65536)/1024,56320+(cp-65536)%1024];
  ELSE result:=array_append(result,cp);END IF;
 END LOOP;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION private.tip_c_allocate_whole(p_items jsonb, p_budget numeric)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE
  v_item jsonb; v_id text; v_n numeric; v_d numeric; v_base numeric;
  v_count integer:=0; v_base_sum numeric:=0; v_remaining numeric;
  v_payouts jsonb:='{}'; v_fraction jsonb:='{}'; v_selected jsonb:='{}';
  v_pair record; v_rn numeric; v_rd numeric; v_rank integer;
  v_best_id text; v_best_n numeric; v_best_d numeric; v_best_rank integer;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items)<>'array' OR p_budget IS NULL
     OR p_budget<0 OR p_budget<>trunc(p_budget) THEN
    RAISE EXCEPTION 'SILK_C_INVALID_BUDGET';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_id:=v_item->>'id';
    IF v_id IS NULL OR v_id='' OR v_payouts ? v_id THEN
      RAISE EXCEPTION 'SILK_C_DUPLICATE_OR_INVALID_RECIPIENT';
    END IF;
    v_n:=(v_item->>'n')::numeric; v_d:=(v_item->>'d')::numeric;
    IF v_n IS NULL OR v_d IS NULL OR v_n<0 OR v_d<=0
       OR v_n<>trunc(v_n) OR v_d<>trunc(v_d) THEN
      RAISE EXCEPTION 'SILK_C_INVALID_CLAIM';
    END IF;
    v_base:=div(v_n,v_d);
    v_base_sum:=v_base_sum+v_base;
    v_count:=v_count+1;
    v_payouts:=jsonb_set(v_payouts,ARRAY[v_id],to_jsonb(v_base),true);
    v_fraction:=jsonb_set(v_fraction,ARRAY[v_id],
       jsonb_build_object('n',mod(v_n,v_d),'d',v_d,'rank',coalesce((v_item->>'rank')::integer,100000)),true);
  END LOOP;
  v_remaining:=p_budget-v_base_sum;
  IF v_remaining<0 OR v_remaining>v_count THEN
    RAISE EXCEPTION 'SILK_C_POOL_MISMATCH';
  END IF;
  WHILE v_remaining>0 LOOP
    v_best_id:=NULL; v_best_n:=NULL; v_best_d:=NULL; v_best_rank:=NULL;
    FOR v_pair IN SELECT key,value FROM jsonb_each(v_fraction) LOOP
      IF v_selected ? v_pair.key THEN CONTINUE; END IF;
      v_rn:=(v_pair.value->>'n')::numeric; v_rd:=(v_pair.value->>'d')::numeric;
      v_rank:=(v_pair.value->>'rank')::integer;
      IF v_rn=0 THEN CONTINUE; END IF;
      IF v_best_id IS NULL
         OR v_rn*v_best_d>v_best_n*v_rd
         OR (v_rn*v_best_d=v_best_n*v_rd AND
              (v_rank<v_best_rank OR (v_rank=v_best_rank AND private.tip_c_utf16_key(v_pair.key)<private.tip_c_utf16_key(v_best_id)))) THEN
        v_best_id:=v_pair.key; v_best_n:=v_rn; v_best_d:=v_rd; v_best_rank:=v_rank;
      END IF;
    END LOOP;
    IF v_best_id IS NULL THEN RAISE EXCEPTION 'SILK_C_UNDISTRIBUTABLE';END IF;
    v_payouts:=jsonb_set(v_payouts,ARRAY[v_best_id],
       to_jsonb((v_payouts->>v_best_id)::numeric+1),true);
    v_selected:=v_selected||jsonb_build_object(v_best_id,true);
    v_remaining:=v_remaining-1;
  END LOOP;
  RETURN v_payouts;
END $$;

CREATE OR REPLACE FUNCTION private.tip_finance_variant_c_candidate(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
  v_exact jsonb; v_total numeric; v_target_cents numeric; v_adjustment numeric; v_francs numeric; v_pools jsonb;
  v_service jsonb:='[]'; v_kitchen jsonb:='[]'; v_housekeeping jsonb:='[]';
  v_service_claim numeric[]:=ARRAY[0,1]::numeric[];
  v_kitchen_claim numeric[]:=ARRAY[0,1]::numeric[];
  v_housekeeping_claim numeric[]:=ARRAY[0,1]::numeric[];
  v_line jsonb; v_id text; v_group text; v_n numeric; v_d numeric;
  v_seen jsonb:='{}'; v_items jsonb; v_group_allocations jsonb;
  v_allocations jsonb:='{}'; v_result_lines jsonb:='[]'; v_result_categories jsonb:='[]';
  v_group_names text[]:=ARRAY['service','kitchen','housekeeping'];
  v_name text; v_target numeric; v_pay numeric; v_base numeric; v_paid numeric:=0;
  v_cat_n numeric; v_cat_d numeric;
BEGIN
  v_exact:=private.tip_finance(p_input);
  v_total:=(v_exact->>'inputCents')::numeric;
  IF v_total IS NULL OR v_total<0 OR v_total<>trunc(v_total) THEN
    RAISE EXCEPTION 'SILK_C_INVALID_TOTAL';
  END IF;
  v_target_cents:=div(v_total+50,100)*100; -- one rounding for the entire period
  v_francs:=v_target_cents/100;
  v_adjustment:=v_target_cents-v_total;
  -- Original V1.4 fractions: service 70% * 97.5%; kitchen 30% * 97.5%; HK 2.5%.
  v_pools:=private.tip_c_allocate_whole(
    jsonb_build_array(
      jsonb_build_object('id','service','n',v_total*273,'d',40000,'rank',0),
      jsonb_build_object('id','kitchen','n',v_total*117,'d',40000,'rank',1),
      jsonb_build_object('id','housekeeping','n',v_total,'d',4000,'rank',2)
    ),v_francs);

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_exact->'lines') LOOP
    v_id:=v_line->>'id';
    IF v_id IS NULL OR v_id='' OR v_seen ? v_id THEN
      RAISE EXCEPTION 'SILK_C_DUPLICATE_OR_INVALID_RECIPIENT';
    END IF;
    v_seen:=v_seen||jsonb_build_object(v_id,true);
    v_n:=(v_line->'claim'->>'numerator')::numeric;
    v_d:=(v_line->'claim'->>'denominator')::numeric;
    IF v_n IS NULL OR v_d IS NULL OR v_n<0 OR v_d<=0
       OR v_n<>trunc(v_n) OR v_d<>trunc(v_d) THEN
      RAISE EXCEPTION 'SILK_C_INVALID_CLAIM';
    END IF;
    v_items:=jsonb_build_object('id',v_id,'n',v_n,'d',v_d*100,'rank',100000);
    IF left(v_id,6)='staff:' THEN
      v_service:=v_service||jsonb_build_array(v_items);
      v_service_claim:=private.tip_radd(v_service_claim,private.tip_rat(v_n,v_d));
    ELSIF v_id='kitchen' THEN
      v_kitchen:=v_kitchen||jsonb_build_array(v_items);
      v_kitchen_claim:=private.tip_radd(v_kitchen_claim,private.tip_rat(v_n,v_d));
    ELSIF v_id='housekeeping' THEN
      v_housekeeping:=v_housekeeping||jsonb_build_array(v_items);
      v_housekeeping_claim:=private.tip_radd(v_housekeeping_claim,private.tip_rat(v_n,v_d));
    ELSE
      RAISE EXCEPTION 'SILK_C_INVALID_RECIPIENT';
    END IF;
  END LOOP;
  IF v_service_claim<>private.tip_rat(v_total*273,400)
     OR v_kitchen_claim<>private.tip_rat(v_total*117,400)
     OR v_housekeeping_claim<>private.tip_rat(v_total,40) THEN
    RAISE EXCEPTION 'SILK_C_CLAIMS_NOT_BALANCED';
  END IF;

  FOREACH v_name IN ARRAY v_group_names LOOP
    v_target:=(v_pools->>v_name)::numeric;
    v_items:=CASE v_name WHEN 'service' THEN v_service
                         WHEN 'kitchen' THEN v_kitchen
                         ELSE v_housekeeping END;
    IF jsonb_array_length(v_items)=0 THEN
      IF v_target<>0 THEN RAISE EXCEPTION 'SILK_C_EMPTY_POOL';END IF;
      v_group_allocations:='{}'::jsonb;
    ELSE
      v_group_allocations:=private.tip_c_allocate_whole(v_items,v_target);
    END IF;
    v_allocations:=v_allocations||v_group_allocations;
    v_cat_n:=CASE v_name WHEN 'service' THEN 273
                         WHEN 'kitchen' THEN 117 ELSE 1 END;
    v_cat_d:=CASE WHEN v_name='housekeeping' THEN 40 ELSE 400 END;
    v_result_categories:=v_result_categories||jsonb_build_array(
      jsonb_build_object('id',v_name,'payoutCents',v_target*100,
        'basePayoutCents',div(v_total*v_cat_n,v_cat_d*100)*100,
        'roundingBonusCents',(v_target-div(v_total*v_cat_n,v_cat_d*100))*100));
  END LOOP;

  FOR v_line IN SELECT value FROM jsonb_array_elements(v_exact->'lines') LOOP
    v_id:=v_line->>'id';
    v_pay:=(v_allocations->>v_id)::numeric;
    IF v_pay IS NULL THEN RAISE EXCEPTION 'SILK_C_ALLOCATION_MISSING';END IF;
    v_n:=(v_line->'claim'->>'numerator')::numeric;
    v_d:=(v_line->'claim'->>'denominator')::numeric;
    v_base:=div(v_n,v_d*100);
    v_paid:=v_paid+v_pay*100;
    v_group:=CASE WHEN left(v_id,6)='staff:' THEN 'service' ELSE v_id END;
    v_result_lines:=v_result_lines||jsonb_build_array(v_line||
      jsonb_build_object('category',v_group,'payoutCents',v_pay*100,
        'payout',v_pay,'basePayoutCents',v_base*100,
        'roundingBonusCents',(v_pay-v_base)*100,
        'allocationPolicy','silk-whole-chf-c-2','tieBreakId',v_id));
  END LOOP;
  IF v_paid<>v_target_cents THEN RAISE EXCEPTION 'SILK_C_PAYOUT_NOT_BALANCED';END IF;
  RETURN v_exact||jsonb_build_object(
    'version','silk-whole-chf-c-2',
    'exactCalculationVersion',v_exact->>'version',
    'policy','whole-chf-largest-remainder-half-up',
    'inputCents',v_total,
    'roundedPayoutTargetCents',v_target_cents,
    'candidatePayoutCents',v_target_cents,
    'payoutCents',v_target_cents,
    'roundingAdjustmentCents',v_adjustment,
    'cashDifferenceCents',-v_adjustment,
    'residualCents',-v_adjustment,
    'cashReconciliationRequired',(v_adjustment<>0),
    'cashReconciliationStatus',CASE WHEN v_adjustment=0 THEN 'not-required' ELSE 'pending' END,
    'cashReconciliationEvidence',NULL,
    'allocationReady',true,
    'canFinalize',false,
    'previewOnly',true,
    'serverFinalizationRequired',true,
    'lines',v_result_lines,
    'categories',v_result_categories);
END $$;

-- PostgreSQL functions default to PUBLIC EXECUTE unless revoked.
-- Keep even the isolated preview private, consistent with the V1.4 security contract.
REVOKE ALL ON FUNCTION private.tip_c_utf16_key(text),private.tip_c_allocate_whole(jsonb,numeric),
  private.tip_finance_variant_c_candidate(jsonb) FROM PUBLIC;

-- IMPORTANT: no replacement of private.tip_finance, no RPC, no public grants,
-- no activation of V1.4 finalization. SQL remains unexecuted in this branch.

-- Source: docs/production/c2-server-PREPARED-NOT-APPLIED.sql
-- C2 RELEASE CANDIDATE, PREPARED ONLY: separate SQL production approval required.
-- Verified in disposable synthetic DB. Apply after v14-integrity and variant-c-postgres only after release checks.
-- No historical backfill. No gate/operator rows are inserted. Real finalization stays locked.

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

-- Target's default privileges explicitly grant anon EXECUTE. Remove that inherited grant
-- from the new authenticated-only RPCs without changing global defaults or other apps.
REVOKE ALL ON FUNCTION public.tip_write_workspace_v14(uuid,bigint,jsonb),public.tip_finalize_workspace_v14(uuid,bigint,uuid,jsonb),public.tip_c2_preview(uuid,bigint,jsonb,text),public.tip_c2_finalize(uuid,bigint,uuid,jsonb,text,bigint,text,jsonb),public.tip_c2_confirm_cash(uuid,bigint,uuid,text,bigint,text,text,jsonb,text),public.tip_c2_ledger(uuid,bigint,text) FROM anon;

NOTIFY pgrst,'reload schema';
COMMIT;
