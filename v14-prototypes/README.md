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
