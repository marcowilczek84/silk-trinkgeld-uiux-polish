import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';

async function app() {
  const root=new URL('../',import.meta.url);
  let html=await readFile(new URL('index.html',root),'utf8');
  for (const file of ['storage-models.js','local-repository.js','sync-status.js','cloud-repository.js','legacy-migration.js','sync-service.js','silk-v11.js','silk-v12.js','silk-v13.js','draft-workflow.js']) {
    const source=await readFile(new URL(file,root),'utf8');
    html=html.replace(new RegExp(`<script src="${file.replace('.','\\.')}(?:\\?[^\"]*)?">\\s*</script>`),`<script>${source}</script>`);
  }
  html=html.replace(/<script src="jsQR[^>]*><\/script><script src="silk-import[^>]*><\/script>/,'');
  const errors=[],virtualConsole=new VirtualConsole(); virtualConsole.on('jsdomError',error=>errors.push(error));
  const dom=new JSDOM(html,{url:'https://draft-test.invalid/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole});
  dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  dom.window.confirm=()=>true;
  return {dom,window:dom.window,errors};
}

test('draft is separate, restores only selected period, and clearing leaves other data',async()=>{
  const {dom,window:w,errors}=await app();
  const repo=w.SilkLocalRepository;
  w.singleDate.value='2026-09-23'; w.setMode('day');
  const early=w.document.querySelector('[aria-label="Trinkgeld Frühdienst"]');
  early.value='42.50'; early.dispatchEvent(new w.Event('input',{bubbles:true}));
  w.document.querySelector('#day_2026-09-23 select').value='F1'; w.saveState();
  const before=repo.getState();
  repo.saveState({...before,byDate:{...before.byDate,'2026-09-22':{f:'9',s:'1',assignments:[]}}});
  w.saveCurrentDraft();
  const draft=repo.getSettlements().find(x=>x.dataFormat==='draft-v1');
  assert.ok(draft?.cloudId);
  assert.equal(draft.inputSnapshot.byDate['2026-09-23'].f,'42.50');
  assert.equal(draft.inputSnapshot.byDate['2026-09-22'],undefined);
  assert.ok(draft.inputSnapshot.staff.length && draft.inputSnapshot.shifts.length);
  w.confirmClearPeriod();
  assert.equal(repo.getState().byDate['2026-09-23'].f,'');
  assert.ok(repo.getState().byDate['2026-09-23'].assignments.every(item=>!item.shift));
  assert.equal(repo.getState().byDate['2026-09-22'].f,'9');
  assert.equal(repo.getSettlements().find(x=>x.id===draft.id)?.id,draft.id);
  w.continueDraft(draft.id);
  assert.equal(repo.getState().byDate['2026-09-23'].f,'42.50');
  w.openSavedCalculations();
  assert.match(w.document.getElementById('savedCalculations').textContent,/Entwürfe/);
  assert.match(w.document.getElementById('savedCalculations').textContent,/Gespeicherte Abrechnungen/);
  w.deleteDraft(draft.id);
  assert.equal(repo.getSettlements().filter(x=>x.dataFormat==='draft-v1').length,0);
  assert.deepEqual(errors.map(x=>x.message),[]);
  dom.window.close();
});
