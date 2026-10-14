import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-helper.mjs';
const plain = x => JSON.parse(JSON.stringify(x));
const shifts = [{name:'F1',f:1,s:0,color:'#ddd'},{name:'SP1',f:0,s:1,color:'#ddd'},{name:'MD',f:.35,s:.65,color:'#ddd'}];
function fixture(w, staff=['Test A','Test B']) {
 w.SilkLocalRepository.applyCloudSnapshot({staff,shifts,settlements:[],work:{activeId:null,checkpoint:null,calculation:null},state:{mode:'day',singleDate:'2026-10-01',periodStart:'2026-10-01',periodEnd:'2026-10-01',byDate:{
  '2026-10-01':{f:'100',s:'0',assignments:staff.map(name=>({name,shift:'F1'}))},
  '2026-09-30':{f:'50.25',s:'0',assignments:staff.map(name=>({name,shift:'F1'}))}
 }}});
}
function rename(w,kind,index,label) {
 w.openSettings();w.openEditor(kind);
 const nodes=w.document.querySelectorAll(kind==='staff'?'#employeeEditor input':'#shiftEditorRows [data-field=name]');
 nodes[index].value=label;return kind==='staff'?w.saveEmployees():w.saveShifts();
}
function amounts(w) {
 assert.equal(w.calculate(),true);
 return plain(w.SilkCalculatedNumbers.lines.map(({name,amount,payout,days})=>({name,amount,payout,...(days===undefined?{}:{days})})));
}
function stored(w){return Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));}
function close(ctx){assert.deepEqual(ctx.errors,[]);ctx.dom.window.close();}

