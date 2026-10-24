# Personal employee access — server adapter preparation

Based on actual live source a5df93a425360a0a35056890bee03432b29fffa8. Disabled by default.

Prepared same-origin personal access handler and native Supabase data relay. No client database token is returned. Existing application UI and financial logic are preserved.

Local adapter configuration tests: 2 passed. Native data relay tests live in the isolated HUB branch. Full tips build/regression/browser tests are still open.

NOT COMPLETE: frontend session wiring, native Supabase issuer registration, identity policies deployment, complete end-to-end flow. No deployment, database change or activation performed. Do not enable MODULE_SSO_ENABLED until those pass.
Existing C2 financial acceptance and individual authorization must remain enforced; HUB membership alone must not grant financial approval.
