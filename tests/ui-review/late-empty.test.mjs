import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from '../app-helper.mjs';
import {documentFor,input} from '../c2-db-helper.mjs';
const plain=x=>JSON.parse(JSON.stringify(x));
const day='2035-01-01';
const stored=w=>Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));
function fixture(w,late=''){const i=input('100',['A']);i.byDate[day].s=late;w.SilkLocalRepository.applyDocument(documentFor(i));}
function edit(w,field,value){w.document.getElementById(field+'_'+day).value=value;w.changeDay(day);}

test('early 100 with blank late equals explicit zero, including draft save and reload',async()=>{
 const a=await app({}, {c2:true}),w=a.window;let second;try{
 fixture(w,'0');assert.equal(w.calculate(),true);const expected=plain(w.SilkCalculatedNumbers),expectedDays=plain(w.SilkLocalRepository.document().days);
 fixture(w);assert.equal(w.document.getElementById('s_'+day).value,'');assert.equal(w.calculate(),true);assert.deepEqual(plain(w.SilkCalculatedNumbers),expected);assert.deepEqual(plain(w.SilkLocalRepository.document().days),expectedDays);
 assert.equal(w.SilkWorkflow.validateDay(w.SilkLocalRepository.getState().byDate[day]).key,'complete');w.saveCurrentDraft();const draft=w.SilkLocalRepository.getSettlements()[0];assert.equal(draft.inputSnapshot.byDate[day].s,'0');assert.equal(w.SilkWorkflow.isDirty(),false);
 second=await app(stored(w),{c2:true});const b=second.window;assert.equal(b.SilkWorkflow.isDirty(),false);assert.equal(b.calculate(),true);assert.deepEqual(plain(b.SilkCalculatedNumbers),expected);assert.deepEqual(plain(b.SilkLocalRepository.document().days),expectedDays);assert.deepEqual(a.errors,[]);assert.deepEqual(second.errors,[]);
 }finally{second?.window.close();w.close();}
});
test('untouched days, missing early amount and missing duty still block the period',async()=>{
 const a=await app({}, {c2:true}),w=a.window;try{
 fixture(w);edit(w,'f','');assert.equal(w.calculate(),false);assert.equal(w.SilkLocalRepository.getState().byDate[day].s,'');
 w.document.querySelector('#day_'+day+' select[data-name="A"]').value='';w.changeDay(day);assert.equal(w.SilkWorkflow.validateDay(w.SilkLocalRepository.getState().byDate[day]).key,'neutral');assert.equal(w.calculate(),false);
 edit(w,'f','100');assert.equal(w.calculate(),false);assert.match(w.calculationError.textContent,/Frühdienst prüfen/);
 fixture(w);w.SilkLocalRepository.saveState({...w.SilkLocalRepository.getState(),mode:'period',periodEnd:'2035-01-02'});w.loadState();assert.equal(w.calculate(),false);assert.match(w.calculationError.textContent,/2035-01-02 · Nicht bearbeitet/);
 assert.equal(w.SilkLocalRepository.getState().byDate['2035-01-02'].s,'');assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('real late edits and reversions retain draft guard; archives are untouched',async()=>{
 const a=await app({}, {c2:true}),w=a.window;try{
 fixture(w);w.saveCurrentDraft();const archive={id:'synthetic-historical',dataFormat:'final-v2',html:'SYNTHETIC UNCHANGED',inputSnapshot:{byDate:{'2030-01-01':{f:'40',s:''}}}};w.SilkLocalRepository.saveSettlements([...w.SilkLocalRepository.getSettlements(),archive]);const bytes=JSON.stringify(archive);
 edit(w,'s','25');assert.equal(w.SilkWorkflow.isDirty(),true);w.setMode('period');assert.ok(w.document.querySelector('#unsavedDialog[open]'));w.document.querySelector('[data-choice=back]').click();edit(w,'s','');assert.equal(w.SilkWorkflow.isDirty(),false);
 edit(w,'s','50');w.saveCurrentDraft();edit(w,'s','');assert.equal(w.SilkWorkflow.isDirty(),true);assert.equal(w.calculate(),true);assert.equal(w.SilkCalculatedNumbers.inputCents,10000);edit(w,'s','50');assert.equal(w.SilkWorkflow.isDirty(),false);assert.equal(w.SilkLocalRepository.getState().byDate[day].s,'50');
 assert.equal(JSON.stringify(w.SilkLocalRepository.getSettlements().find(x=>x.id===archive.id)),bytes);assert.deepEqual(a.errors,[]);
 }finally{w.close();}
});
test('blank-as-zero input still detects a competing actual late change',async()=>{
 const a=await app({}, {c2:true}),w=a.window;try{
 fixture(w,'50');w.saveCurrentDraft();w.document.getElementById('s_'+day).value='';const remote=w.SilkLocalRepository.getState();remote.byDate[day].s='25';w.SilkLocalRepository.saveState(remote);
 assert.throws(()=>w.saveState(),/SILK_LOCAL_INPUT_CONFLICT/);assert.equal(w.document.getElementById('s_'+day).value,'');assert.equal(w.SilkLocalRepository.getState().byDate[day].s,'25');assert.equal(w.SilkWriteCoordinator.hasFailure(),true);
 }finally{w.close();}
});
