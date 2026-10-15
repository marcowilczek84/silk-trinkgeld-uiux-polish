import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const target=process.env.BASE_URL || new URL('../dist/index.html',import.meta.url).href;
const targetURL=new URL(target);
assert.notEqual(targetURL.hostname,'silk-trinkgeld-uiux-polish.vercel.app','Never run fixtures on production');
const output=process.env.QA_OUTPUT || '/tmp/silk-integrity-qa';
await mkdir(output,{recursive:true});
const proxyURL=process.env.QA_PROXY_URL?new URL(process.env.QA_PROXY_URL):null;
const proxy=proxyURL?{server:proxyURL.origin,...(proxyURL.username?{username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password)}:{})}:undefined;
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium;
const executable=engine===webkit?process.env.WEBKIT_EXECUTABLE_PATH:process.env.CHROMIUM_EXECUTABLE_PATH;
const browser=await engine.launch({headless:true,proxy,...(executable?{executablePath:executable}:{}),args:engine===chromium?JSON.parse(process.env.CHROMIUM_ARGS||'[]'):[]});
const results=[];
try {
 for(const [width,height] of [[393,852],[375,812],[1024,768],[1194,834],[1440,900]]){
  const context=await browser.newContext({ignoreHTTPSErrors:process.env.QA_IGNORE_HTTPS_ERRORS==='1',viewport:{width,height},hasTouch:width<1300,isMobile:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'});
  if(process.env.QA_CAMERA_DENIED==='1')await context.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('QA camera permission denied','NotAllowedError'));});
  const outbound=[];
  await context.route(/^https?:/,route=>{
   const u=new URL(route.request().url());
   if(u.origin===targetURL.origin)return route.continue();
   outbound.push(u.hostname);return route.abort();
  });
  const page=await context.newPage(),errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  await page.goto(target);await page.locator('#days').waitFor();
  assert.deepEqual(await page.evaluate(()=>({url:window.SILK_SUPABASE_CONFIG.url,key:window.SILK_SUPABASE_CONFIG.publishableKey,localOnly:window.SILK_SUPABASE_CONFIG.localOnly})),{url:'',key:'',localOnly:true});
  await page.evaluate(()=>{
   const staff=['Test A','Test B','Emily'],shifts=[{name:'F1',f:1,s:0,color:'#ddd'},{name:'SP1',f:0,s:1,color:'#ddd'},{name:'MD',f:.35,s:.65,color:'#ddd'}];
   SilkLocalRepository.applyCloudSnapshot({staff,shifts,staffLabels:{},settlements:[],work:{activeId:null,checkpoint:null,calculation:null},state:{mode:'day',singleDate:'2026-10-01',periodStart:'2026-10-01',periodEnd:'2026-10-01',byDate:{'2026-10-01':{f:'104.50',s:'41',assignments:[{name:'Test A',shift:'F1'},{name:'Test B',shift:'SP1'},{name:'Emily',shift:'MD'}]},'2026-09-30':{f:'100',s:'0',assignments:[{name:'Test A',shift:'F1'}]}}}});
   saveCurrentDraft();const original=SilkLocalRepository.getSettlements()[0];SilkLocalRepository.saveSettlements([original,{...original,id:'qa-old-draft'}]);
  });
  const financial=async()=>page.evaluate(()=>{if(!calculate())throw new Error('Calculation invalid');return SilkCalculatedNumbers.lines.map(({name,amount,payout,days})=>({name,amount,payout,...(days===undefined?{}:{days})}));});
  const before=await financial(),stateBefore=await page.evaluate(()=>SilkLocalRepository.getState().byDate),oldDraft=await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.id==='qa-old-draft')));
  await page.click('.ad-menu-toggle');await page.click('button[onclick="openEditor(\'staff\')"]');await page.locator('#employeeEditor input').nth(0).fill('Test A aktuell');await page.locator('#staffEditor .savewide').click();
  await page.click('button[onclick="openEditor(\'shifts\')"]');await page.locator('#shiftEditorRows [data-field=name]').nth(0).fill('FRUEH');await page.locator('#shiftEditor .savewide').click();await page.evaluate(()=>closeSettings());
  assert.deepEqual(await page.evaluate(()=>SilkLocalRepository.getState().byDate),stateBefore);assert.deepEqual(await financial(),before);
  assert.match(await page.locator('#result').innerText(),/Test A aktuell/);assert.match(await page.locator('#result').innerText(),/FRUEH/);
  await page.evaluate(()=>saveCurrentDraft());await page.reload();await page.locator('#days').waitFor();assert.deepEqual(await financial(),before);
  await page.locator('#saveCalculationButton').click();const final=await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v2')));assert.ok(final);
  await page.click('.ad-menu-toggle');await page.evaluate(()=>openSavedCalculations());await page.locator('[data-open="qa-old-draft"]').click();
  assert.equal(await page.evaluate(()=>SilkIdentity.staffLabel('Test A')),'Test A aktuell');assert.equal(await page.evaluate(()=>SilkIdentity.shiftLabel('F1')),'FRUEH');assert.deepEqual(await financial(),before);
  assert.equal(await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.id==='qa-old-draft'))),oldDraft);assert.equal(await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v2'))),final);
  await page.waitForTimeout(350);await page.screenshot({path:output+'/'+width+'-renamed-result.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  // Import through the real UI, using renamed display labels.
  await page.click('.ad-menu-toggle');if(await page.locator('#savedCalculations .backlink').isVisible())await page.locator('#savedCalculations .backlink').click();await page.click('.silk-import-row');await page.locator('#silk-import-modal details summary').click();
  await page.fill('#silk-qr-text',JSON.stringify({v:1,type:'silk-tip',rows:[['2026-10-02',100,0]],schedule:[['2026-10-02','Test A aktuell','FRUEH']]}));await page.click('#silk-qr-paste');await page.click('#silk-import-apply');
  assert.equal(await page.evaluate(()=>SilkLocalRepository.getState().byDate['2026-10-02'].assignments.find(a=>a.name==='Test A').shift),'F1');assert.equal(await page.evaluate(()=>calculate()),true);
  // Restoring the older draft with changed weights is rejected without a write.
  const blocked=await page.evaluate(()=>{const shifts=SilkLocalRepository.getShifts();shifts[0]={...shifts[0],f:.5,s:.5};SilkLocalRepository.applyCloudSnapshot({shifts});const before=JSON.stringify(SilkLocalRepository.document());return {restored:continueDraft('qa-old-draft'),unchanged:before===JSON.stringify(SilkLocalRepository.document())};});
  assert.deepEqual(blocked,{restored:false,unchanged:true});assert.deepEqual(errors,[]);assert.equal(outbound.filter(x=>x.endsWith('supabase.co')).length,0);
  results.push({viewport:[width,height],rename:true,reload:true,oldDraft:true,archiveUnchanged:true,import:true,changedWeightBlocked:true,horizontalOverflow:false,pageErrors:errors,blockedExternalHosts:[...new Set(outbound)],dialogCount:dialogs.length});
  await context.close();
 }
 await writeFile(output+'/browser-results.json',JSON.stringify({target:targetURL.origin==='null'?'local-dist':targetURL.origin,engine:engine===webkit?'webkit':'chromium',cameraPermission:process.env.QA_CAMERA_DENIED==='1'?'simulated denied':'default',browser:browser.version(),results},null,2));
 console.log(JSON.stringify({viewports:results.length,passed:true,target:targetURL.origin==='null'?'local-dist':targetURL.origin}));
} catch(error) {console.error(String(error.message).replace(/([?&]_vercel_share=)[^\s"']+/g,'$1[redacted]'));process.exitCode=1;} finally {await browser.close();}
