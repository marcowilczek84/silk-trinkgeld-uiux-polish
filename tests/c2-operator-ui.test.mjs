import test from 'node:test';import assert from 'node:assert/strict';
import {app} from './app-helper.mjs';import {c2db,input,store,row,target} from './c2-db-helper.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
async function connected(){
 const db=await c2db();await store(db,input('1801.10',['A']));
 const a=await app({}, {c2:true,c2LocalTest:true,url:'http://127.0.0.1:55441'}),w=a.window;
 w.SilkLocalRepository.saveWorkspace({id:target});w.SilkLocalRepository.applyDocument((await row(db)).payload);
 const keys={tip_write_workspace_v14:['p_workspace_id','p_expected_revision','p_payload'],tip_c2_preview:['p_workspace_id','p_expected_revision','p_input','p_root_id'],tip_c2_finalize:['p_workspace_id','p_expected_revision','p_id','p_input','p_root_id','p_chain_revision','p_reason','p_cash_evidence'],tip_c2_ledger:['p_workspace_id','p_expected_revision','p_root_id'],tip_c2_confirm_cash:['p_workspace_id','p_expected_revision','p_id','p_root_id','p_chain_revision','p_receipt_id','p_kind','p_lines','p_evidence_ref']};
 const channel={on(){return this;},subscribe(){return this;},unsubscribe(){}};
 const client={auth:{getSession:async()=>({data:{session:{}}})},channel:()=>channel,from:()=>({select(){return this;},eq(){return this;},async maybeSingle(){return {data:await row(db)};}}),rpc(name,args){const execute=async()=>{try{assert.ok(keys[name],name);const composite=name==='tip_write_workspace_v14'||name==='tip_c2_finalize',r=await db.query(`select ${composite?'r.*':'r as result'} from ${name}(${keys[name].map((_,i)=>'$'+(i+1)).join(',')}) r`,keys[name].map(k=>args[k]===undefined?null:plain(args[k])));return {data:composite?r.rows[0]:r.rows[0].result};}catch(error){return {error};}};return {single:execute,then:(yes,no)=>execute().then(yes,no)};}};
 w.SilkSupabase={create:()=>client};await w.SilkSyncService.init();return {...a,db};
}
test('C2 operator forms require explicit evidence, record actual cash separately and leave original receipt unchanged',async()=>{
 const a=await connected(),w=a.window;try{
  w.saveCurrentDraft();w.calculate();await w.SilkSyncService.syncNow();const dialog=await w.SilkC2UI.openFinalization(),form=dialog.querySelector('form');
  assert.ok(form);assert.equal(form.checkValidity(),false);assert.equal(dialog.querySelector('[type=checkbox]').checked,false);assert.match(dialog.textContent,/Abrundung/);
  dialog.querySelector('[type=text]').value='SYNTHETIC-OPERATOR-REMAINDER';dialog.querySelector('[type=checkbox]').checked=true;
  await form.onsubmit({preventDefault(){}});assert.match(form.textContent,/Abschluss gespeichert/);
  const receipt=Object.values((await row(a.db)).payload.settlements).find(x=>x.dataFormat==='final-v4-c2'),bytes=JSON.stringify(receipt);assert.equal(receipt.paymentStatus,'not-confirmed');
  w.restoreSavedCalculation(receipt.id);const archive=w.document.getElementById('archiveDialog');await w.SilkC2UI.renderLedger(archive,receipt);
  [...archive.querySelectorAll('button')].find(x=>x.textContent==='Auszahlung bestätigen').click();const payment=archive.querySelector('form');assert.equal(payment.checkValidity(),false);
  payment.querySelector('[type=text]').value='SYNTHETIC-OPERATOR-PAID';payment.querySelector('[type=checkbox]').checked=true;await payment.onsubmit({preventDefault(){}});
  assert.match(archive.textContent,/Berechnete Auszahlung vollständig bestätigt/);const ledger=await w.SilkC2.ledger(receipt.id);assert.equal(ledger.confirmations.length,1);assert.equal(JSON.stringify((await row(a.db)).payload.settlements[receipt.id]),bytes);assert.deepEqual(a.errors,[]);
 }finally{await w.SilkSyncService.stop();w.close();await a.db.close();}
});
test('C2 application release flag is independent of server approval and cannot authorize a missing role',async()=>{
 const a=await app({}, {c2:true}),w=a.window;try{
  const permissions={enabled:true,syntheticOnly:false,canFinalize:true,canConfirmCash:true};assert.equal(w.SilkC2.permitted(permissions,'canFinalize'),false);
  w.SILK_SUPABASE_CONFIG.c2AppApproved=true;assert.equal(w.SilkC2.permitted(permissions,'canFinalize'),true);
  assert.equal(w.SilkC2.permitted({...permissions,enabled:false},'canFinalize'),false);assert.equal(w.SilkC2.permitted({...permissions,canFinalize:false},'canFinalize'),false);assert.equal(w.SilkC2.permitted({...permissions,syntheticOnly:true},'canFinalize'),false);
 }finally{w.close();}
});
