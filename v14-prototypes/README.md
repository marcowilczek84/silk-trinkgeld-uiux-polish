# V1.4 Variante C — isolated preparation (16.10.2026)

**Status:** User chose whole-CHF distribution C. Prototype JavaScript modules and tests only. They are NOT integrated into the live financial core, finalized receipts, UI, RPCs, SQL migration or a deployment. Production and historical periods remain unchanged.

## Whole-franc calculation
- Source: original V1.4 exact fractional-cent claim for each recipient; no change to 70% Service / 30% Küche / Housekeeping 2.5% from each department / existing Emily special case.
- Allocate first among Service, Küche, Housekeeping using floor CHF and largest fractional remainder (Hamilton), then within Service by the same algorithm.
- Pool tie order: Service, Küche, Housekeeping. Service-person tie order: stable recipient ID (not on-screen order).
- Proven example: CHF 1,000 → 683 Service, 292 Küche, 25 Housekeeping. No silent surplus/shortfall; all payouts whole CHF.
- **Remaining business decision:** Inputs whose *total* includes fractional CHF (e.g. 1,801.10) remain BLOCKED. A global cents cash-pool would require a separate decision, accounting, and testing. No employee residual accounts.

## Linked net corrections
- Original finalized receipt remains immutable. Correction starts as a draft referencing original ID, period, reason, correction revision.
- Recalculate corrected target for same period using the approved policy; signed delta per recipient = target payout minus sum of actually CONFIRMED cash disbursements/refunds over the whole original+correction chain.
- Positive delta is due, not automatically paid; negative delta is a documented overpayment/reconciliation item, **not** an automatic withholding. Verify cash availability, authorizations and worker agreement/legal requirements before any settlement.
- Without a confirmed original payout baseline, a valid revision, and unique confirmed cash-movement IDs, preview fails closed.
- Server implementation must use a separate secure revision-locked idempotent correction RPC; normal V1.4 finalization must not issue a duplicate full-period payment. Receipts and payment events append-only; handle retries/lost responses/concurrent corrections.

## Safety/implementation gates
1. Complete JS/SQL parity including Emily cap, HK pools, 14/30 recipients, shifts; version the new receipt and preserve old archive.
2. Approve treatment of whole-period fractional-CHF receipts and evidence requirements for negative correction, before enabling financial completion.
3. Independently test with actual staging JWT/RLS, PostgREST, two devices, Realtime, older clients and backup/restore before any production approval.
4. Deploy SQL and client together, only with explicit separate Production authorization. Do not apply prepared `docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql` automatically.

Prototype test execution locally: 18 passed, including 4,000 algorithmic distribution scenarios. Repository test file `variant-c-and-corrections.test.cjs` is provided for CI; **full inherited V1.4 regression and live browser/server acceptance not rerun** for this isolated branch. 

Files: `variant-c-allocation.js`, `net-correction-reference.js`, `variant-c-and-corrections.test.cjs`.

## Development step 2 — source-engine verification (16.10.2026)

- The new `variant-c-calculation-adapter.js` calls the **unaltered** `SilkFinance.calculate(input)`, then applies `SilkVariantC.allocate(exact)` to the exact claim fractions. This is a READ-ONLY candidate, never an authorized server payout. The adapter explicitly sets `previewOnly: true`, `canFinalize: false` and `finalizationStatus: STAGING_SQL_PARITY_REQUIRED`.
- `variant-c-real-finance.test.cjs` loads the existing application financial core, validates exact service (273/400), kitchen (117/400), HK (1/40), Emily cap, extreme 30-person shift weights, multi-day CHF 341 and a linked net correction. It also runs 2,000 seeded scenarios with whole-CHF gross totals. Each checks final payout conservation and preserves the exact original claims.
- Run all reference tests using `npm run test:variant-c`. This is separate from `npm test`; the production app's calculation/UI/server RPC has **not** been switched to C.
- Local pre-commit rehearsal (the original V1.4 exact engine reproduced in the isolated workspace) passed 26/26 node tests overall, including this new integration suite; **the repository's new test command and CI have not been executed by the connector**. The code is committed for independent reproduction.
- PostgreSQL source parity is **NOT completed**; current prepared SQL still implements legacy `whole-chf-balanced-only`. Any enabled C finalization before a coordinated and thoroughly tested server change is forbidden.
- Open business policy: incoming totals with fractional CHF (e.g. 1,801.10) remain blocked. Do not silently round/discard these cents; do not introduce recipient rest accounts. Also confirm whether group tie order Service → Küche → HK should be the permanently approved deterministic rule.

## Development step 3 — PostgreSQL parity preparation (16.10.2026)

Files added:
- `variant-c-postgres-PREPARED-NOT-APPLIED.sql` — two private, non-finalizing functions: exact Hamilton allocation and a server-computed read-only Variant C candidate (dependent on the original V1.4 `private.tip_finance`). Uses exact integer/numeric rational cross-products to resolve fractional ties, not floats.
- `variant-c-postgres-SYNTHETIC-ACCEPTANCE.sql` — synthetic assertions for CHF 1,000 → 683/292/25, two-day CHF 341 → 137/96/100/8 and blocking CHF 100.01.
- `variant-c-calculation-adapter.js` — updated to use C's actual `candidatePayoutCents`, not the old rounded preliminary sum; `previewOnly=true`, `canFinalize=false`.
- `variant-c-real-finance.test.cjs` — added candidate-display and safety assertions.

The SQL package is transaction-wrapped and explicitly revokes PUBLIC EXECUTE on the two new functions. It creates no table, public RPC, trigger, privileged grant or cash movement. It deliberately leaves original V1.4 finalization unchanged. It has **NOT** been executed, installed, parsed by a live PostgreSQL server or certified against production Supabase.

Independent local replay of the supplied unchanged V1.4 financial core, Variant C and correction reference modules: **26 passed, 0 failed** (including 2,000 seeded financial periods). This is NOT a claim that PostgreSQL tests, full inherited 84 regressions or GitHub Actions ran after step 3. The branch source and new SQL files have been saved and should be tested in a dedicated disposable PostgreSQL/Supabase staging instance before any integration.

Open rollout gates:
1. Actual JS ↔ PostgreSQL parity on deterministic test vectors (Emily; 14/30 staff; all extreme weights; CHF 1,000 / 341; rounding ties; zero; overflow; fractional input), then complete inherited tests.
2. Design and test an **idempotent revision-locked net-correction posting RPC** including verified original cash payouts, refunds, recipient deltas and append-only linked correction receipts. `net-correction-reference.js` is a preview, not a server payment system.
3. Business decision for fractional-CHF period receipts: existing examples CHF 145.50 / 1,801.10 currently BLOCK. No silent loss or carryover. A non-personal common cash remainder pool is *one option*, NOT approved.
4. Approve stable group tie order (current proposal Service, Küche, Housekeeping, then stable recipient ID).
5. Separate approval for real isolated staging and production migration. No production client, SQL, historical records or user data altered.
