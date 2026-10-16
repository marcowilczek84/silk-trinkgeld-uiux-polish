import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-helper.mjs';
import {documentFor,input} from './c2-db-helper.mjs';
const storage=w=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
const change=(w,date,amount)=>{w.document.getElementById('f_'+date).value=amount;w.changeDay(date);};
const dateChange=(w,date)=>{w.singleDate.value=date;w.singleDate.onchange();};
const open=w=>!!w.document.querySelector('#unsavedDialog[open]');
function fixture(w){w.SilkLocalRepository.applyDocument(documentFor(input('1000',['A'])));w.saveCurrentDraft();}

test('saved inputs: opening period and changing dates never invent unsaved work',async()=>{
 const a=await app(),w=a.window;try{fixture(w);const saved=JSON.stringify(w.SilkLocalRepository.getSettlements());
 w.setMode('day');assert.equal(w.SilkWorkflow.isDirty(),false);w.setMode('period');assert.equal(w.SilkWorkflow.isDirty(),false);
 w.periodEndDay.value='2';w.updatePeriodFromParts();assert.equal(open(w),false);assert.equal(w.periodEnd.value,'2035-01-02');assert.equal(w.SilkWorkflow.isDirty(),false);
 w.setMode('day');dateChange(w,'2035-01-03');dateChange(w,'2035-01-01');assert.equal(open(w),false);assert.equal(w.SilkWorkflow.isDirty(),false);assert.equal(w.document.getElementById('f_2035-01-01').value,'1000');assert.equal(JSON.stringify(w.SilkLocalRepository.getSettlements()),saved);
 const b=await app(storage(w));try{assert.equal(b.window.SilkWorkflow.isDirty(),false);assert.equal(b.window.singleDate.value,'2035-01-01');}finally{b.window.close();}assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('empty period navigation and fully reverted new inputs stay clean',async()=>{
 const a=await app(),w=a.window;try{w.setMode('period');w.periodEndDay.value='1';w.updatePeriodFromParts();assert.equal(open(w),false);w.setMode('day');dateChange(w,'2035-01-01');
 change(w,'2035-01-01','12');assert.equal(w.SilkWorkflow.isDirty(),true);change(w,'2035-01-01','');assert.equal(w.SilkWorkflow.isDirty(),false);
 dateChange(w,'2035-01-02');assert.equal(open(w),false);assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('real amount and duty edits remain guarded; reverting or saving clears the guard',async()=>{
 const a=await app(),w=a.window;try{fixture(w);w.setMode('day');
 change(w,'2035-01-01','1001');dateChange(w,'2035-01-02');assert.equal(open(w),true);assert.equal(w.singleDate.value,'2035-01-01');w.document.querySelector('[data-choice=back]').click();
 change(w,'2035-01-01','1000');assert.equal(w.SilkWorkflow.isDirty(),false);
 const shift=w.document.querySelector('#day_2035-01-01 select[data-name="A"]'),original=shift.value;shift.value='';w.changeDay('2035-01-01');assert.equal(w.SilkWorkflow.isDirty(),true);shift.value=original;w.changeDay('2035-01-01');assert.equal(w.SilkWorkflow.isDirty(),false);
 change(w,'2035-01-01','1002');dateChange(w,'2035-01-02');w.document.querySelector('[data-choice=save]').click();assert.equal(open(w),false);assert.equal(w.singleDate.value,'2035-01-02');dateChange(w,'2035-01-01');assert.equal(open(w),false);assert.equal(w.SilkWorkflow.isDirty(),false);assert.equal(w.document.getElementById('f_2035-01-01').value,'1002');assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('discard and confirmed clear remove the guard without altering saved receipts',async()=>{
 const a=await app(),w=a.window;try{fixture(w);w.setMode('day');const saved=JSON.stringify(w.SilkLocalRepository.getSettlements());change(w,'2035-01-01','999');dateChange(w,'2035-01-02');w.document.querySelector('[data-choice=discard]').click();dateChange(w,'2035-01-01');assert.equal(open(w),false);assert.equal(w.document.getElementById('f_2035-01-01').value,'1000');
 w.confirmClearPeriod();assert.equal(w.SilkWorkflow.isDirty(),false);dateChange(w,'2035-01-02');assert.equal(open(w),false);assert.equal(JSON.stringify(w.SilkLocalRepository.getSettlements()),saved);assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('cloud-free preview explicitly disables finalization without attempting a server request',async()=>{
 const a=await app({}, {c2:true}),w=a.window;try{w.SILK_SUPABASE_CONFIG.localOnly=true;fixture(w);w.calculate();let requests=0;w.SilkSyncService.c2Request=async()=>{requests++;throw Error('unexpected server call');};
 const dialog=await w.SilkC2UI.openFinalization();assert.match(dialog.textContent,/endgültige Abschluss ist hier deaktiviert/);assert.doesNotMatch(dialog.textContent,/benötigt eine Verbindung|Internetverbindung/);assert.equal(dialog.querySelector('form'),null);assert.equal(requests,0);assert.equal(w.SilkC2.writesEnabled(),false);await assert.rejects(w.SilkC2.preview(),/deaktiviert/);assert.equal(requests,0);
 w.SilkSyncStatus.set('offline');assert.match(w.document.getElementById('silkSyncStatus').textContent,/Endgültiger Abschluss.*deaktiviert/);w.SilkSyncStatus.set('conflict','Konflikt prüfen');assert.equal(w.document.getElementById('silkSyncStatus').textContent,'Konflikt prüfen');assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('zero rounding has no missing cash warning; review and payout confirmation remain required',async()=>{
 const a=await app({}, {c2:true}),w=a.window;try{fixture(w);w.calculate();assert.equal(w.SilkCalculatedNumbers.roundingAdjustmentCents,0);assert.match(w.finalizationStatus.textContent,/CHF 0.00 · kein Kassenausgleich erforderlich/);assert.doesNotMatch(w.finalizationStatus.textContent,/Kein bestätigter Kassenausgleich/);assert.match(w.finalizationStatus.textContent,/Auszahlung noch nicht bestätigt/);
 w.SilkC2.preview=async()=>({input:w.SilkWorkflow.snapshot(),candidate:w.SilkCalculatedNumbers,cashReconciliationDueCents:0});const dialog=await w.SilkC2UI.openFinalization();assert.equal(dialog.querySelector('[type=text]'),null);const ack=dialog.querySelector('[type=checkbox]');assert.equal(ack.required,true);assert.equal(ack.checked,false);assert.equal(dialog.querySelector('[type=submit]').disabled,true);assert.match(dialog.textContent,/Auszahlung muss separat bestätigt/);assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
