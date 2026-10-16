# V1.4 - Data & Financial Integrity

Authorized 16 October 2026. Base: `719f821487146f62e564201e42b564c31978ae69`.
Branch: `tips-v14-data-financial-integrity-20261016`.

## Before changes

GitHub and Vercel still identify V1.2 as latest preview and `16fab0e2` as Production.
A separate local clone and baseline Git bundle preserve the source. Production is not the development base.
Read-only metadata confirms shared Supabase project `xgbbwnmqgpwxxftnjrkc`:
`tip_workspace_state` has revision bigint, format-2 JSON payload, member RLS and a revision trigger.
There is no installed integrity guard. No accounting rows have been read or changed.

## Implementation boundaries

- Cooperating browser tabs use a Web Lock: one editable tab per origin. Other tabs remain read-only, with an explicit return-to-edit action after the writer closes. No expiring localStorage lock or forced takeover.
- Local revisions and field baselines protect against stale projections. A failed write retains visible inputs and blocks finalization until saved.
- Different devices retain three-way merge and explicit conflict resolution.
- New finalization requires a server-acknowledged revision and a server RPC. No offline/local result is labelled final.
- Server guard/RPC SQL is prepared and tested in an isolated local PostgreSQL engine only. It will not run in Production without explicit approval.
- Existing archives remain byte-for-byte preserved. Corrections must reference an original and never replace it; unsafe overlapping full payouts are blocked.
- Exact monetary input and calculation use integer cents and rational arithmetic. No new payout allocation policy is activated without Marco's choice. Any unresolved rounding difference blocks binding finalization.
- Vercel preview builds remain local-only and cannot access the production database.

## Rollback strategy before implementation

Keep `719f8214` as immutable reference. No rollback is currently needed on Production: it is untouched.
Do not apply a schema script or write pause as part of this development task.
Before any later rollout: export/restore verification, capture unsynced device inputs, approve scoped SQL, test two actual cloud clients and old clients, then separately approve production.
After a future rollout, never restore an old JSON/database snapshot over newer entries.
Keep the archive/version guard active. Revert only to a tested client compatible with all newly stored fields and final records. If no compatible client exists, pause writes and deploy a forward fix. Historical records are never migrated or recalculated automatically.

## Delivered in this branch

- `write-coordinator.js`: Web Locks writer ownership; visible read-only status and explicit takeover. No lease expiry. Unsupported browsers fail closed.
- Local revision and field-level three-way merge stop stale DOM values overwriting newer data, including detected legacy-writer interference. Rendering no longer writes data or migrates staff IDs.
- The cloud document, merge baseline, revision and conflict alternatives commit in one localStorage document. Quota failures cannot advance the baseline alone. In-memory form values stay visible; closing a failed-save tab warns.
- Sync writes use protocol-4 `tip_write_workspace_v14` with a required expected revision. Existing merge/conflict UI remains.
- Finalization uses `tip_finalize_workspace_v14`, row locking, membership checks, source/status validation, immutable archives, overlap checks and a persisted idempotency key. Only a server receipt is final. A lost response is reconciled before another request.
- SQL independently calculates exact rational claims in cents; the client uses BigInt fractions. Service 70%, kitchen 30%, HK 2.5% from each pool and the legacy Emily cap are retained. Money input allows at most two decimals and CHF100,000 per shift, matching the existing import ceiling.
- Until a rounding decision, only the legacy whole-franc rounding when its sum exactly equals the available input can finalize. Any surplus OR shortfall is blocked, including 1000 -> 1001 and fractional-franc totals. No amount is redistributed silently.
- final-v3 receipts contain server time, member ID, revision, original inputs, calculation version, rational claims and payout cents. Legacy HTML remains unchanged.
- Correction drafts record original ID and reason. Further payout is blocked until a net correction procedure is approved; there is no automatic reversal or historical rewrite.

## SQL package and deployment boundary

`docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql` supersedes the old protocol-3 prepared guard for this branch. Do not install both as competing rollout scripts.
The new script creates two member-authorized public RPCs, private arithmetic/validation helpers, scoped archive/direct-write guards, and a private RLS-protected change-evidence table. There is no data backfill. Only future changes create log entries, with revision, actor, time and before/after day/catalog/draft/receipt values. No end-user delete/update grants exist on the log.
The live existing shared document was confirmed by an EXISTS query only. Its contents were not inspected. New/legacy workspace adoption is intentionally blocked for review; the verified SILK workspace already has the shared document.
The two RPCs use SECURITY DEFINER with empty search_path, fully qualified references, explicit auth.uid()/membership and fixed workspace checks; PUBLIC execute is revoked. Other workspaces keep their previous direct-write behavior.
Unknown historical archive coverage blocks new finalizations instead of assuming no overlap. The potentially affected records must be reviewed without editing historical payloads.

## Validation evidence and limits

82 regression/integration tests passed together, plus 2 additional stale-local-input tests: 84 total, 0 failures. The inherited 59 tests remain represented; expectations for offline finalization/unsafe rounding were deliberately adapted to the safer contract. The original two financial golden fixtures still assert their previous candidate amounts, now blocked because their totals differ.
58 exact client/server finance fixtures cover boundaries, 14/30 recipients, cap behavior and mixed/extreme shifts. Five end-to-end jsdom/SQL tests exercise actual application functions through a Supabase-compatible mocked transport into local PostgreSQL (PGlite), including dropped acknowledgements, offline conflicts, failed acknowledgement storage and correction links. These are not live PostgREST acceptance tests.
Chromium and WebKit each passed 393x852, 1024x768 and 1440x900: real Web Locks/two tabs, takeover, quota failure/retry, rounding block, no horizontal overflow. Physical iPhone/iPad hardware is not claimed. Build/lint passed; the inherited TypeScript check remains limited to the identity module.

## Open gates; recommendation: NO Production release yet

1. Choose a binding rounding/rest policy; see `V1_4_FINANCIAL_DECISION.md`.
2. Define and approve net correction postings (including reversals/recipient deltas). Linked correction drafts are available; a second full-period payout is prohibited.
3. Approve an isolated Supabase staging deployment and validate real JWT membership/RLS, PostgREST singular RPC responses, two devices, Realtime, retries and server trigger permissions. Local SQL tests are evidence, not a substitute for this gate.
4. Inspect historical period coverage and retain originals. Unknown coverage is currently blocked.
5. Separately approve production SQL and client rollout after backup/restore rehearsal and collection of unsynced device changes. Close all older tabs. A Web Lock cannot control an already-running legacy client that does not participate; server protocol gating is therefore essential.
6. Keep the prepared SQL and protocol-4 client coordinated. This branch is intentionally incompatible with the unguarded Production server for cloud writes. Preview is local-only.

No Production deployment, production SQL execution, historical data change or external messages were performed. No MIA participation factor, OFS/FF2 interpretation or percentage was newly defined.
