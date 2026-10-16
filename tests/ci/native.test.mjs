import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import {connect,bootstrap,reset,concurrent,output,input,documentFor,target} from './native-helper.mjs';

test('C2 native Supabase isolated acceptance',async t=>{
 const h=await connect(),results=[];
 try{
  await bootstrap(h);const token=k=>h.users[k||'a'].session.access_token;
  const check=async(name,fn)=>t.test(name,async()=>{await reset(h);try{const details=await fn();results.push({name,status:'passed',...details});}catch(e){results.push({name,status:'failed',error:e.message.slice(0,900)});throw e;}finally{await writeFile(output()+'/native-results.json',JSON.stringify({postgres:h.version,transport:'real PostgREST + Auth + Realtime on native PostgreSQL',results},null,2));}});
  const preview=async(i,root=null)=>h.rpc('tip_c2_preview',{p_expected_revision:Number((await h.row()).revision),p_input:i,p_root_id:root},token());
  const finalArgs=async(i,extra={})=>({p_expected_revision:Number((await h.row()).revision),p_id:randomUUID(),p_input:i,...extra});
  const finish=async(i,extra={})=>{const args=await finalArgs(i,extra),r=await h.rpc('tip_c2_finalize',args,token());assert.equal(r.status,200,JSON.stringify(r.body));return {args,row:r.body,receipt:r.body.payload.settlements[args.p_id]};};
  const cashArgs=async(root,receipt,chain,kind,lines,ref=randomUUID())=>({p_expected_revision:Number((await h.row()).revision),p_id:randomUUID(),p_root_id:root,p_chain_revision:chain,p_receipt_id:receipt,p_kind:kind,p_lines:lines,p_evidence_ref:ref});
  const cash=async args=>{const r=await h.rpc('tip_c2_confirm_cash',args,token());assert.equal(r.status,200,JSON.stringify(r.body));return r.body;};

  await check('real Auth login, refresh, invalid JWT, RLS and separate operation rights',async()=>{
   assert.equal((await h.http('/auth/v1/user',{token:token()})).status,200);
   const refreshed=await h.http('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:h.users.b.session.refresh_token}});assert.equal(refreshed.status,200);console.log('::add-mask::'+refreshed.body.access_token);console.log('::add-mask::'+refreshed.body.refresh_token);h.users.b.session=refreshed.body;
   assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},'invalid.jwt')).status,401);
   assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},undefined)).status,401);
   assert.deepEqual((await h.http('/rest/v1/tip_workspace_state',{token:token('outsider')})).body,[]);
   assert.equal((await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},token('outsider'))).status,403);
   assert.equal((await h.rpc('tip_c2_finalize',await finalArgs(input()),token('editor'))).status,403);
   const denied=await h.http('/rest/v1/tip_c2_cash',{token:token()});assert.notEqual(denied.status,200);
   assert.equal((await h.admin.query("select has_table_privilege('authenticated','private.tip_c2_cash','select') allowed")).rows[0].allowed,false);
   await writeFile(output()+'/users.json',JSON.stringify(h.users),{mode:0o600});
  });
  await check('native JavaScript/PostgreSQL exact parity, boundary cases and Unicode ties',async()=>{
   const ctx=vm.createContext({});for(const p of ['financial-core.js','v14-prototypes/variant-c-allocation.js','v14-prototypes/variant-c-calculation-adapter.js'])vm.runInContext(await readFile(p,'utf8'),ctx);
   await h.admin.query(await readFile('v14-prototypes/variant-c-postgres-SYNTHETIC-ACCEPTANCE.sql','utf8'));
   const boundary=[0,1,10,49,50,51,99,100,101,149,150,199,100000,100001,100049,100050,100099,180110,180149,180150,180190,10000000];let seed=67;
   const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
   const norm=r=>JSON.parse(JSON.stringify({version:r.version,input:r.inputCents,payout:r.payoutCents,delta:r.roundingAdjustmentCents,categories:r.categories,lines:r.lines.map(x=>({id:x.id,payout:x.payoutCents,claim:x.claim}))}));
   for(let n=0;n<2028;n++){
    const i=input(((boundary[n]??next()%10000000)/100).toFixed(2),Array.from({length:n%3===0?30:n%3===1?14:2},(_,k)=>k===0?'Emily':'S'+String(k).padStart(2,'0')));
    i.shifts=[{name:'M',f:0.35,s:0.65},{name:'E',f:0.99999999,s:0.00000001},{name:'L',f:0.00000001,s:0.99999999}];const d=i.byDate['2035-01-01'];d.assignments=i.staff.map((name,k)=>({name,shift:i.shifts[k%3].name}));
    if(n>=boundary.length){d.s=(next()%50000/100).toFixed(2);if(n%5===0)i.byDate['2035-01-02']=structuredClone(d);}
    const sql=(await h.admin.query('select private.tip_finance_variant_c_candidate($1) result',[i])).rows[0].result;assert.deepEqual(norm(sql),norm(ctx.SilkVariantCPreview.preview(i)),'period '+n);
   }
   const unicode=input('1.50',['😀','\ue000','Ä','Z']);assert.deepEqual(norm((await h.admin.query('select private.tip_finance_variant_c_candidate($1) result',[unicode])).rows[0].result),norm(ctx.SilkVariantCPreview.preview(unicode)));
   return {parityPeriods:2028,unicodeTie:'passed'};
  });
  await check('two actual PostgREST transactions overlap: one stale write loses without data loss',async()=>{
   const docs=[documentFor(input('1000')),documentFor(input('2000'))];const {results:r,backendCount}=await concurrent(h,docs.map((p_payload,n)=>()=>h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload},token(n?'b':'a'))));
   assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(r.find(x=>x.status===409).body.code,'40001');assert.deepEqual((await h.row()).payload,r.find(x=>x.status===200).body.payload);return {nativeWaitingBackends:backendCount};
  });
  await check('concurrent duplicate finalization, retry after lost acknowledgement, immutable receipt',async()=>{
   const i=input('1000');await h.store(i,token());const args=await finalArgs(i);
   const {results:r,backendCount}=await concurrent(h,[()=>h.rpc('tip_c2_finalize',args,token()),()=>h.rpc('tip_c2_finalize',args,token('b'))]);assert.equal(r[0].status,200,JSON.stringify(r));assert.deepEqual(r[0],r[1]);
   const receipt=r[0].body.payload.settlements[args.p_id];assert.equal(receipt.paymentStatus,'not-confirmed');assert.equal(receipt.syntheticOnly,true);
   // The first response can be discarded; the exact same retry retrieves the original receipt.
   assert.deepEqual((await h.rpc('tip_c2_finalize',args,token())).body.payload.settlements[args.p_id],receipt);
   assert.equal((await h.admin.query('select count(*)::int n from private.tip_c2_operations')).rows[0].n,1);
   const duplicate=await h.rpc('tip_c2_finalize',{...args,p_id:randomUUID(),p_expected_revision:Number((await h.row()).revision)},token());assert.match(duplicate.body.message,/ALREADY_FINALIZED/);
   const forged=structuredClone((await h.row()).payload);forged.settlements[args.p_id].resultData.payoutCents=1;
   assert.match((await h.rpc('tip_write_workspace_v14',{p_expected_revision:Number((await h.row()).revision),p_payload:forged},token())).body.message,/FINALIZATION_REQUIRED/);
   delete forged.settlements[args.p_id];assert.match((await h.rpc('tip_write_workspace_v14',{p_expected_revision:Number((await h.row()).revision),p_payload:forged},token())).body.message,/ARCHIVE_PROTECTED/);
   assert.deepEqual((await h.row()).payload.settlements[args.p_id],receipt);return {nativeWaitingBackends:backendCount};
  });
  await check('net correction uses confirmed baseline; concurrent cash retry and stale chain are safe',async()=>{
   const i=input('1801.10',['A']);await h.store(i,token());const original=await finish(i,{p_cash_evidence:{adjustmentCents:-10,kind:'remainder',reference:'SYNTHETIC-BASE-ROUNDING'}});
   const changed=input('1801.90',['A']);await h.store(changed,token());assert.match((await preview(changed,original.args.p_id)).body.message,/UNVERIFIED_BASELINE/);
   const baseline=await cashArgs(original.args.p_id,original.args.p_id,0,'baseline',original.receipt.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents})));
   const {results:r,backendCount}=await concurrent(h,[()=>h.rpc('tip_c2_confirm_cash',baseline,token()),()=>h.rpc('tip_c2_confirm_cash',baseline,token('b'))]);assert.equal(r[0].status,200,JSON.stringify(r));assert.deepEqual(r[0],r[1]);
   const p=(await preview(changed,original.args.p_id)).body;assert.equal(p.netCorrection.netDeltaCents,100);assert.equal(p.cashReconciliationDueCents,20);
   const correction=await finish(changed,{p_root_id:original.args.p_id,p_chain_revision:1,p_reason:'Synthetic cents correction',p_cash_evidence:{adjustmentCents:20,kind:'funding',reference:'SYNTHETIC-NET-ROUNDING'}});
   const due=correction.receipt.netCorrection.lines.filter(x=>x.additionalDueCents).map(x=>({id:x.id,amountCents:x.additionalDueCents}));const payment=await cashArgs(original.args.p_id,correction.args.p_id,2,'payout',due);
   const paid=await cash(payment);assert.equal(paid.additionalDueCents,0);assert.deepEqual(await cash(payment),paid);
   const stale=await h.rpc('tip_c2_confirm_cash',{...payment,p_id:randomUUID(),p_evidence_ref:randomUUID()},token());assert.equal(stale.status,409);assert.match(stale.body.message,/STALE_REVISION/);
   const ledger=await h.rpc('tip_c2_ledger',{p_expected_revision:Number((await h.row()).revision),p_root_id:original.args.p_id},token());assert.equal(ledger.body.confirmations.length,2);
   assert.deepEqual((await h.row()).payload.settlements[original.args.p_id],original.receipt);return {nativeWaitingBackends:backendCount,additionalPayoutCents:100,additionalCashEvidenceCents:20};
  });
  await check('overpayment stays separate; concurrent competing cash requests cannot pay twice',async()=>{
   const i=input('1000',['A']);await h.store(i,token());const original=await finish(i);await cash(await cashArgs(original.args.p_id,original.args.p_id,0,'baseline',original.receipt.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents}))));
   const changed=input('1000',['A','B']);await h.store(changed,token());const correction=await finish(changed,{p_root_id:original.args.p_id,p_chain_revision:1,p_reason:'Synthetic shift correction'});assert.equal(correction.receipt.netCorrection.additionalDueCents,34100);assert.equal(correction.receipt.netCorrection.overpaidCents,34100);
   const args=await cashArgs(original.args.p_id,correction.args.p_id,2,'payout',[{id:'staff:B',amountCents:34100}]);
   const {results:r}=await concurrent(h,[()=>h.rpc('tip_c2_confirm_cash',args,token()),()=>h.rpc('tip_c2_confirm_cash',{...args,p_id:randomUUID(),p_evidence_ref:randomUUID()},token('b'))]);assert.deepEqual(r.map(x=>x.status).sort(),[200,409]);assert.equal(r.find(x=>x.status===200).body.overpaidCents,34100);
   const refund=await cash(await cashArgs(original.args.p_id,correction.args.p_id,3,'refund',[{id:'staff:A',amountCents:-100}]));assert.equal(refund.overpaidCents,34000);assert.equal(refund.additionalDueCents,0);
   await assert.rejects(h.admin.query('delete from private.tip_c2_cash'),/APPEND_ONLY/);await assert.rejects(h.admin.query('update private.tip_c2_operations set request=request'),/APPEND_ONLY/);
  });
  await check('membership and operator revocation apply even with an existing valid Auth token',async()=>{
   await h.admin.query('update private.tip_c2_operators set can_finalize=false,can_confirm_cash=false where actor=$1',[h.users.a.id]);
   assert.equal((await h.rpc('tip_c2_finalize',await finalArgs(input()),token())).status,403);
   assert.equal((await preview(input())).status,200);
   await h.admin.query('update public.tip_workspace_members set active=false where user_id=$1',[h.users.a.id]);
   assert.equal((await preview(input())).status,403);assert.deepEqual((await h.http('/rest/v1/tip_workspace_state',{token:token()})).body,[]);
   assert.equal((await h.http('/auth/v1/user',{token:token()})).status,200,'JWT remains valid while workspace rights are revoked');
  });
  await check('Realtime delivers actual committed revisions and filters revoked/outsider subscribers',async()=>{
   const good=h.client(token()),bad=h.client(token('outsider')),events=[],forbidden=[];
   const watch=(c,name,arr)=>new Promise((resolve,reject)=>{const ch=c.channel(name).on('postgres_changes',{event:'UPDATE',schema:'public',table:'tip_workspace_state',filter:'workspace_id=eq.'+target},p=>arr.push(p.new)).subscribe(s=>{if(s==='SUBSCRIBED')resolve(ch);if(['CHANNEL_ERROR','TIMED_OUT'].includes(s))reject(Error('Realtime '+name+' '+s));});});
   try{
    await good.realtime.setAuth(token());await bad.realtime.setAuth(token('outsider'));
    await Promise.all([watch(good,'synthetic-member',events),watch(bad,'synthetic-outsider',forbidden)]);
    const saved=await h.store(input('123'),token('b'));
    for(let n=0;n<100&&!events.some(x=>Number(x.revision)===Number(saved.revision));n++)await new Promise(r=>setTimeout(r,100));
    assert.ok(events.some(x=>Number(x.revision)===Number(saved.revision)),'Realtime must deliver committed database event');assert.equal(forbidden.length,0);
    await h.admin.query('update public.tip_workspace_members set active=false where user_id=$1',[h.users.a.id]);
    const next=await h.store(input('456'),token('b'));await new Promise(r=>setTimeout(r,1200));
    assert.ok(!events.some(x=>Number(x.revision)===Number(next.revision)),'revoked member must not receive later row');assert.equal(forbidden.length,0);
   }finally{await good.removeAllChannels();await bad.removeAllChannels();}
  });
  await check('rights revoked while an RPC waits for its row lock prevent the pending mutation',async()=>{
   const before=await h.row();
   const {results:r}=await concurrent(h,[()=>h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload:documentFor(input('999'))},token())],async()=>h.admin.query('update public.tip_workspace_members set active=false where user_id=$1',[h.users.a.id]));
   assert.equal(r[0].status,403,'queued write must recheck membership after acquiring its lock');
   assert.deepEqual((await h.row()).payload,before.payload);
  });
  await check('old client protocol, direct writes and legacy finalization remain blocked',async()=>{
   const before=await h.row();for(const protocol of [null,'2','3']){
    const r=await h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload:documentFor(input('999'))},token(),{protocol});assert.equal(r.status,403);assert.match(r.body.message,/UPDATE_REQUIRED/);
   }
   assert.equal((await h.http('/rest/v1/tip_workspace_state?workspace_id=eq.'+target,{method:'PATCH',token:token(),body:{payload:documentFor(input('999'))}})).status,403);
   assert.match((await h.rpc('tip_finalize_workspace_v14',await finalArgs(input()),token())).body.message,/ACCEPTANCE_REQUIRED/);
   await h.admin.query('delete from private.tip_c2_gate');assert.match((await h.rpc('tip_c2_finalize',await finalArgs(input()),token())).body.message,/ACCEPTANCE_REQUIRED/);assert.deepEqual((await h.row()).payload,before.payload);
  });
 }finally{await h.admin.end();}
});
