import {chromium,webkit} from 'playwright';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {readFile,mkdir,writeFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';import {fixture} from './workspace-fixture.mjs';
const root=resolve('dist'),out=resolve(process.env.QA_OUTPUT||'../evidence-v14/browser');await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/')&&path!==root)throw Error();const file=path===root?root+'/index.html':path;res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,executablePath:process.env.QA_EXECUTABLE,args:engine===chromium?['--no-sandbox','--disable-dev-shm-usage']:[]});const reports=[];
try{
 for(const [width,height] of [[393,852],[1024,768],[1440,900]]){
  const c=await browser.newContext({viewport:{width,height},hasTouch:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'}),errors=[];
  await c.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());
  const a=await c.newPage();a.on('pageerror',e=>errors.push(e.message));a.on('dialog',d=>d.accept());await a.goto(origin);await a.waitForFunction(()=>SilkWriteCoordinator.canWrite());
  assert.equal(await a.evaluate(()=>SILK_SUPABASE_CONFIG.localOnly),true);
  await a.evaluate(f=>SilkLocalRepository.applyCloudSnapshot(f),fixture);
  const b=await c.newPage();b.on('pageerror',e=>errors.push(e.message));await b.goto(origin);await b.waitForFunction(()=>!!window.SilkWriteCoordinator);assert.equal(await b.evaluate(()=>SilkWriteCoordinator.canWrite()),false);
  await a.locator('#f_2026-10-01').fill('777');
  await b.waitForFunction(()=>SilkLocalRepository.getState().byDate['2026-10-01'].f==='777');
  const attempt=await b.evaluate(()=>{try{SilkLocalRepository.saveState({...SilkLocalRepository.getState(),singleDate:'2030-01-01'});return 'wrote';}catch(e){return e.message;}});assert.equal(attempt,'SILK_READ_ONLY_TAB');
  await b.screenshot({path:out+'/'+width+'-readonly.png'});
  await a.close({runBeforeUnload:false});await b.locator('#silkWriteStatus button').click();await b.waitForFunction(()=>SilkWriteCoordinator.canWrite());
  assert.equal(await b.locator('#f_2026-10-01').inputValue(),'777');await b.locator('#s_2026-10-01').fill('44.40');assert.equal(await b.evaluate(()=>SilkLocalRepository.getState().byDate['2026-10-01'].f),'777');
  // A failed localStorage write must leave the field visible and inhibit cloud/finalization.
  await b.evaluate(()=>{window.qaSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='silk_document_v2')throw new DOMException('quota','QuotaExceededError');return window.qaSet.call(this,k,v);};});
  // Expected exception is captured separately; UI evidence is the contract.
  const quotaErrors=errors.length;await b.locator('#f_2026-10-01').fill('778');await b.waitForFunction(()=>SilkWriteCoordinator.hasFailure());assert.equal(await b.locator('#f_2026-10-01').inputValue(),'778');assert.equal(await b.evaluate(()=>SilkLocalRepository.getState().byDate['2026-10-01'].f),'777');
  await b.screenshot({path:out+'/'+width+'-storage-error.png'});errors.splice(quotaErrors);
  await b.evaluate(()=>{Storage.prototype.setItem=window.qaSet;});await b.locator('#silkWriteStatus button').click();assert.equal(await b.evaluate(()=>SilkLocalRepository.getState().byDate['2026-10-01'].f),'778');
  await b.evaluate(()=>{SilkLocalRepository.applyCloudSnapshot({staff:['A'],shifts:[{name:'F1',f:1,s:0}],staffLabels:{},settlements:[],work:{activeId:null,checkpoint:null,calculation:null},state:{mode:'day',singleDate:'2035-01-01',periodStart:'2035-01-01',periodEnd:'2035-01-01',byDate:{'2035-01-01':{f:'1000',s:'0',assignments:[{name:'A',shift:'F1'}]}}}});calculate();});
  await b.locator('[data-workspace=settlement]').click();await b.waitForFunction(()=>document.querySelector('#workspaceSettlement')?.textContent.includes('Nicht freigegeben'));
  assert.equal(await b.evaluate(()=>SilkCalculatedNumbers.payoutCents),null);assert.equal(await b.evaluate(()=>saveCurrentCalculation()),false);
  assert.equal(await b.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await b.screenshot({path:out+'/'+width+'-rounding-block.png'});
  assert.deepEqual(errors,[]);reports.push({width,height,twoTabs:'pass',takeover:'pass',quotaRecovery:'pass',roundingBlock:'pass',horizontalOverflow:false,pageErrors:errors});await c.close();
 }
 await writeFile(out+'/results.json',JSON.stringify({browser:engine===webkit?'WebKit':'Chromium',reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();await new Promise(r=>server.close(r));}
