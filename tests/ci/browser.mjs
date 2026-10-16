// Actual built candidate -> real local Supabase APIs. Browser emulation, no devices.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {connect,reset,output,input,target} from './native-helper.mjs';
const h=await connect(),origin='http://127.0.0.1:55441',reports=[];
const server=createServer(async(req,res)=>{try{const base=resolve('dist'),p=resolve(base,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));assert.ok(p.startsWith(base+'/'));res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(55441,'127.0.0.1',r));const browser=await chromium.launch({headless:true});
async function waitSync(page){await page.waitForFunction(()=>SilkLocalRepository.getSyncMeta().revision>0);for(let n=0;n<25;n++){if(await page.evaluate(()=>SilkSyncService.syncNow()))return;await page.waitForTimeout(100);}throw Error('Native server synchronization not confirmed');}
try{
 for(const [width,height] of [[393,852],[1024,768],[1440,900]]){
  await reset(h);await h.store(input('1801.10',['A']),h.users.a.session.access_token);const contexts=[];
  try{
   async function device(k){const context=await browser.newContext({viewport:{width,height},hasTouch:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'});contexts.push(context);
    await context.route('**/*',r=>[origin,h.cfg.api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
    await context.addInitScript(({session,target})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(session));localStorage.setItem('silk_workspace_connection_v1',JSON.stringify({id:target,name:'SYNTHETIC CI ONLY'}));},{session:h.users[k].session,target});
    const page=await context.newPage();page.on('dialog',d=>d.accept(d.type()==='prompt'?'SYNTHETIC-CI-REMAINDER':undefined));await page.goto(origin);await waitSync(page);return {context,page};
   }
   const a=await device('a'),b=await device('b');
   await a.page.evaluate(()=>{saveCurrentDraft();calculate();});await waitSync(a.page);
   assert.equal((await a.page.evaluate(()=>SilkC2.preview())).candidate.payoutCents,180100);assert.equal(await a.page.locator('#saveCalculationButton').isDisabled(),true);
   await a.page.locator('[data-workspace=settlement]').click();assert.equal(await a.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
   let dropped=false;await a.context.route('**/rest/v1/rpc/tip_c2_finalize',async route=>{if(!dropped){dropped=true;await route.fetch();await route.abort('failed');}else await route.continue();});
   await a.page.getByRole('button',{name:'Testabschluss simulieren'}).click();await a.page.waitForFunction(()=>document.querySelector('#c2ServerCheck [role=status]')?.textContent.includes('noch nicht bestätigt'));
   const pending=await a.page.evaluate(()=>JSON.parse(localStorage.getItem('silk_c2_pending_'+SilkLocalRepository.getWorkspace().id)));assert.ok(pending.id);
   await a.page.reload();await waitSync(a.page);const original=await a.page.evaluate(()=>SilkSyncService.resumeC2());assert.equal(original.id,pending.id);assert.equal(original.syntheticOnly,true);
   const originalJson=JSON.stringify((await h.row()).payload.settlements[original.id]);
   await a.page.evaluate(async original=>SilkC2.confirmCash({p_root_id:original.id,p_chain_revision:0,p_receipt_id:original.id,p_kind:'baseline',p_lines:original.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents})),p_evidence_ref:'SYNTHETIC-CI-PAID'},SilkLocalRepository.getSyncMeta().revision),original);
   await a.page.evaluate(id=>{window.prompt=()=> 'Synthetic CI amount correction';createCorrectionDraft(id);},original.id);
   await a.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='1801.90';changeDay('2035-01-01');saveCurrentDraft();calculate();});await waitSync(a.page);
   const correction=await a.page.evaluate(async()=>SilkC2.finalizeSynthetic(await SilkC2.preview(),{adjustmentCents:20,kind:'funding',reference:'SYNTHETIC-CI-FUNDING'}));assert.equal(correction.netCorrection.additionalDueCents,100);
   assert.equal(JSON.stringify((await h.row()).payload.settlements[original.id]),originalJson);
   await a.page.evaluate(id=>restoreSavedCalculation(id),correction.id);await a.page.getByRole('button',{name:'Auszahlungsnachweise laden'}).click();await a.page.locator('.c2-ledger').getByText('SYNTHETIC-CI-PAID',{exact:false}).first().waitFor();assert.equal(await a.page.locator('#archiveDialog').evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
   await a.page.locator('#archiveDialog button').first().click();await waitSync(b.page);
   await a.context.setOffline(true);await a.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='777';changeDay('2035-01-01');});
   await b.page.evaluate(()=>{document.getElementById('f_2035-01-01').value='888';changeDay('2035-01-01');});await waitSync(b.page);
   await a.context.setOffline(false);await a.page.evaluate(()=>SilkSyncService.syncNow());await a.page.waitForFunction(()=>SilkLocalRepository.getConflicts().length>0);
   await a.page.reload();await a.page.waitForFunction(()=>SilkLocalRepository.getConflicts().length>0);assert.equal(await a.page.evaluate(()=>SilkLocalRepository.getState().byDate['2035-01-01'].f),'777');
   reports.push({width,height,status:'passed',actualAuthSessions:2,actualPostgREST:true,committedResponseLossAndReload:true,netCorrection:true,originalUnchanged:true,offlineConflict:true,realFinalizationLocked:true,cashConfirmationViaTestAPIOnly:true});
  }finally{for(const c of contexts)await c.close();await writeFile(output()+'/browser-results.json',JSON.stringify({engine:'chromium',engineVersion:browser.version(),physicalDevices:false,hostedCloud:false,reports},null,2));}
 }
 console.log('PASS: integrated Chromium candidate through real local Supabase at three viewport sizes. Confirmation operator UI still not accepted.');
}finally{await browser.close();await h.admin.end();await new Promise(r=>server.close(r));}
