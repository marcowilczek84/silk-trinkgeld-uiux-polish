import test from 'node:test';import assert from 'node:assert/strict';import '../sync-merge.js';
const {merge}=globalThis.SilkSyncMerge;
test('independent A/B edits are preserved; stale client does not revert remote or deletion',()=>{
 const base={days:{one:{f:'10',s:'0'},two:{f:'0',s:'20'}},settlements:{a:{id:'a'}}};
 const a=structuredClone(base),b=structuredClone(base);a.days.one.f='15';b.days.two.s='30';delete b.settlements.a;
 const r=merge(base,a,b);assert.equal(r.conflicts.length,0);assert.equal(r.value.days.one.f,'15');assert.equal(r.value.days.two.s,'30');assert.deepEqual(r.value.settlements,{});
});
test('same value conflict and delete/edit conflict retain both alternatives',()=>{
 const r=merge({days:{one:{f:'10'}},settlements:{a:{id:'a',n:1}}},{days:{one:{f:'11'}},settlements:{}},{days:{one:{f:'12'}},settlements:{a:{id:'a',n:2}}});
 assert.equal(r.conflicts.length,2);assert.equal(r.conflicts[0].local,'11');assert.equal(r.conflicts[0].remote,'12');assert.equal(r.conflicts[1].remote.n,2);
});
