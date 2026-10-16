import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {c2db,actor,target,member,second,editor,outsider,input,store,row,preview,finish,cash} from './c2-db-helper.mjs';
const id=n=>'00000000-0000-0000-0001-'+String(n).padStart(12,'0');
const context=vm.createContext({});for(const file of ['financial-core.js','v14-prototypes/variant-c-allocation.js','v14-prototypes/variant-c-calculation-adapter.js'])vm.runInContext(await readFile(new URL('../'+file,import.meta.url),'utf8'),context);
const normalize=r=>JSON.parse(JSON.stringify({version:r.version,input:r.inputCents,payout:r.payoutCents,delta:r.roundingAdjustmentCents,categories:r.categories,lines:r.lines.map(x=>({id:x.id,payout:x.payoutCents,claim:x.claim}))}));
test('C2 prepared SQL acceptance + 2,028 JS/PostgreSQL parity periods including 14/30 staff, Emily, cents and mixed shifts',async()=>{
 const db=await c2db();try{await db.exec('reset role');await db.exec(await readFile(new URL('../v14-prototypes/variant-c-postgres-SYNTHETIC-ACCEPTANCE.sql',import.meta.url),'utf8'));
 const boundaries=[0,1,10,49,50,51,99,100,101,149,150,199,100000,100001,100049,100050,100099,180110,180149,180150,180190,10000000];let seed=67;
 const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let n=0;n<2028;n++){
  const i=input(((boundaries[n]??(next()%10000000))/100).toFixed(2),Array.from({length:n%3===0?30:n%3===1?14:2},(_,k)=>k===0?'Emily':'S'+String(k).padStart(2,'0')));
  i.shifts=[{name:'M',f:0.35,s:0.65},{name:'E',f:0.99999999,s:0.00000001},{name:'L',f:0.00000001,s:0.99999999}];
  const d=i.byDate['2035-01-01'];d.assignments=i.staff.map((name,k)=>({name,shift:i.shifts[k%3].name}));
  if(n>=boundaries.length){d.s=(next()%50000/100).toFixed(2);if(n%5===0)i.byDate['2035-01-02']=JSON.parse(JSON.stringify(d));}
  const sql=(await db.query('select private.tip_finance_variant_c_candidate($1) result',[i])).rows[0].result;
  assert.deepEqual(normalize(sql),normalize(context.SilkVariantCPreview.preview(i)),'period '+n);
 }
 }finally{await db.close();}
});
test('C2 gate closed, old RPC closed, anon/nonmember/editor cannot finalize; default no grants to ledger',async()=>{
 const db=await c2db({gate:false});try{
  await assert.rejects(finish(db,input(),id(1)),/ACCEPTANCE_REQUIRED/);
  await assert.rejects(db.query('select r.* from tip_finalize_workspace_v14($1,1,$2,$3) r',[target,id(1),input()]),/ACCEPTANCE_REQUIRED/);
  await db.exec('reset role');await db.query('insert into private.tip_c2_gate values($1,true)',[target]);
  await actor(db,editor);assert.equal((await preview(db,input())).candidate.payoutCents,10000);await assert.rejects(finish(db,input(),id(1)),/ROLE_REQUIRED/);
  await db.exec('reset role');await db.query('update public.tip_workspace_members set active=false where user_id=$1',[editor]);await actor(db,editor);await assert.rejects(db.query('select tip_c2_preview($1,1,$2,null)',[target,input()]),/FORBIDDEN/);
  await actor(db,outsider);assert.equal((await db.query('select * from tip_workspace_state')).rows.length,0);await assert.rejects(db.query('select tip_c2_preview($1,1,$2,null)',[target,input()]),/FORBIDDEN/);
  await db.exec('reset role;set role anon');await assert.rejects(db.query('select tip_c2_preview($1,1,$2,null)',[target,input()]),/permission denied/);
  await actor(db,member);await assert.rejects(db.query('select * from private.tip_c2_cash'),/permission denied/);
 }finally{await db.close();}
});
test('C2 stale writes, synthetic receipt replay, changed request, period overlap and archive protection',async()=>{
 const db=await c2db();try{
  const initial=await row(db);const i=input('1000.50');await store(db,i);
  await assert.rejects(finish(db,i,id(1),{revision:initial.revision}),/REVISION_CONFLICT/);
  await assert.rejects(finish(db,i,id(1),{cash:null}),/CASH_EVIDENCE_REQUIRED/);
  const first=await finish(db,i,id(1)),receipt=first.payload.settlements[id(1)];assert.equal(receipt.syntheticOnly,true);assert.equal(receipt.resultData.payoutCents,100100);assert.equal(receipt.paymentStatus,'not-confirmed');
  assert.deepEqual((await finish(db,i,id(1),{revision:1})).payload.settlements[id(1)],receipt);
  await assert.rejects(finish(db,input('999'),id(1)),/IDEMPOTENCY_CONFLICT/);
  await actor(db,second);await assert.rejects(finish(db,i,id(2)),/PERIOD_ALREADY_FINALIZED/);
  const forged=structuredClone(first.payload);forged.settlements[id(1)].resultData.payoutCents=123;
  await assert.rejects(db.query('select r.* from tip_write_workspace_v14($1,$2,$3) r',[target,first.revision,forged]),/FINALIZATION_REQUIRED/);
  const deleted=structuredClone(first.payload);delete deleted.settlements[id(1)];await assert.rejects(db.query('select r.* from tip_write_workspace_v14($1,$2,$3) r',[target,first.revision,deleted]),/ARCHIVE_PROTECTED/);
  assert.deepEqual((await row(db)).payload.settlements[id(1)],receipt);
 }finally{await db.close();}
});
test('C2 net correction only from confirmed actual payout; original immutable, cash replay and net bounds',async()=>{
 const db=await c2db();try{
  const originalInput=input('1801.10',['A']);await store(db,originalInput);const original=(await finish(db,originalInput,id(1))).payload.settlements[id(1)];
  const changed=input('1801.90',['A']);await store(db,changed);await assert.rejects(preview(db,changed,id(1)),/UNVERIFIED_BASELINE/);
  const paid=original.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents}));
  const baseline=await cash(db,id(1),id(2),paid);assert.equal(baseline.chainRevision,1);
  assert.deepEqual(await cash(db,id(1),id(2),paid,{revision:1}),baseline);
  await assert.rejects(cash(db,id(1),id(3),paid,{chain:1}),/BASELINE_ALREADY_CONFIRMED/);
  const checked=await preview(db,changed,id(1));assert.equal(checked.netCorrection.netDeltaCents,100);assert.equal(checked.cashReconciliationDueCents,20);
  await assert.rejects(finish(db,changed,id(4),{root:id(1),chain:0,reason:'Synthetic correction'}),/STALE_REVISION/);
  await assert.rejects(finish(db,changed,id(8),{root:id(1),chain:1,reason:'Synthetic correction',cash:{adjustmentCents:20,kind:'funding',reference:'SYNTHETIC-CASH-NOTE'}}),/tip_c2_rounding_evidence_once/);assert.equal((await preview(db,changed,id(1))).netCorrection.chainRevision,1);
  const correction=(await finish(db,changed,id(4),{root:id(1),chain:1,reason:'Synthetic correction',cash:{adjustmentCents:20,kind:'funding',reference:'SYNTHETIC-NET-CASH'}})).payload.settlements[id(4)];
  assert.equal(correction.netCorrection.additionalDueCents,100);assert.equal(correction.automaticPayoutAllowed,false);
  const due=correction.netCorrection.lines.filter(x=>x.additionalDueCents>0).map(x=>({id:x.id,amountCents:x.additionalDueCents}));
  await assert.rejects(cash(db,id(1),id(5),due.map(x=>({...x,amountCents:1000})),{kind:'payout',chain:2,receipt:id(4)}),/CASH_EXCEEDS_NET/);
  const payment=await cash(db,id(1),id(5),due,{kind:'payout',chain:2,receipt:id(4)});assert.equal(payment.additionalDueCents,0);const ledger=(await db.query('select tip_c2_ledger($1,$2,$3) result',[target,(await row(db)).revision,id(1)])).rows[0].result;assert.equal(ledger.confirmations.length,2);assert.equal(ledger.confirmations[1].eventId,id(5));assert.equal(ledger.movements.filter(x=>x.kind==='payout').length,1);
  assert.deepEqual(await cash(db,id(1),id(5),due,{kind:'payout',chain:2,receipt:id(4)}),payment);
  await assert.rejects(cash(db,id(1),id(6),due,{kind:'payout',chain:3,receipt:id(4)}),/CASH_EXCEEDS_NET/);
  assert.deepEqual((await row(db)).payload.settlements[id(1)],original);assert.deepEqual((await row(db)).payload.settlements[id(4)],correction);
 }finally{await db.close();}
});
test('C2 overpayment separate, no automatic withholding; confirmed refund reduces only that recipient',async()=>{
 const db=await c2db();try{
  let i=input('1000',['A']);await store(db,i);const receipt=(await finish(db,i,id(1))).payload.settlements[id(1)];
  await cash(db,id(1),id(2),receipt.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents})));
  i=input('1000',['A','B']);await store(db,i);const p=await preview(db,i,id(1));assert.equal(p.netCorrection.additionalDueCents,34100);assert.equal(p.netCorrection.overpaidCents,34100);
  const r=(await finish(db,i,id(3),{root:id(1),chain:1,reason:'Shift correction'})).payload.settlements[id(3)];assert.equal(r.netCorrection.netDeltaCents,0);
  const out=await cash(db,id(1),id(4),[{id:'staff:A',amountCents:-100}],{kind:'refund',chain:2,receipt:id(3)});assert.equal(out.overpaidCents,34000);assert.equal(out.additionalDueCents,34100);
  await db.exec('reset role');await assert.rejects(db.exec('update private.tip_c2_cash set amount_cents=0'),/APPEND_ONLY/);await assert.rejects(db.exec('delete from private.tip_c2_operations'),/APPEND_ONLY/);
 }finally{await db.close();}
});

test('C2 tied Unicode IDs preserve the approved JavaScript order, independent of database collation',async()=>{const db=await c2db();try{await db.exec('reset role');const i=input('1.50',['😀','\ue000','Ä','Z']);const sql=(await db.query('select private.tip_finance_variant_c_candidate($1) result',[i])).rows[0].result;assert.deepEqual(normalize(sql),normalize(context.SilkVariantCPreview.preview(i)));const items=['staff:😀','staff:\ue000'].map(id=>({id,n:1,d:2}));assert.deepEqual((await db.query('select private.tip_c_allocate_whole($1,1) result',[items])).rows[0].result,{'staff:😀':1,'staff:\ue000':0});}finally{await db.close();}});
