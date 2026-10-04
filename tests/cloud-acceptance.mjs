// Run explicitly against the isolated release workspace; never against business data.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {app} from './app-helper.mjs';
const config=JSON.parse(await readFile(new URL('../.env.test.json',import.meta.url),'utf8'));
assert.equal(config.workspace_id,'39192f45-10de-4bf8-8e52-969b65916182','Acceptance tests may only reset the isolated synthetic release workspace');
const sessionsFile=new URL('../.env.test-clients.json',import.meta.url);
let saved={};try{saved=JSON.parse(await readFile(sessionsFile,'utf8'));}catch{}
const log=[];const contexts=[];let completed=false;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function context(name,storage={}) {
 const ctx=await app(storage),w=ctx.window,network={offline:false};
 const client=createClient(config.url,config.key,{global:{fetch:(url,options)=>network.offline?Promise.reject(new TypeError('Simulated network disconnect')):fetch(url,{...options,signal:AbortSignal.timeout(15000)})},auth:{storage:w.localStorage,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
 if(saved[name]){const {error}=await client.auth.setSession(saved[name]);assert.ifError(error);}
 else {const {data,error}=await client.auth.signInAnonymously();assert.ifError(error);saved[name]={access_token:data.session.access_token,refresh_token:data.session.refresh_token};await writeFile(sessionsFile,JSON.stringify(saved),{mode:0o600});
 const paired=await client.rpc('tip_redeem_pairing_code',{p_code:config.code,p_device_installation_id:w.SilkLocalRepository.getDeviceId(),p_device_name:'Automatischer Abnahmeclient '+name});assert.ifError(paired.error);}
 w.SilkLocalRepository.saveWorkspace({id:config.workspace_id,name:'Release-Abnahme'});w.SilkSupabase={create:()=>client};await w.SilkSyncService.init();
 contexts.push({...ctx,client,name,network});return contexts.at(-1);
}
async function flush(c){
 await c.window.SilkSyncService.syncNow();const until=Date.now()+45000;
 while(Date.now()<until){
  if(c.window.SilkLocalRepository.getConflicts().length)throw Error(c.name+' conflict: '+JSON.stringify(c.window.SilkLocalRepository.getConflicts().map(x=>x.path)));
  const repo=c.window.SilkLocalRepository;if(c.window.SilkSyncStatus.get()==='synced'&&c.window.SilkSyncMerge.equal(repo.document(),repo.getSyncMeta().base))return;
  await sleep(250);if(c.window.SilkSyncStatus.get()!=='pending')await c.window.SilkSyncService.syncNow();
 }
 throw Error('Sync did not acknowledge '+c.name+': '+c.window.SilkSyncStatus.get());
}

async function remote(c){const {data,error}=await c.client.from('tip_workspace_state').select('payload,revision').eq('workspace_id',config.workspace_id).single();assert.ifError(error);return data;}
function type(c,date,early,late,shift){const w=c.window;const row=w.document.getElementById('day_'+date);assert.ok(row,date);for(const [prefix,value] of [['f',early],['s',late]])if(value!==undefined){const input=w.document.getElementById(prefix+'_'+date);input.value=value;input.dispatchEvent(new w.Event('input',{bubbles:true}));}if(shift!==undefined){const input=row.querySelector('select[data-name="Marco Wilczek"]');input.value=shift;input.dispatchEvent(new w.Event('change',{bubbles:true}));}}
const pass=(id,detail)=>{log.push({id,result:'PASS',detail});console.log(id+': PASS — '+detail);};
try {
 const A=await context('A');await flush(A);
 const empty=A.window.SilkLocalRepository.document();empty.days={};empty.settlements={};empty.work={activeId:null,checkpoint:null,calculation:null};empty.period={mode:'day',singleDate:'2026-09-01',periodStart:'2026-09-01',periodEnd:'2026-09-03'};A.window.SilkLocalRepository.applyDocument(empty);await flush(A);
 const B=await context('B');await flush(B);
 assert.notEqual((await A.client.auth.getUser()).data.user.id,(await B.client.auth.getUser()).data.user.id);
 const w=A.window;w.setPeriodRange('2026-09-01','2026-09-03');w.setMode('period');type(A,'2026-09-01','12.40','0','F1');type(A,'2026-09-02','20.25','0','F1');w.document.querySelector('.draft-actions button').click();await flush(A);await flush(B);
 const id=w.SilkLocalRepository.getWork().activeId;B.window.continueDraft(id);await flush(B);
 assert.equal(B.window.document.getElementById('f_2026-09-01').value,'12.40');assert.equal(B.window.document.getElementById('f_2026-09-02').value,'20.25');assert.equal(B.window.periodEnd.value,'2026-09-03');assert.equal(B.window.document.getElementById('day_2026-09-03').dataset.status,'neutral');
 pass('A','A speichert Teilentwurf; getrennter authentifizierter Client B lädt dieselben Werte, Zeitraum, Zuordnungen und Status.');
 type(B,'2026-09-02','31.15',undefined);B.window.saveCurrentDraft();await flush(B);await flush(A);assert.equal(A.window.document.getElementById('f_2026-09-02').value,'31.15');assert.equal(A.window.SilkLocalRepository.getSettlements().length,1);assert.equal(A.window.SilkLocalRepository.getWork().activeId,id);
 pass('B','Änderung aus B kommt mit gleicher Entwurfs-ID in A an.');
 const storage=Object.fromEntries(Object.keys(A.window.localStorage).map(k=>[k,A.window.localStorage.getItem(k)]));await A.window.SilkSyncService.stop();await A.client.removeAllChannels();A.window.close();
 const R=await context('A',storage);await flush(R);R.window.continueDraft(id);assert.equal(R.window.document.getElementById('f_2026-09-02').value,'31.15');assert.equal(R.window.periodStart.value,'2026-09-01');assert.equal(R.window.SilkWorkflow.isDirty(),false);
 pass('C','Vollständiger Client-Neustart und Wiederöffnen erhalten Teilentwurf samt Zeitraum und Zuordnungen.');
 type(R,'2026-09-03','0','0');assert.equal(R.window.SilkWorkflow.isDirty(),true);assert.equal(R.window.calculate(),true);assert.match(R.window.workStatus.textContent,/Ungespeicherte/);R.window.saveCurrentDraft();assert.equal(R.window.SilkWorkflow.isDirty(),false);await flush(R);
 pass('D','Bearbeitung und Neuberechnung zeigen ungespeicherte Änderungen; bewusstes Speichern bestätigt aktuellen Entwurf.');
 R.window.calculate();R.window.saveCurrentCalculation();await flush(R);await flush(B);const final=(await remote(B)).payload.settlements[id];assert.equal(final.dataFormat,'final-v2');assert.equal(Object.keys((await remote(B)).payload.settlements).length,1);assert.equal(final.resultData.total,43.55);B.window.openSavedCalculations();assert.match(B.window.savedCalculations.textContent,/Finalisiert/);
 pass('E','Bewusste Finalisierung wird mit gleicher Identität atomar als finale Abrechnung auf B sichtbar.');
 // Independent concurrent edits use the last acknowledged base, not last-writer-wins.
 type(R,'2026-09-01','14.40',undefined);type(B,'2026-09-02','35.15',undefined);await Promise.all([flush(R),flush(B)]);await flush(R);await flush(B);let shared=(await remote(R)).payload;assert.equal(shared.days['2026-09-01'].f,'14.40');assert.equal(shared.days['2026-09-02'].f,'35.15');
 pass('F','Zeitnahe Änderungen an verschiedenen Tagen aus A und B bleiben beide erhalten.');
 type(R,'2026-09-01','15.40',undefined);type(B,'2026-09-01','16.40',undefined);await Promise.all([R.window.SilkSyncService.syncNow(),B.window.SilkSyncService.syncNow()]);let conflictClient;const conflictDeadline=Date.now()+45000;while(Date.now()<conflictDeadline){conflictClient=[R,B].find(c=>c.window.SilkLocalRepository.getConflicts().length);if(conflictClient)break;await sleep(250);}assert.ok(conflictClient,'No visible conflict after both concurrent requests completed');const conflict=conflictClient.window.SilkLocalRepository.getConflicts()[0];assert.ok([conflict.local,conflict.remote].includes('15.40'));assert.ok([conflict.local,conflict.remote].includes('16.40'));assert.equal(conflictClient.window.SilkSyncStatus.get(),'conflict');
 pass('G','Gleichzeitiger Widerspruch am selben Betrag erzeugt sichtbaren Konflikt; beide Werte sind erhalten.');
 conflictClient.window.document.querySelector('#silkConflictPanel [data-choice=remote]').click();await flush(conflictClient);await flush(R);await flush(B);
 const C=await context('C');await flush(C);assert.equal(C.window.document.getElementById('f_2026-09-02').value,'35.15');assert.equal(C.window.SilkLocalRepository.getSettlements()[0].dataFormat,'final-v2');
 pass('H','Dritter neu verbundener Client lädt den aktuellen gemeinsamen Stand und das finale Ergebnis.');
 // Simulate network absence in the existing offline contract; no browser claims.
 R.network.offline=true;Object.defineProperty(R.window.navigator,'onLine',{value:false,configurable:true});type(R,'2026-09-03','1.10','0','F1');await R.window.SilkSyncService.syncNow();assert.equal(R.window.SilkSyncStatus.get(),'offline');type(B,'2026-09-02','36.15',undefined);await flush(B);
 R.network.offline=false;Object.defineProperty(R.window.navigator,'onLine',{value:true,configurable:true});await flush(R);await flush(B);shared=(await remote(B)).payload;assert.equal(shared.days['2026-09-03'].f,'1.10');assert.equal(shared.days['2026-09-02'].f,'36.15');
 pass('I','Bestehender Offline-Pfad hält Eingaben lokal; Wiederverbindung bewahrt eigene und zwischenzeitliche fremde Änderungen.');

 // Staff/shift administration and deletions travel through the same shared revision.
 R.window.openSettings();R.window.openEditor('staff');R.window.addEmployee();R.window.employeeEditor.querySelector('.editrow:last-child input').value='SILK Abnahme Mitarbeiter';R.window.saveEmployees();await flush(R);await flush(B);assert.ok(B.window.SilkLocalRepository.getStaff().includes('SILK Abnahme Mitarbeiter'));
 B.window.openSettings();B.window.openEditor('staff');const staffInput=[...B.window.employeeEditor.querySelectorAll('input')].find(x=>x.value==='SILK Abnahme Mitarbeiter');staffInput.value='SILK Abnahme Geändert';B.window.saveEmployees();await flush(B);await flush(R);assert.ok(R.window.SilkLocalRepository.getStaff().includes('SILK Abnahme Geändert'));
 B.window.openEditor('shifts');B.window.addShift();B.window.shiftEditorRows.querySelector('.shift-edit:last-child [data-field=name]').value='TEST';B.window.saveShifts();await flush(B);await flush(R);assert.ok(R.window.SilkLocalRepository.getShifts().some(x=>x.name==='TEST'));
 R.window.openEditor('staff');R.window.removeEmployee(R.window.SilkLocalRepository.getStaff().indexOf('SILK Abnahme Geändert'));R.window.saveEmployees();R.window.openEditor('shifts');R.window.removeShift(R.window.SilkLocalRepository.getShifts().findIndex(x=>x.name==='TEST'));R.window.saveShifts();await flush(R);await flush(B);assert.ok(!B.window.SilkLocalRepository.getStaff().includes('SILK Abnahme Geändert'));assert.ok(!B.window.SilkLocalRepository.getShifts().some(x=>x.name==='TEST'));
 R.window.saveCurrentDraft();await flush(R);await flush(B);const deletedId=R.window.SilkLocalRepository.getWork().activeId;R.window.deleteDraft(deletedId);await flush(R);await flush(B);assert.ok(!B.window.SilkLocalRepository.getSettlements().some(x=>x.id===deletedId));
 pass('J','Mitarbeiter hinzufügen/ändern/löschen, Dienst hinzufügen/löschen und Entwurf löschen sind auf dem jeweils anderen Client vorhanden.');
 const legacyWrite=await R.client.from('tip_days').insert({workspace_id:config.workspace_id,business_date:'2035-01-01',early_amount:1,late_amount:0});assert.equal(legacyWrite.error?.code,'40001');
 pass('Übergang','Ein alter Client kann nach Übernahme des gemeinsamen Stands keine still abweichenden Legacy-Daten mehr schreiben.');
 // The member access predicate must reject another workspace and an unpaired session.
 const outsider=createClient(config.url,config.key,{global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(15000)})},auth:{persistSession:false,autoRefreshToken:false}});const signed=await outsider.auth.signInAnonymously();assert.ifError(signed.error);const access=await outsider.from('tip_workspace_state').select('workspace_id').eq('workspace_id',config.workspace_id);assert.ifError(access.error);assert.equal(access.data.length,0);await outsider.removeAllChannels();
 pass('RLS','Ein angemeldeter, aber nicht verbundener Client kann den Test-Workspace nicht lesen.');
 assert.ok(contexts.every(c=>!c.errors.length),JSON.stringify(contexts.map(c=>c.errors)));
 completed=true;
} finally {
 await writeFile(new URL('../cloud-acceptance-results.json',import.meta.url),JSON.stringify({testedAt:new Date().toISOString(),completed,releaseGate:'NOT_VERIFIED — browser acceptance remains required',environment:'Separate JSDOM application clients with independent Supabase sessions and local storage; real isolated Supabase workspace. Not a browser/device visual test.',workspace:config.workspace_id,results:log},null,2));
 for(const c of contexts){await c.window.SilkSyncService.stop();await c.client.removeAllChannels();c.client.auth.stopAutoRefresh();c.window.close();}
}
