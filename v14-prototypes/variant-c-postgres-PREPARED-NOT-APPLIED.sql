-- SILK Trinkgeld V1.4 Variant C — STAGING PROPOSAL ONLY / NOT APPLIED
-- DEPENDENCY: docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql
-- Provides exact whole-CHF candidate arithmetic, NOT an authorized finalization RPC.
-- Never execute in production until a separate reviewed/approved release.
-- SQL preview only: no tables, exposed RPCs, triggers, write calls or history migrations.
-- The following DDL must only be run after isolated staging approval.

BEGIN;

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
              (v_rank<v_best_rank OR (v_rank=v_best_rank AND v_pair.key<v_best_id))) THEN
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
  v_exact jsonb; v_total numeric; v_francs numeric; v_pools jsonb;
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
  IF mod(v_total,100)<>0 THEN
    RAISE EXCEPTION 'SILK_C_FRACTIONAL_TOTAL_UNRESOLVED';
  END IF;
  v_francs:=v_total/100;
  -- Original V1.4 fractions: service 70% * 97.5%; kitchen 30% * 97.5%; HK 2.5%.
  v_pools:=private.tip_c_allocate_whole(
    jsonb_build_array(
      jsonb_build_object('id','service','n',v_francs*273,'d',400,'rank',0),
      jsonb_build_object('id','kitchen','n',v_francs*117,'d',400,'rank',1),
      jsonb_build_object('id','housekeeping','n',v_francs,'d',40,'rank',2)
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
        'basePayoutCents',div(v_francs*v_cat_n,v_cat_d)*100,
        'roundingBonusCents',(v_target-div(v_francs*v_cat_n,v_cat_d))*100));
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
        'allocationPolicy','silk-whole-chf-c-1','tieBreakId',v_id));
  END LOOP;
  IF v_paid<>v_total THEN RAISE EXCEPTION 'SILK_C_PAYOUT_NOT_BALANCED';END IF;
  RETURN v_exact||jsonb_build_object(
    'version','silk-whole-chf-c-1',
    'exactCalculationVersion',v_exact->>'version',
    'policy','whole-chf-largest-remainder',
    'inputCents',v_total,
    'candidatePayoutCents',v_total,
    'payoutCents',v_total,
    'residualCents',0,
    'canFinalize',false,
    'previewOnly',true,
    'serverFinalizationRequired',true,
    'lines',v_result_lines,
    'categories',v_result_categories);
END $$;

-- PostgreSQL functions default to PUBLIC EXECUTE unless revoked.
-- Keep even the isolated preview private, consistent with the V1.4 security contract.
REVOKE ALL ON FUNCTION private.tip_c_allocate_whole(jsonb,numeric),
  private.tip_finance_variant_c_candidate(jsonb) FROM PUBLIC;
COMMIT;

-- IMPORTANT: no replacement of private.tip_finance, no RPC, no public grants,
-- no activation of V1.4 finalization. SQL remains unexecuted in this branch.
