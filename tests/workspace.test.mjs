import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-helper.mjs';
import {fixture} from './workspace-fixture.mjs';
const tick=()=>new Promise(resolve=>{setTimeout(resolve,0);});
const json=value=>JSON.parse(JSON.stringify(value));
async function setup(withWorkspace=true){const a=await app({}, {withWorkspace});a.window.SilkLocalRepository.applyCloudSnapshot(json(fixture));await tick();return a;}

test('workspace projection preserves exact calculation, source HTML and input snapshot for day and period',async()=>{
 const before=await setup(false),after=await setup();
 try{for(const period of [false,true]){
  for(const a of [before,after]){if(period){const f=json(fixture);f.state.mode='period';f.state.periodEnd='2026-10-02';a.window.SilkLocalRepository.applyCloudSnapshot(f);}assert.equal(a.window.calculate(),true);}
  await tick();
  assert.deepEqual(json(after.window.SilkCalculatedNumbers),json(before.window.SilkCalculatedNumbers));
  assert.equal(after.window.document.getElementById('result').innerHTML,before.window.document.getElementById('result').innerHTML);
  assert.deepEqual(json(after.window.SilkWorkflow.snapshot()),json(before.window.SilkWorkflow.snapshot()));
  assert.equal(after.window.document.querySelectorAll('.workspace-table tbody tr').length,after.window.SilkCalculatedNumbers.lines.length);
  const payouts=[...after.window.document.querySelectorAll('.workspace-payout')].map(x=>x.textContent);
  assert.deepEqual(payouts,json(after.window.SilkCalculatedNumbers.lines.map(x=>x.payout===null?'Gesperrt':after.window.chf(x.payout))));
 }}finally{before.window.close();after.window.close();}
});

test('workspace navigation and search have no data writes; filtered rename keeps all IDs and assignments',async()=>{
 const a=await setup(),w=a.window;try{
  const initial=JSON.stringify(w.SilkLocalRepository.document());
  w.document.querySelector('[data-workspace=staff]').click();await tick();
  const search=w.document.querySelector('#staffEditor .workspace-search input');search.value='Alex';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(w.document.querySelectorAll('#employeeEditor .editrow:not([hidden])').length,1);
  assert.equal(JSON.stringify(w.SilkLocalRepository.document()),initial);
  w.document.querySelector('#employeeEditor .editrow input').value='Alex Neu';assert.equal(w.saveEmployees(),true);await tick();
  assert.deepEqual(json(w.SilkLocalRepository.getStaff()),fixture.staff);
  assert.deepEqual(json(w.SilkLocalRepository.getState().byDate),fixture.state.byDate);
  assert.equal(w.SilkIdentity.staffLabel('qa-alex'),'Alex Neu');
 }finally{w.close();}
});

test('workspace refresh keeps finalized archive bytes unchanged and repeated finalization idempotent',async()=>{
 const a=await setup(),w=a.window;try{
  w.SilkLocalRepository.saveSettlements([{id:'legacy',dataFormat:'final-v2',html:'Historical receipt'}]);w.calculate();await tick();await w.saveCurrentCalculation();const archives=JSON.stringify(w.SilkLocalRepository.getSettlements());
  w.document.querySelector('[data-workspace=entry]').click();w.document.querySelector('[data-workspace=settlement]').click();await tick();await w.saveCurrentCalculation();
  assert.equal(JSON.stringify(w.SilkLocalRepository.getSettlements()),archives);
  assert.equal(w.document.querySelectorAll('#workspaceSettlement script').length,0);
  assert.equal(w.SilkLocalRepository.getSettlements()[0].html,'Historical receipt');
 }finally{w.close();}
});

test('workspace active search does not bypass stale editor conflict protection',async()=>{
 const a=await setup(),w=a.window;try{
  w.document.querySelector('[data-workspace=shifts]').click();await tick();
  const search=w.document.querySelector('#shiftEditor .workspace-search input');search.value='F1';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.querySelector('#shiftEditorRows [data-field=name]').value='FRÜH';
  const remote=json(fixture.shifts);remote[1].label='ABEND';w.SilkLocalRepository.applyCloudSnapshot({shifts:remote});await tick();
  assert.equal(w.saveShifts(),false);assert.match(w.document.querySelector('.editor-error').textContent,/inzwischen geändert/);
  assert.deepEqual(json(w.SilkLocalRepository.getShifts()),remote);
 }finally{w.close();}
});

test('workspace pending updates are safe after document teardown',async()=>{
 const a=await setup();a.window.calculate();a.window.close();await tick();
});
