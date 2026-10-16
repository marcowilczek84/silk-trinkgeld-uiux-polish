import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {harness} from './c2-http-harness.mjs';import {input,documentFor,member,second,editor,outsider,target} from './c2-db-helper.mjs';
// Test HTTP adapter, not PostgREST; never reaches a cloud URL.
test('C2 local HTTP adapter: signed JWTs, RLS, two clients, replay, stale revision, protected receipts and net payments',async()=>{
 const h=await harness();try{
  const i=input('1801.10',['A']),read=async token=>(await fetch(h.api+'/tip_workspace_state?workspace_id=eq.'+target,{headers:{authorization:'Bearer '+token}})).json();
  assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},null)).status,401);
  assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},h.jwt(member,'authenticated',-60))).status,401);
  assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},h.token.slice(0,-4)+'abcd')).status,401);
  assert.deepEqual(await read(h.jwt(outsider)),[]);
  assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},h.jwt(outsider))).status,403);
  assert.equal((await h.rpc('tip_c2_finalize',{p_expected_revision:1,p_id:randomUUID(),p_input:input()},h.jwt(editor))).status,403);
  const docs=[documentFor(i),documentFor(input('1801.90',['A']))];
  const writes=await Promise.all(docs.map((p_payload,n)=>h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload},h.jwt(n?second:member))));
  assert.equal(writes.filter(x=>x.status===200).length,1);assert.equal(writes.filter(x=>x.body.code==='40001').length,1);
  let r=(await read(h.token))[0];const active=Object.values(r.payload.days)[0].f==='1801.10'?i:input('1801.90',['A']);
  const p=await h.rpc('tip_c2_preview',{p_expected_revision:r.revision,p_input:active});assert.equal(p.status,200);
  const delta=p.body.candidate.roundingAdjustmentCents,request={p_expected_revision:r.revision,p_id:randomUUID(),p_input:active,p_cash_evidence:{adjustmentCents:delta,kind:delta>0?'funding':'remainder',reference:'SYNTHETIC-HTTP-CASH'}};
  const attempts=await Promise.all([h.rpc('tip_c2_finalize',request),h.rpc('tip_c2_finalize',request,h.jwt(second))]);const final=attempts[0];assert.deepEqual(attempts[0],attempts[1]);assert.equal(final.status,200,JSON.stringify(final.body));
  const root=request.p_id,receipt=final.body.payload.settlements[root];
  assert.deepEqual((await h.rpc('tip_c2_finalize',request)).body.payload.settlements[root],receipt);
  const secondFinal=await h.rpc('tip_c2_finalize',{...request,p_expected_revision:final.body.revision,p_id:randomUUID()});assert.match(secondFinal.body.message,/ALREADY_FINALIZED/);
  const overwrite=await fetch(h.api+'/tip_workspace_state?workspace_id=eq.'+target,{method:'PATCH',headers:{authorization:'Bearer '+h.token,'content-type':'application/json'},body:JSON.stringify({payload:documentFor()})});assert.equal(overwrite.status,403);
  r=(await read(h.token))[0];const c={p_expected_revision:r.revision,p_id:randomUUID(),p_root_id:root,p_chain_revision:0,p_receipt_id:root,p_kind:'baseline',p_lines:receipt.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents})),p_evidence_ref:'SYNTHETIC-HTTP-CONFIRMED'};
  const confirmations=await Promise.all([h.rpc('tip_c2_confirm_cash',c),h.rpc('tip_c2_confirm_cash',c,h.jwt(second))]);assert.equal(confirmations[0].status,200);assert.deepEqual(confirmations[0].body,confirmations[1].body);
  assert.deepEqual((await read(h.token))[0].payload.settlements[root],receipt);
  console.log('HTTP evidence: synthetic signed JWT verification, test HTTP adapter, PostgreSQL 18.6/WASM; serial SQL queue, not native parallel transactions.');
 }finally{await h.close();}
});
