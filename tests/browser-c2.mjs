import {chromium,webkit} from 'playwright';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {harness} from './c2-http-harness.mjs';import {input,documentFor,target,member,second} from './c2-db-helper.mjs';
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium,out=resolve(process.env.QA_OUTPUT||'../evidence-c2/browser');await mkdir(out,{recursive:true});
const browser=await engine.launch({headless:true,executablePath:process.env.QA_EXECUTABLE,args:engine===chromium?['--no-sandbox','--disable-dev-shm-usage']:[]});const reports=[];
async function waitSync(page){await page.waitForFunction(()=>SilkLocalRepository.getSyncMeta().revision>0);for(let n=0;n<20;n++){if(await page.evaluate(()=>SilkSyncService.syncNow()))return;await page.waitForTimeout(100);}throw Error('Did not synchronize');}
try{for(const [width,height] of [[393,852],[1024,768],[1440,900]]){
 const h=await harness({port:55441}),contexts=[];try{
  const initial=input('1801.10',['A']);assert.equal((await h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload:documentFor(initial)})).status,200);
  async function device(user){const context=await browser.newContext({viewport:{width,height},hasTouch:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'});contexts.push(context);
   await context.route('**/*',route=>route.request().url().startsWith(h.origin)?route.continue():route.abort());
   await context.addInitScript(({token,user,target})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:user,aud:'authenticated',role:'authenticated'}}));localStorage.setItem('silk_workspace_connection_v1',JSON.stringify({id:target,name:'SYNTHETIC C2 ONLY'}));},{token:h.jwt(user),user,target});
   const page=await context.newPage();page.on('dialog',d=>d.accept(d.type()==='prompt'?'SYNTHETIC-BROWSER-REMAINDER':undefined));await page.goto(h.origin);await waitSync(page);return {context,page};}
  const a=await device(member),b=await device(second),errors=[],expectedOfflineNetworkErrors=[];let offlinePhase=false;const onError=e=>{if(offlinePhase&&e.message.includes('/rest/v1/tip_workspace_state?')&&e.message.endsWith('due to access control checks.'))expectedOfflineNetworkErrors.push(e.message);else errors.push(e.message);};a.page.on('pageerror',onError);b.page.on('pageerror',onError);
  // Actual UI projection + server comparison, both separately signed users.
  await a.page.evaluate(()=>{saveCurrentDraft();calculate();});await waitSync(a.page);
  const checked=await a.page.evaluate(async()=>{window.qaChecked=await SilkC2.preview();return qaChecked;});assert.equal(checked.candidate.payoutCents,180100);
  assert.equal(await a.page.locator('#saveCalculationButton').isDisabled(),true);
  await a.page.locator('[data-workspace=settlement]').click();
  assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await a.page.locator('#workspaceSettlement').getByText('C2-Kandidat:',{exact:false}).waitFor();
  await a.page.screenshot({path:out+'/'+width+'-candidate.png'});
  // A committed response is dropped; reload + persisted request ID recovers the same receipt.
  let dropped=false;await a.context.route('**/rest/v1/rpc/tip_c2_finalize',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
  await a.page.getByRole('button',{name:'Testabschluss simulieren'}).click();await a.page.waitForFunction(()=>document.querySelector('#c2ServerCheck [role=status]')?.textContent.includes('noch nicht bestätigt'));
  const pending=await a.page.evaluate(()=>JSON.parse(localStorage.getItem('silk_c2_pending_'+SilkLocalRepository.getWorkspace().id)));assert.ok(pending.id);
  await a.page.reload();await waitSync(a.page);const original=await a.page.evaluate(()=>SilkSyncService.resumeC2());assert.equal(original.id,pending.id);assert.equal(original.syntheticOnly,true);
  assert.equal(await a.page.evaluate(()=>SilkLocalRepository.getSettlements().filter(x=>x.dataFormat==='final-v4-c2').length),1);
  // Explicit synthetic actual-cash evidence, not inferred by finalization.
  const baseline=await a.page.evaluate(async original=>SilkC2.confirmCash({p_root_id:original.id,p_chain_revision:0,p_receipt_id:original.id,p_kind:'baseline',p_lines:original.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents})),p_evidence_ref:'SYNTHETIC-BROWSER-PAID'},SilkLocalRepository.getSyncMeta().revision),original);assert.equal(baseline.chainRevision,1);const ledger=await a.page.evaluate(root=>SilkC2.ledger(root),original.id);assert.equal(ledger.baselineConfirmed,true);assert.equal(ledger.confirmations.length,1);
  await a.page.evaluate(id=>{window.prompt=()=> 'Synthetic amount correction';createCorrectionDraft(id);},original.id);
  await a.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='1801.90';changeDay('2035-01-01');saveCurrentDraft();calculate();});await waitSync(a.page);
  const correction=await a.page.evaluate(async()=>{const c=await SilkC2.preview();return SilkC2.finalizeSynthetic(c,{adjustmentCents:20,kind:'funding',reference:'SYNTHETIC-BROWSER-FUNDING'});});assert.equal(correction.netCorrection.additionalDueCents,100);assert.equal(correction.netCorrection.overpaidCents,0);
  assert.deepEqual(await a.page.evaluate(id=>SilkLocalRepository.getSettlements().find(x=>x.id===id),original.id),original);
  await a.page.evaluate(id=>restoreSavedCalculation(id),correction.id);assert.equal(await a.page.locator('#archiveDialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);await a.page.screenshot({path:out+'/'+width+'-net-correction.png'});
  assert.match(await a.page.locator('#archiveDialog').textContent(),/TESTBELEG.*Nachzahlung offen CHF 1.00/s);await a.page.getByRole('button',{name:'Auszahlungsnachweise laden'}).click();await a.page.locator('.c2-ledger').getByText('SYNTHETIC-BROWSER-PAID',{exact:false}).first().waitFor();
  await a.page.locator('#archiveDialog button').first().click();await waitSync(b.page);
  // Independent devices go offline and conflict on the same field; reload preserves both alternatives.
  offlinePhase=true;await a.context.setOffline(true);await a.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='777';changeDay('2035-01-01');});
  await b.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='888';changeDay('2035-01-01');});await waitSync(b.page);
  await a.context.setOffline(false);await a.page.evaluate(()=>SilkSyncService.syncNow());await a.page.waitForFunction(()=>SilkLocalRepository.getConflicts().length>0);
  assert.equal(await a.page.evaluate(()=>SilkLocalRepository.getState().byDate['2035-01-01'].f),'777');await a.page.screenshot({path:out+'/'+width+'-conflict.png'});
  await a.page.reload();await a.page.waitForFunction(()=>SilkLocalRepository.getConflicts().length>0);assert.equal(await a.page.evaluate(()=>SilkLocalRepository.getState().byDate['2035-01-01'].f),'777');
  offlinePhase=false;assert.deepEqual(errors,[]);reports.push({width,height,serverPreview:'pass',realFinalizationLocked:'pass',lostResponseReloadReplay:'pass',netCorrection:'pass',immutableOriginal:'pass',twoSignedBrowserContexts:'pass',offlineConflictReload:'pass',horizontalOverflow:false,pageErrors:errors,expectedOfflineNetworkErrors});
 }finally{for(const c of contexts)await c.close();await h.close();}
}await writeFile(out+'/results.json',JSON.stringify({engine:process.env.QA_BROWSER||'chromium',transport:'test HTTP adapter -> PostgreSQL/WASM; not hosted Supabase',physicalDevices:false,reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();}
