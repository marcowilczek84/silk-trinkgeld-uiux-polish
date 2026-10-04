import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-helper.mjs';
function fixture(w){w.SilkLocalRepository.saveState({mode:'period',singleDate:'2026-09-01',periodStart:'2026-09-01',periodEnd:'2026-09-03',byDate:{'2026-09-01':{f:'12.40',s:'0',assignments:[{name:'Marco Wilczek',shift:'F1'}]}}});w.loadState();}

test('partial draft restores exact inputs, staff, shifts and same identity after reload',async()=>{
 const {dom,window:w,errors}=await app();fixture(w);
 assert.equal(w.saveCurrentDraft(),true);const item=w.SilkLocalRepository.getSettlements()[0];
 assert.equal(item.dataFormat,'draft-v2');assert.equal(w.SilkWorkflow.isDirty(),false);
 w.document.getElementById('f_2026-09-01').value='13.15';w.changeDay('2026-09-01');assert.equal(w.SilkWorkflow.isDirty(),true);
 assert.equal(w.document.getElementById('sum_2026-09-01').textContent,'CHF 13.15');assert.equal(w.periodTotalAmount.textContent,'CHF 13.15');
 w.saveCurrentDraft();assert.equal(w.SilkLocalRepository.getSettlements().length,1);assert.equal(w.SilkLocalRepository.getSettlements()[0].id,item.id);
 const storage=Object.fromEntries(Object.keys(w.localStorage).map(k=>[k,w.localStorage.getItem(k)]));dom.window.close();
 const second=await app(storage),b=second.window;b.continueDraft(item.id);
 assert.equal(b.periodStart.value,'2026-09-01');assert.equal(b.periodEnd.value,'2026-09-03');assert.equal(b.document.getElementById('f_2026-09-01').value,'13.15');assert.equal(b.document.querySelector('#day_2026-09-01 select[data-name="Marco Wilczek"]').value,'F1');assert.equal(b.document.getElementById('f_2026-09-02').value,'');
 assert.deepEqual(errors,[]);assert.deepEqual(second.errors,[]);second.dom.window.close();
});

test('finalization rejects incomplete period; complete result preserves draft identity and dirty state',async()=>{
 const {dom,window:w,errors}=await app();fixture(w);w.saveCurrentDraft();const id=w.SilkLocalRepository.getSettlements()[0].id;
 assert.equal(w.calculate(),false);assert.match(w.calculationError.textContent,/2 Tag/);
 for(const date of ['2026-09-02','2026-09-03']){w.document.getElementById('f_'+date).value='0';w.document.getElementById('s_'+date).value='0';w.changeDay(date);}
 assert.equal(w.calculate(),true);assert.equal(w.SilkWorkflow.isDirty(),true);assert.equal(w.saveCalculationButton.textContent,'Abrechnung finalisieren');
 w.saveCurrentDraft();assert.equal(w.SilkWorkflow.isDirty(),false);w.calculate();w.saveCurrentCalculation();
 const final=w.SilkLocalRepository.getSettlements();assert.equal(final.length,1);assert.equal(final[0].id,id);assert.equal(final[0].dataFormat,'final-v2');assert.equal(final[0].resultData.total,12.4);
 assert.equal(w.saveCalculationButton.textContent,'Finalisiert');
 w.document.getElementById('f_2026-09-01').value='14.10';w.changeDay('2026-09-01');assert.equal(w.SilkWorkflow.isDirty(),true);assert.equal(w.saveCalculationButton.textContent,'Abrechnung finalisieren');
 assert.deepEqual(errors,[]);dom.window.close();
});

test('period navigation offers save discard back and editor cancel does not mutate staff',async()=>{
 const {dom,window:w,errors}=await app();fixture(w);w.setMode('day');assert.ok(w.document.querySelector('#unsavedDialog[open]'));w.document.querySelector('[data-choice=back]').click();assert.equal(w.document.body.dataset.mode,'period');
 w.openSettings();w.openEditor('staff');const before=w.SilkLocalRepository.getStaff();w.addEmployee();w.closeSettings();assert.ok(w.document.querySelector('#editorDecision[open]'));w.document.querySelector('#editorDecision [data-choice=discard]').click();assert.deepEqual(w.SilkLocalRepository.getStaff(),before);
 assert.deepEqual(errors,[]);dom.window.close();
});