test('F01: rename keeps stable staff keys, visible/hidden assignments and exact payouts',async()=>{
 const c=await app(),w=c.window;fixture(w);const before=amounts(w),days=plain(w.SilkLocalRepository.getState().byDate);
 assert.equal(rename(w,'staff',0,'Test A umbenannt'),true);
 assert.deepEqual(plain(w.SilkLocalRepository.getState().byDate),days);assert.deepEqual(amounts(w),before);
 assert.match(w.document.querySelector('#result').textContent,/Test A umbenannt/);close(c);
});
test('F02: rename keeps stable shift keys and a valid calculation with identical payouts',async()=>{
 const c=await app(),w=c.window;fixture(w);const before=amounts(w),days=plain(w.SilkLocalRepository.getState().byDate);
 assert.equal(rename(w,'shifts',0,'Frühdienst'),true);
 assert.deepEqual(plain(w.SilkLocalRepository.getState().byDate),days);assert.deepEqual(amounts(w),before);
 const select=w.document.querySelector('#days select');assert.equal(select.value,'F1');assert.equal(select.selectedOptions[0].textContent,'FRÜHDIENST');close(c);
});
test('Emily rename retains the same cap and all other shares',async()=>{
 const c=await app(),w=c.window;fixture(w,['Emily','Test B']);const before=amounts(w);assert.equal(before[0].amount,10);
 rename(w,'staff',0,'Emily Beispiel');assert.deepEqual(amounts(w),before);close(c);
});
test('labels and stable keys survive reload and cloud document roundtrip',async()=>{
 const c=await app(),w=c.window;fixture(w);rename(w,'staff',0,'Neue Anzeige');rename(w,'shifts',0,'FRUEH');const before=amounts(w),doc=plain(w.SilkLocalRepository.document()),storage=stored(w);close(c);
 const b=await app(storage);assert.deepEqual(amounts(b.window),before);assert.equal(b.window.SilkIdentity.staffLabel('Test A'),'Neue Anzeige');close(b);
 const d=await app();d.window.SilkLocalRepository.applyDocument(doc);assert.deepEqual(amounts(d.window),before);assert.equal(d.window.SilkIdentity.shiftLabel('F1'),'FRUEH');close(d);
});
test('legacy v4 data without labels remains readable and financial results are unchanged',async()=>{
 const c=await app({'silk_staff':JSON.stringify(['Test A','Test B']),'silk_shifts':JSON.stringify(shifts),'silk_v12_data':JSON.stringify({version:4,mode:'day',singleDate:'2026-10-01',byDate:{'2026-10-01':{f:'100',s:'0',assignments:[{name:'Test A',shift:'F1'},{name:'Test B',shift:'F1'}]}}})});
 assert.deepEqual(amounts(c.window).map(x=>x.payout),[34,34,29,3]);close(c);
});
test('new staff and shifts receive unique IDs; removing a row cannot rename its neighbour',async()=>{
 const c=await app(),w=c.window;fixture(w);w.openSettings();w.openEditor('staff');w.addEmployee();w.addEmployee();w.document.querySelectorAll('#employeeEditor input')[2].value='Unbenutzt';w.document.querySelectorAll('#employeeEditor input')[3].value='Neu';w.removeEmployee(2);assert.equal(w.saveEmployees(),true);
 const key=w.SilkLocalRepository.getStaff().find(x=>x.startsWith('staff-'));assert.ok(key);assert.equal(w.SilkIdentity.staffLabel(key),'Neu');
 w.openEditor('shifts');w.addShift();w.document.querySelectorAll('#shiftEditorRows [data-field=name]')[3].value='NEU';assert.equal(w.saveShifts(),true);assert.ok(w.SilkLocalRepository.getShifts()[3].name.startsWith('shift-'));close(c);
});
test('saved and finalized records remain byte-identical after both renames',async()=>{
 const c=await app(),w=c.window;fixture(w);w.saveCurrentDraft();const draft=plain(w.SilkLocalRepository.getSettlements()[0]);w.calculate();w.saveCurrentCalculation();
 w.SilkLocalRepository.saveSettlements([...w.SilkLocalRepository.getSettlements(),{...draft,id:'older-draft'}]);const archives=JSON.stringify(w.SilkLocalRepository.getSettlements());
 rename(w,'staff',0,'Neuer Name');rename(w,'shifts',0,'NEUER DIENST');assert.equal(JSON.stringify(w.SilkLocalRepository.getSettlements()),archives);
 assert.equal(w.SilkLocalRepository.getWork().calculation,null);close(c);
});
test('older draft restores inputs but retains current names, added staff and added shifts',async()=>{
 const c=await app(),w=c.window;fixture(w);const before=amounts(w);w.saveCurrentDraft();const saved=plain(w.SilkLocalRepository.getSettlements()[0]);
 rename(w,'staff',0,'Neuer Name');rename(w,'shifts',0,'FRUEH');w.openEditor('staff');w.addEmployee();w.document.querySelector('.editrow:last-child input').value='Zusätzlich';w.saveEmployees();
 w.openEditor('shifts');w.addShift();w.document.querySelector('.shift-edit:last-child [data-field=name]').value='ZUSATZ';w.saveShifts();
 const catalog={staff:plain(w.SilkLocalRepository.getStaff()),shifts:plain(w.SilkLocalRepository.getShifts()),labels:plain(w.SilkLocalRepository.getStaffLabels())};
 w.SilkLocalRepository.saveWork({activeId:null,checkpoint:w.SilkWorkflow.snapshot(),calculation:null});w.continueDraft(saved.id);
 assert.deepEqual(plain(w.SilkLocalRepository.getStaff()),catalog.staff);assert.deepEqual(plain(w.SilkLocalRepository.getShifts()),catalog.shifts);assert.deepEqual(plain(w.SilkLocalRepository.getStaffLabels()),catalog.labels);
 assert.equal(w.SilkWorkflow.isDirty(),false);assert.deepEqual(amounts(w),before);assert.deepEqual(plain(w.SilkLocalRepository.getSettlements()[0]),saved);close(c);
});
for(const reason of ['missing-staff','missing-shift','weight-change'])test('stale draft is blocked without mutations: '+reason,async()=>{
 const c=await app(),w=c.window;fixture(w);w.saveCurrentDraft();const saved=w.SilkLocalRepository.getSettlements()[0];
 const doc=plain(w.SilkLocalRepository.document());if(reason==='missing-staff')doc.staff=['Test B'];else if(reason==='missing-shift')doc.shifts=doc.shifts.filter(x=>x.name!=='F1');else doc.shifts[0]={...doc.shifts[0],f:.5,s:.5};
 w.SilkLocalRepository.applyDocument(doc);const before=JSON.stringify(w.SilkLocalRepository.document());let message='';w.alert=m=>message=m;
 assert.equal(w.continueDraft(saved.id),false);assert.ok(message.length);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);close(c);
});
test('discard input changes does not revert renamed or extended master lists',async()=>{
 const c=await app(),w=c.window;fixture(w);w.saveCurrentDraft();rename(w,'staff',0,'Aktueller Name');
 w.document.getElementById('f_2026-10-01').value='200';w.changeDay('2026-10-01');w.setMode('period');w.document.querySelector('#unsavedDialog [data-choice=discard]').click();
 assert.equal(w.SilkIdentity.staffLabel('Test A'),'Aktueller Name');assert.equal(w.SilkLocalRepository.getState().byDate['2026-10-01'].f,'100');close(c);
});
for(const kind of ['staff','shifts'])test('referenced '+kind+' cannot be deleted, including hidden days',async()=>{
 const c=await app(),w=c.window;fixture(w);w.openSettings();w.openEditor(kind);const before=JSON.stringify(w.SilkLocalRepository.document());
 if(kind==='staff')w.removeEmployee(0);else w.removeShift(0);assert.equal(kind==='staff'?w.saveEmployees():w.saveShifts(),false);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);close(c);
});
test('unknown legacy assignments survive rendering/reload and block unsafe calculation',async()=>{
 const c=await app(),w=c.window;fixture(w);const doc=plain(w.SilkLocalRepository.document());doc.days['2026-10-01'].assignments={'Missing employee':'OLD SHIFT'};w.SilkLocalRepository.applyDocument(doc);
 assert.equal(w.calculate(),false);assert.equal(w.SilkLocalRepository.getState().byDate['2026-10-01'].assignments.find(a=>a.name==='Missing employee').shift,'OLD SHIFT');w.buildVisibleDays();assert.match(w.days.textContent,/Zuordnung prüfen/);close(c);
});
test('concurrent remote catalogue change rejects stale editor without overriding either list',async()=>{
 const c=await app(),w=c.window;fixture(w);w.openSettings();w.openEditor('staff');w.document.querySelector('#employeeEditor input').value='Local edit';
 w.SilkLocalRepository.applyCloudSnapshot({staffLabels:{'Test A':'Remote edit'}});const before=JSON.stringify(w.SilkLocalRepository.document());assert.equal(w.saveEmployees(),false);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);assert.equal(w.document.querySelector('#employeeEditor input').value,'Local edit');close(c);
});
test('storage failure rolls back rename and retains entered form values',async()=>{
 const c=await app(),w=c.window;fixture(w);const before=JSON.stringify(w.SilkLocalRepository.document());w.openSettings();w.openEditor('staff');w.document.querySelector('#employeeEditor input').value='Unsaved name';
 const original=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(){throw new w.DOMException('full','QuotaExceededError');};assert.equal(w.saveEmployees(),false);w.Storage.prototype.setItem=original;
 assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);assert.equal(w.document.querySelector('#employeeEditor input').value,'Unsaved name');close(c);
});
test('duplicate labels and blank labels are rejected without data changes',async()=>{
 const c=await app(),w=c.window;fixture(w);const before=JSON.stringify(w.SilkLocalRepository.document());assert.equal(rename(w,'staff',0,'Test B'),false);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);
 w.document.querySelector('#employeeEditor input').value=' ';assert.equal(w.saveEmployees(),false);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);close(c);
});
test('imports resolve current display labels and original stable keys consistently',async()=>{
 const c=await app(),w=c.window;fixture(w);rename(w,'staff',0,'Aktuelle Person');rename(w,'shifts',0,'FRUEH');assert.equal(w.SilkIdentity.resolveStaff('Aktuelle Person'),'Test A');assert.equal(w.SilkIdentity.resolveStaff('Test A'),'Test A');assert.equal(w.SilkIdentity.resolveShift('FRUEH'),'F1');assert.equal(w.SilkIdentity.resolveShift('F1'),'F1');close(c);
});
test('duplicate import aliases are rejected instead of merging two assignments',async()=>{
 const c=await app(),w=c.window;fixture(w);rename(w,'staff',0,'Aktuelle Person');assert.throws(()=>w.SilkIdentity.resolveAssignments([{name:'Test A',shift:'F1'},{name:'Aktuelle Person',shift:'SP1'}]),/mehrfach/);close(c);
});
test('rename does not round or change existing unusual shift weights',async()=>{
 const c=await app(),w=c.window;fixture(w);const next=plain(shifts);next[2].f=.123456789123;next[2].s=1-next[2].f;w.SilkLocalRepository.applyCloudSnapshot({shifts:next});rename(w,'shifts',2,'MITTEL');const actual=w.SilkLocalRepository.getShifts()[2];assert.equal(actual.f,next[2].f);assert.equal(actual.s,next[2].s);close(c);
});
test('two-client merge keeps a rename and an independent duty change',async()=>{
 const c=await app(),w=c.window;fixture(w);const base=plain(w.SilkLocalRepository.document());rename(w,'staff',0,'Aktuelle Person');const local=plain(w.SilkLocalRepository.document()),remote=plain(base);remote.days['2026-09-30'].assignments['Test A']='MD';const merged=w.SilkSyncMerge.merge(base,local,remote);assert.equal(merged.conflicts.length,0);w.SilkLocalRepository.applyDocument(merged.value);assert.equal(w.SilkIdentity.staffLabel('Test A'),'Aktuelle Person');assert.equal(w.SilkLocalRepository.getState().byDate['2026-09-30'].assignments.find(a=>a.name==='Test A').shift,'MD');close(c);
});
test('legacy checkpoint without optional labels does not become dirty on reload',async()=>{
 const c=await app(),w=c.window;fixture(w);w.saveCurrentDraft();const storage=stored(w),doc=JSON.parse(storage.silk_document_v2);delete doc.work.checkpoint.staffLabels;for(const item of doc.settlements)delete item.inputSnapshot.staffLabels;storage.silk_document_v2=JSON.stringify(doc);close(c);const b=await app(storage);assert.equal(b.window.SilkWorkflow.isDirty(),false);close(b);
});
test('ambiguous import reports a visible error in preview and leaves assignments intact',async()=>{
 const c=await app({}, {withImport:true}),w=c.window;fixture(w);rename(w,'staff',0,'Aktuelle Person');w.saveCurrentDraft();
 w.document.querySelector('.silk-import-row').click();const payload={v:1,type:'silk-tip',rows:[['2026-10-02',100,0]],schedule:[['2026-10-02','Test A','F1'],['2026-10-02','Aktuelle Person','SP1']]};
 w.document.getElementById('silk-qr-text').value=JSON.stringify(payload);w.document.getElementById('silk-qr-paste').click();const before=JSON.stringify(w.SilkLocalRepository.document());w.document.getElementById('silk-import-apply').click();
 const error=w.document.getElementById('silk-import-error');assert.match(error.textContent,/mehrfach/);assert.equal(error.closest('.hidden'),null);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);close(c);
});
