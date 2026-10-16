-- Variant C PostgreSQL parity acceptance — ISOLATED STAGING ONLY
-- Prerequisites: original V1.4 prepared schema/functions AND
-- v14-prototypes/variant-c-postgres-PREPARED-NOT-APPLIED.sql installed
-- in a disposable staging database, never production.
-- This script contains synthetic test data only; it creates no persistent objects.

DO $silk_test$
DECLARE
  v_input jsonb; v_out jsonb; v_lines jsonb; v_total numeric;
BEGIN
  v_input:=$synthetic$
  {
    "staff":["A"],
    "shifts":[{"name":"F1","f":1,"s":0}],
    "byDate":{"2035-01-01":{"f":"1000","s":"0","assignments":[{"name":"A","shift":"F1"}]}}
  }
  $synthetic$::jsonb;
  v_out:=private.tip_finance_variant_c_candidate(v_input);
  v_lines:=v_out->'lines';
  IF v_out->>'version'<>'silk-whole-chf-c-1'
     OR v_out->>'canFinalize'<>'false'
     OR v_out->>'previewOnly'<>'true'
     OR v_out->>'payoutCents'<>'100000' THEN
    RAISE EXCEPTION 'SILK_C_TEST_METADATA_FAILED';
  END IF;
  IF (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='staff:A')<>68300
     OR (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='kitchen')<>29200
     OR (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='housekeeping')<>2500 THEN
    RAISE EXCEPTION 'SILK_C_TEST_1000_FAILED';
  END IF;
  v_total:=(SELECT sum((x->>'payoutCents')::numeric) FROM jsonb_array_elements(v_lines) x);
  IF v_total<>100000 THEN RAISE EXCEPTION 'SILK_C_TEST_CONSERVATION_FAILED';END IF;

  v_input:=$synthetic$
  {
    "staff":["A","B"],
    "shifts":[{"name":"F1","f":1,"s":0},{"name":"SP1","f":0,"s":1},{"name":"MD","f":0.35,"s":0.65}],
    "byDate":{
      "2035-01-01":{"f":"100","s":"40","assignments":[{"name":"A","shift":"F1"},{"name":"B","shift":"SP1"}]},
      "2035-01-02":{"f":"80.25","s":"120.75","assignments":[{"name":"A","shift":"MD"},{"name":"B","shift":"MD"}]}
    }
  }
  $synthetic$::jsonb;
  v_out:=private.tip_finance_variant_c_candidate(v_input);
  v_lines:=v_out->'lines';
  IF (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='staff:A')<>13700
     OR (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='staff:B')<>9600
     OR (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='kitchen')<>10000
     OR (SELECT (x->>'payoutCents')::numeric FROM jsonb_array_elements(v_lines) x WHERE x->>'id'='housekeeping')<>800 THEN
    RAISE EXCEPTION 'SILK_C_TEST_341_FAILED';
  END IF;
  v_total:=(SELECT sum((x->>'payoutCents')::numeric) FROM jsonb_array_elements(v_lines) x);
  IF v_total<>34100 OR v_out->>'canFinalize'<>'false' THEN
    RAISE EXCEPTION 'SILK_C_TEST_SAFETY_FAILED';
  END IF;

  v_input:=$synthetic$
  {
    "staff":["A"],
    "shifts":[{"name":"F1","f":1,"s":0}],
    "byDate":{"2035-01-01":{"f":"100.01","s":"0","assignments":[{"name":"A","shift":"F1"}]}}
  }
  $synthetic$::jsonb;
  BEGIN
    PERFORM private.tip_finance_variant_c_candidate(v_input);
    RAISE EXCEPTION 'SILK_C_TEST_FRACTION_NOT_BLOCKED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'SILK_C_FRACTIONAL_TOTAL_UNRESOLVED' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'SILK_C_POSTGRES_SYNTHETIC_TESTS_PASSED';
END $silk_test$;

-- Additional parity acceptance before any live enablement:
-- * compare serialized payouts in JS and SQL on >=2,000 deterministic fixtures
-- * zero/negative invalid inputs, invalid assignments, 14/30 staff and extreme weights
-- * Emily cap, ties, cents totals, overflow, stale revision, mobile device sync
-- * archive immutability, correction refund and double-payment prevention
-- * Supabase JWT membership/RLS and PostgREST response shape
