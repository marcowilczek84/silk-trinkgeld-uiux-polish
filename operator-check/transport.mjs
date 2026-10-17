// Test adapter only. Shipped exclusively in the separate operator-check preview root.
// All SQL stays in IndexedDB on this browser. This is not a Supabase client.
import {PGlite} from '@electric-sql/pglite';
const target=SYNTHETIC_WORKSPACE,actor=SYNTHETIC_ACTOR;
const methods={tip_c2_ledger:['p_workspace_id','p_expected_revision','p_root_id'],tip_write_workspace_v14:['p_workspace_id','p_expected_revision','p_payload'],tip_c2_preview:['p_workspace_id','p_expected_revision','p_input','p_root_id'],tip_c2_finalize:['p_workspace_id','p_expected_revision','p_id','p_input','p_root_id','p_chain_revision','p_reason','p_cash_evidence'],tip_c2_confirm_cash:['p_workspace_id','p_expected_revision','p_id','p_root_id','p_chain_revision','p_receipt_id','p_kind','p_lines','p_evidence_ref']};
const message=text=>{const n=document.getElementById('operatorCheckState');if(n)n.textContent=text;};
const ready=(async()=>{
 if(location.hostname==='silk-trinkgeld-uiux-polish.vercel.app'||!['localhost','127.0.0.1'].includes(location.hostname)&&!location.hostname.endsWith('-restaurant-silk.vercel.app'))throw Error('Nur in der isolierten Test-Preview erlaubt.');
 if(!navigator.locks)throw Error('Dieser Browser unterstützt die sichere Testsperre nicht. Bitte einen aktuellen Browser verwenden.');
 return new Promise((resolve,reject)=>navigator.locks.request('silk-synthetic-operator-db',{ifAvailable:true},async lock=>{
  if(!lock){reject(Error('Der Bediencheck ist bereits in einem anderen Tab offen. Bitte diesen zuerst schliessen.'));return;}
  let db;
  try{
   const [wasm,bundle,fixture]=await Promise.all(['pglite.wasm','pglite.data','synthetic-fixture.tgz'].map(async file=>{const r=await fetch(file);if(!r.ok)throw Error('Testdatei konnte nicht geladen werden.');return r.blob();}));
   const initialized=localStorage.getItem('silk-operator-db-initialized-v1')==='yes';
   db=await PGlite.create({dataDir:'idb://silk-operator-check-a5df93a4-v1',...(initialized?{}:{loadDataDir:fixture}),fsBundle:bundle,pgliteWasmModule:await WebAssembly.compile(await wasm.arrayBuffer())});
   const valid=(await db.query('select payload from tip_workspace_state where workspace_id=$1',[target])).rows[0];if(!valid)throw Error('Synthetischer Teststand fehlt.');
   localStorage.setItem('silk-operator-db-initialized-v1','yes');
   localStorage.setItem('silk_workspace_connection_v1',JSON.stringify({id:target,name:'BEDIENCHECK · NUR TESTDATEN'}));
   message('Bereit. Alle Bestätigungen betreffen ausschliesslich Testdaten auf diesem Gerät.');resolve(db);
   await new Promise(done=>addEventListener('pagehide',()=>{db.close().finally(done);},{once:true}));
  }catch(e){reject(e);if(db)await db.close();}
 })).catch(e=>{message(e.message);throw e;});
})();
let queue=Promise.resolve();
function query(task){const p=queue.then(async()=>{try{const db=await ready;const data=await db.transaction(async tx=>{await tx.exec('set local role authenticated');await tx.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify({sub:actor,role:'authenticated'}),JSON.stringify({'x-silk-client-protocol':'4'})]);return task(tx);});return {data,error:null};}catch(e){return {data:null,error:{message:e.message,code:e.code||'TEST_ERROR'}};}});queue=p.then(()=>{});p.single=()=>p;return p;}
window.SilkSupabase={create(){return {
 auth:{async getSession(){await ready;return {data:{session:{user:{id:actor}}},error:null};}},
 from(name){if(name!=='tip_workspace_state')throw Error('Only synthetic workspace state is supported');return {select(){return {eq(field,id){if(field!=='workspace_id'||id!==target)throw Error('Synthetic workspace only');return {maybeSingle:()=>query(async tx=>(await tx.query('select * from tip_workspace_state where workspace_id=$1',[target])).rows[0]||null)};}};}};},
 rpc(name,args){return query(async tx=>{if(!Object.hasOwn(methods,name)||args.p_workspace_id!==target)throw Error('Unknown synthetic RPC');const composite=name==='tip_write_workspace_v14'||name==='tip_c2_finalize',keys=methods[name],params=keys.map((_,i)=>'$'+(i+1)).join(',');const r=await tx.query(composite?`select r.* from public.${name}(${params}) r`:`select public.${name}(${params}) result`,keys.map(k=>args[k]??null));return composite?r.rows[0]:r.rows[0].result;});},
 channel(){const channel={on(){return channel;},subscribe(){return channel;},unsubscribe(){}};return channel;}
};}};
addEventListener('silk:sync-complete',()=>{
 const saved=window.SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v4-c2');
 setTimeout(()=>{if(saved)window.restoreSavedCalculation(saved.id);else{window.saveCurrentDraft();window.calculate();document.getElementById('saveCalculationButton').click();}},250);
},{once:true});
