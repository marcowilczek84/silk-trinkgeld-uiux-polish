// Focused safety checks for the integrity patch; legacy style is intentionally retained.
export default [{
 files:['c2-integration.js','c2-workflow-ui.js','write-coordinator.js','financial-core.js','professional-workspace.js','sync-service.js','supabase-client-entry.js','assignment-identity.js','local-repository.js','release-ui.js','draft-workflow.js','sync-merge.js','sync-status.js','silk-import.js','scripts/*.mjs','tests/*.mjs'],
 languageOptions:{ecmaVersion:'latest',sourceType:'module'},
 rules:{'constructor-super':'error','for-direction':'error','getter-return':'error','no-async-promise-executor':'error','no-compare-neg-zero':'error','no-cond-assign':'error','no-constant-binary-expression':'error','no-dupe-args':'error','no-dupe-class-members':'error','no-dupe-else-if':'error','no-dupe-keys':'error','no-duplicate-case':'error','no-empty-pattern':'error','no-ex-assign':'error','no-fallthrough':'error','no-invalid-regexp':'error','no-loss-of-precision':'error','no-promise-executor-return':'error','no-self-assign':'error','no-unexpected-multiline':'error','no-unreachable':'error','no-unsafe-finally':'error','use-isnan':'error','valid-typeof':'error'}
}];
