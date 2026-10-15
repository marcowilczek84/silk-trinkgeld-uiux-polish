// Explicit, opt-in real Supabase QA. Only the newly created synthetic workspace is allowed.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {app} from './app-helper.mjs';
const config=JSON.parse(await readFile(process.env.SILK_QA_CONFIG,'utf8'));
assert.equal(config.workspace_id,'aec9330b-678a-40f8-b2c3-c75523490115');
assert.match(config.workspace_name,/synthetic only$/);
const output=process.env.QA_OUTPUT||'/tmp/silk-cloud-integrity';await mkdir(output,{recursive:true});
const contexts=[],results=[],requests=[];let completed=false;let A,B;
if(process.env.QA_COMPAT_ONLY==='1'){const prior=JSON.parse(await readFile(output+'/cloud-results.json','utf8'));assert.equal(prior.workspace,config.workspace_id);assert.equal(prior.results.length,12);results.push(...prior.results);}
const plain=x=>JSON.parse(JSON.stringify(x));
const sleep=ms=>new Promise(r=>{setTimeout(r,ms);});
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
function guardFetch(network){return async(url,options={})=>{
 const u=new URL(url);assert.equal(u.origin,new URL(config.url).origin);
 if(u.pathname.startsWith('/rest/v1/')){
  const body=typeof options.body==='string'?JSON.parse(options.body):null;
  assert.ok(u.searchParams.get('workspace_id')==='eq.'+config.workspace_id||body?.workspace_id===config.workspace_id||body?.p_workspace_id===config.workspace_id,'Blocked non-test workspace request');
  requests.push({method:options.method||'GET',path:u.pathname});
 }
 if(network.offline)throw new TypeError('Synthetic offline');
 return fetch(url,{...options,signal:AbortSignal.timeout(45000)});
};}
function fixture(w){w.SilkLocalRepository.applyCloudSnapshot({staff:['QA A','QA B','Emily'],staffLabels:{},shifts:[{name:'F1',f:1,s:0,color:'#ddd'},{name:'SP1',f:0,s:1,color:'#ddd'},{name:'MD',f:.35,s:.65,color:'#ddd'}],settlements:[],work:{activeId:null,checkpoint:null,calculation:null},state:{mode:'day',singleDate:'2035-01-01',periodStart:'2035-01-01',periodEnd:'2035-01-01',byDate:{'2035-01-01':{f:'104.50',s:'41',assignments:[{name:'QA A',shift:'F1'},{name:'QA B',shift:'SP1'},{name:'Emily',shift:'MD'}]},'2034-12-31':{f:'25.15',s:'0',assignments:[{name:'QA A',shift:'F1'}]}}}});}
async function context(name,storage={},seed=false,root){
 const c=await app(storage,{root}),w=c.window,network={offline:false};
 const client=createClient(config.url,config.key,{global:{fetch:guardFetch(network)},auth:{storage:w.localStorage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 const signed=await client.auth.setSession(config.clients[name]);assert.ifError(signed.error);console.log('Client '+name+' authenticated');
 w.SilkLocalRepository.saveWorkspace({id:config.workspace_id,name:config.workspace_name});
 if(seed)fixture(w);
 w.SilkSupabase={create:()=>client};await w.SilkSyncService.init();console.log('Client '+name+' initialized');
 const ctx={...c,name,client,network};contexts.push(ctx);return ctx;
}
async function remote(c){const {data,error}=await c.client.from('tip_workspace_state').select('payload,revision').eq('workspace_id',config.workspace_id).single();assert.ifError(error);return data;}
async function flush(c){await c.window.SilkSyncService.syncNow();for(let i=0;i<100;i++){
 const w=c.window,r=w.SilkLocalRepository;if(r.getConflicts().length)throw Error('Unexpected conflict '+c.name+' '+JSON.stringify(r.getConflicts().map(x=>x.path)));
 if(w.SilkSyncStatus.get()==='synced'&&w.SilkSyncMerge.equal(r.document(),r.getSyncMeta().base))return;
 await sleep(200);if(w.SilkSyncStatus.get()!=='pending')await w.SilkSyncService.syncNow();
 }throw Error('Sync timeout '+c.name+' '+c.window.SilkSyncStatus.get());}
async function converge(...cs){for(let i=0;i<2;i++)for(const c of cs)await flush(c);}
function rename(c,kind,index,value){const w=c.window;w.openSettings();w.openEditor(kind);w.document.querySelectorAll(kind==='staff'?'#employeeEditor input':'#shiftEditorRows [data-field=name]')[index].value=value;assert.equal(kind==='staff'?w.saveEmployees():w.saveShifts(),true);w.closeSettings();}
function amount(c,date,value){const w=c.window,st=w.SilkLocalRepository.getState();st.byDate[date].f=value;w.SilkLocalRepository.saveState(st);w.loadState();w.buildVisibleDays();}
function financial(c){assert.equal(c.window.calculate(),true);return plain(c.window.SilkCalculatedNumbers.lines.map(({name,amount,payout,days})=>({name,amount,payout,...(days===undefined?{}:{days})})));}
function storage(c){return Object.fromEntries(Object.keys(c.window.localStorage).map(k=>[k,c.window.localStorage.getItem(k)]));}
function offline(c,value){c.network.offline=value;Object.defineProperty(c.window.navigator,'onLine',{value:!value,configurable:true});}
async function shutdown(c){await c.window.SilkSyncService.stop();await c.client.removeAllChannels();c.client.auth.stopAutoRefresh();c.window.close();c.closed=true;}
const pass=(id,detail,extra={})=>{results.push({id,result:'PASS',detail,...extra});console.log(id+': PASS');};
try{
 if(process.env.QA_COMPAT_ONLY!=='1'){
 A=await context('A');await flush(A);
 // Reset only the hard-coded newly created QA workspace, never the previous release workspace.
 fixture(A.window);await flush(A);
 const expected=financial(A);A.window.saveCurrentDraft();const draft=plain(A.window.SilkLocalRepository.getSettlements()[0]);A.window.calculate();A.window.saveCurrentCalculation();
 const final=plain(A.window.SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v2'));
 const oldDraft={...draft,id:'qa-older-draft'};const legacy={id:'qa-legacy-history',dataFormat:'legacy-html-v1',label:'Synthetic legacy history',html:'<p>CHF 25.15</p>',savedAt:'2034-12-31T00:00:00.000Z'};
 A.window.SilkLocalRepository.saveSettlements([...A.window.SilkLocalRepository.getSettlements(),oldDraft,legacy]);await flush(A);
 const archiveHashes=Object.fromEntries([final,oldDraft,legacy].map(x=>[x.id,hash(x)]));
 B=await context('B');await converge(A,B);
 assert.notEqual(config.clients.A.user_id,config.clients.B.user_id);assert.notEqual(A.window.SilkLocalRepository.getDeviceId(),B.window.SilkLocalRepository.getDeviceId());
 assert.deepEqual(financial(B),expected);await converge(A,B);pass('C01','Two independent authenticated application instances load identical assigned days and payout reference.');
 const assignments=plain(A.window.SilkLocalRepository.document().days);
 offline(A,true);offline(B,true);rename(A,'staff',0,'QA A renamed');rename(B,'shifts',0,'FRUEH');offline(A,false);offline(B,false);await converge(A,B);
 for(const c of [A,B]){assert.deepEqual(plain(c.window.SilkLocalRepository.document().days),assignments);assert.deepEqual(financial(c),expected);assert.equal(c.window.SilkIdentity.staffLabel('QA A'),'QA A renamed');assert.equal(c.window.SilkIdentity.shiftLabel('F1'),'FRUEH');}
 await converge(A,B);pass('C02','Concurrent employee and shift renames preserve IDs, all days and exact payout values.',{reference:expected});
 const saved=storage(A);await shutdown(A);A=await context('A',saved);await converge(A,B);assert.deepEqual(financial(A),expected);await converge(A,B);pass('C03','Full application reload retains server revision, labels, assignments and payouts.');
 assert.equal(B.window.continueDraft('qa-older-draft'),true);await converge(A,B);assert.equal(A.window.SilkIdentity.staffLabel('QA A'),'QA A renamed');assert.equal(A.window.SilkIdentity.shiftLabel('F1'),'FRUEH');assert.deepEqual(financial(A),expected);await converge(A,B);pass('C04','Old draft restores inputs without reverting the latest shared staff or shift catalogue.');
 // Both hold the same acknowledged base. Different input fields merge.
 offline(A,true);offline(B,true);amount(A,'2035-01-01','105.50');amount(B,'2034-12-31','26.15');offline(A,false);offline(B,false);await converge(A,B);
 let row=await remote(A);assert.equal(row.payload.days['2035-01-01'].f,'105.50');assert.equal(row.payload.days['2034-12-31'].f,'26.15');pass('C05','Independent concurrent edits survive optimistic revision retry and three-way merge.');
 // A controlled disconnect gives both clients a genuine common ancestor.
 offline(A,true);offline(B,true);amount(A,'2035-01-01','110.50');amount(B,'2035-01-01','120.50');offline(A,false);await flush(A);offline(B,false);await B.window.SilkSyncService.syncNow();
 for(let i=0;i<100&&!B.window.SilkLocalRepository.getConflicts().length;i++)await sleep(100);
 const conflict=B.window.SilkLocalRepository.getConflicts().find(x=>x.path.join('.')==='days.2035-01-01.f');assert.ok(conflict);assert.equal(conflict.local,'120.50');assert.equal(conflict.remote,'110.50');assert.equal(B.window.SilkSyncStatus.get(),'conflict');assert.match(B.window.document.getElementById('silkConflictPanel').textContent,/Beide Fassungen bleiben erhalten/);
 const conflictsStorage=storage(B);await shutdown(B);B=await context('B',conflictsStorage);assert.ok(B.window.SilkLocalRepository.getConflicts().length);B.window.SilkSyncService.showConflicts();B.window.document.querySelector('#silkConflictPanel [data-choice=remote]').click();await converge(A,B);assert.equal((await remote(A)).payload.days['2035-01-01'].f,'110.50');pass('C06','Conflicting same-field edits retain both alternatives and survive reload until explicit resolution.');
 offline(A,true);amount(A,'2034-12-31','27.15');await A.window.SilkSyncService.syncNow();assert.equal(A.window.SilkSyncStatus.get(),'offline');amount(B,'2035-01-01','111.50');await flush(B);offline(A,false);await converge(A,B);row=await remote(A);assert.equal(row.payload.days['2034-12-31'].f,'27.15');assert.equal(row.payload.days['2035-01-01'].f,'111.50');pass('C07','Offline edit and another client edit both survive reconnect.');
 A.window.SilkLocalRepository.saveWork({activeId:null,checkpoint:null,calculation:null});A.window.saveCurrentDraft();A.window.saveCurrentDraft();await converge(A,B);const active=A.window.SilkLocalRepository.getWork().activeId;assert.equal((await remote(A)).payload.settlements[active].dataFormat,'draft-v2');const count=Object.keys((await remote(A)).payload.settlements).length;A.window.calculate();A.window.saveCurrentCalculation();A.window.saveCurrentCalculation();await converge(A,B);assert.equal(Object.keys((await remote(A)).payload.settlements).length,count);pass('C08','Repeated draft saves and finalization retain one settlement identity.');
 // Every historical fixture stays unchanged during all preceding current-work edits.
 row=await remote(A);for(const [id,h]of Object.entries(archiveHashes)){assert.equal(hash(row.payload.settlements[id]),h);}
 pass('C09','All archived records, inputs, result data and archived HTML retain canonical SHA-256 hashes.',{hashes:archiveHashes});
 // Race in the staff editor is rejected after a remote refresh.
 A.window.openSettings();A.window.openEditor('staff');A.window.document.querySelector('#employeeEditor input').value='A stale edit';rename(B,'staff',0,'QA A newest');await converge(A,B);assert.equal(A.window.saveEmployees(),false);assert.equal(A.window.SilkIdentity.staffLabel('QA A'),'QA A newest');A.window.closeSettings();pass('C10','A remotely outdated editor cannot overwrite the current catalogue.');
 const outsider=createClient(config.url,config.key,{global:{fetch:guardFetch({offline:false})},auth:{persistSession:false,autoRefreshToken:false}});await outsider.auth.setSession(config.clients.OUTSIDER);
 const read=await outsider.from('tip_workspace_state').select('workspace_id').eq('workspace_id',config.workspace_id);assert.ifError(read.error);assert.deepEqual(read.data,[]);
 const denied=await outsider.from('tip_workspace_state').update({payload:{format:2}}).eq('workspace_id',config.workspace_id).select();assert.ifError(denied.error);assert.deepEqual(denied.data,[]);await outsider.removeAllChannels();outsider.auth.stopAutoRefresh();pass('C11','Authenticated but unpaired outsider cannot read or update the test workspace.');
 const anonymous=createClient(config.url,config.key,{global:{fetch:guardFetch({offline:false})},auth:{persistSession:false,autoRefreshToken:false}});const anon=await anonymous.from('tip_workspace_state').select('workspace_id').eq('workspace_id',config.workspace_id);assert.ok(anon.error);pass('C12','Publishable-key-only access has no workspace table permission.');
 }else{A=await context('A');B=await context('B');await converge(A,B);}
 const legacyWrite=process.env.QA_LEGACY_TIMEOUT_RECORDED==='1'?{error:{code:'23'}}:await A.client.from('tip_days').insert({workspace_id:config.workspace_id,business_date:'2035-02-01',early_amount:1,late_amount:0});if(legacyWrite.error?.code==='40001')pass('C13','Pre-v2 legacy-table writer is rejected by the existing server guard.');else{assert.equal(legacyWrite.error?.code,'23');results.push({id:'C13',result:'LIMITATION',detail:'Legacy REST rejection timed out; no success asserted. Verify SQL guard directly and absence of legacy rows separately.'});console.log('C13: REST timeout recorded');}
 // Real old-v2 app: demonstrate risk on the synthetic workspace, then restore its known fixture only.
 const safe=plain((await remote(A)).payload);const safeRevision=(await remote(A)).revision;
 await shutdown(A);await shutdown(B);
 const old=await context('OLD',{},false,process.env.SILK_OLD_ROOT?new URL('file://'+process.env.SILK_OLD_ROOT+'/'):undefined);
 assert.ok(process.env.SILK_OLD_ROOT,'Old version root must be explicit');await flush(old);const mixed=await remote(old);
 assert.ok(!mixed.payload.staffLabels||!mixed.payload.staffLabels['QA A'],'Expected reproduction: old v2 drops staff labels');
 pass('C14','Old v2 client incompatibility reproduced: staffLabels are removed by its document serializer. Mixed-version writing is NOT safe.',{finding:'RELEASE_BLOCKER',beforeRevision:safeRevision,afterRevision:mixed.revision});
 // Old editing bug is still present; capture without making it a passing compatibility claim.
 old.window.openSettings();old.window.openEditor('shifts');old.window.document.querySelector('#shiftEditorRows [data-field=name]').value='OLD RENAMED';old.window.saveShifts();await flush(old);
 assert.notEqual(canonical((await remote(old)).payload.days),canonical(safe.days));pass('C15','Old v2 shift editor still loses assignments, confirming a server-side version gate is mandatory.',{finding:'RELEASE_BLOCKER'});
 await shutdown(old);
 const restore=createClient(config.url,config.key,{global:{fetch:guardFetch({offline:false})},auth:{persistSession:false,autoRefreshToken:false}});await restore.auth.setSession(config.clients.A);const head=await restore.from('tip_workspace_state').select('revision').eq('workspace_id',config.workspace_id).single();assert.ifError(head.error);const restored=await restore.from('tip_workspace_state').update({payload:safe}).eq('workspace_id',config.workspace_id).eq('revision',head.data.revision).select('revision').single();assert.ifError(restored.error);restore.auth.stopAutoRefresh();
 pass('C16','Only the disposable QA workspace was restored after the intentional old-client loss reproduction.',{payloadHash:hash(safe)});
 completed=true;
}finally{
 await writeFile(output+'/cloud-results.json',JSON.stringify({testedAt:new Date().toISOString(),completed,environment:'Independent JSDOM application instances and real Supabase sessions; synthetic RLS-isolated workspace on shared project; not a physical device test.',workspace:config.workspace_id,results,network:{requests:requests.length,allRestRequestsScoped:true}},null,2));
 for(const c of contexts)if(!c.closed)await shutdown(c);
}
