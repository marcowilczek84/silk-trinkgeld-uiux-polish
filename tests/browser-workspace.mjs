import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fixture} from './workspace-fixture.mjs';
const target=process.env.BASE_URL||new URL('../dist/index.html',import.meta.url).href,targetURL=new URL(target);
assert.notEqual(targetURL.hostname,'silk-trinkgeld-uiux-polish.vercel.app','Fixtures are forbidden on production');
const output=process.env.QA_OUTPUT||'/tmp/silk-workspace-qa';await mkdir(output,{recursive:true});
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium;
const proxyURL=process.env.QA_PROXY_URL?new URL(process.env.QA_PROXY_URL):null;
const proxy=targetURL.protocol==='file:'?undefined:proxyURL?{server:proxyURL.origin,...(proxyURL.username?{username:decodeURIComponent(proxyURL.username),password:decodeURIComponent(proxyURL.password)}:{})}:undefined;
const browser=await engine.launch({headless:true,proxy,executablePath:engine===webkit?process.env.WEBKIT_EXECUTABLE_PATH:process.env.CHROMIUM_EXECUTABLE_PATH,args:engine===chromium?JSON.parse(process.env.CHROMIUM_ARGS||'[]'):[]});
const reports=[];
try{for(const [width,height] of [[393,852],[375,812],[1024,768],[1194,834],[1440,900]]){
 const context=await browser.newContext({ignoreHTTPSErrors:process.env.QA_IGNORE_HTTPS_ERRORS==='1',viewport:{width,height},locale:'de-CH',timezoneId:'Europe/Zurich',hasTouch:width<1300,isMobile:width<1300,reducedMotion:'reduce'});
 const outbound=[];await context.route(/^https?:/,route=>{const url=new URL(route.request().url());if(url.origin===targetURL.origin)return route.continue();outbound.push(url.hostname);return route.abort();});
 await context.addInitScript(()=>{if(navigator.mediaDevices)navigator.mediaDevices.getUserMedia=()=>Promise.reject(new DOMException('QA camera denied','NotAllowedError'));});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{await d.accept();});
 await page.goto(target);await page.locator('.workspace-nav').waitFor();
 assert.deepEqual(await page.evaluate(()=>SILK_SUPABASE_CONFIG),{url:'',publishableKey:'',localOnly:true});
 await page.evaluate(f=>SilkLocalRepository.applyCloudSnapshot(f),fixture);await page.evaluate(()=>saveCurrentDraft());
 const checks=[];
 async function shot(name,fullPage=false){await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(80);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow: '+name);if(fullPage)await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:output+'/'+width+'-'+name+'.png',fullPage:false});checks.push(name);}
 const financial=()=>page.evaluate(()=>{if(!calculate())throw Error('Invalid fixture');return SilkCalculatedNumbers.lines.map(({name,amount,payout,days})=>({name,amount,payout,...(days===undefined?{}:{days})}));});
 const area=async name=>{await page.locator('[data-workspace='+name+']').click();await page.waitForTimeout(60);};
 await shot('start');await page.locator('.daybody').scrollIntoViewIfNeeded();await shot('erfassung');
 const before=await financial();await shot('abrechnung',true);
 const projection=await page.locator('.workspace-payout').allTextContents();assert.equal(projection.length,before.length);
 await area('staff');await shot('mitarbeiter');
 const filter=page.locator('#staffEditor .workspace-search input');await filter.fill('Alex');assert.equal(await page.locator('#employeeEditor .editrow:visible').count(),1);
 await page.locator('#employeeEditor .editrow input').first().fill('Alex Neu');await page.keyboard.press('Escape');await page.locator('#editorDecision').waitFor();await shot('dialog');await page.locator('#editorDecision [data-choice=back]').click();
 await page.locator('#staffEditor .savewide').click();await page.locator('.drawerhead button').click();
 assert.equal(await page.evaluate(()=>SilkIdentity.staffLabel('qa-alex')),'Alex Neu');assert.deepEqual(await page.evaluate(()=>SilkLocalRepository.getStaff()),fixture.staff);
 await area('shifts');await shot('dienste');await page.locator('#shiftEditorRows [data-field=name]').first().fill('FRÜH');await page.locator('#shiftEditor .savewide').click();await page.locator('.drawerhead button').click();
 assert.deepEqual(await financial(),before);await page.locator('#saveCalculationButton').click();
 const archive=await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v2')));assert.ok(archive);
 await area('history');await shot('historie');await page.locator('.saved-open[data-draft=false]').first().click();await shot('archiv');await page.locator('#archiveDialog>button').click();await page.locator('.drawerhead button').click();
 await page.reload();await page.locator('.workspace-nav').waitFor();assert.equal(await page.evaluate(()=>SilkIdentity.staffLabel('qa-alex')),'Alex Neu');assert.deepEqual(await financial(),before);
 assert.equal(await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v2'))),archive);
 await area('staff');await page.keyboard.press('Escape');assert.equal(await page.locator('#drawer').evaluate(n=>n.classList.contains('open')),false);assert.equal(await page.evaluate(()=>document.activeElement.dataset.workspace),'staff');
 // Search and navigation must preserve the entire closed archive and all identities.
 assert.equal(await page.evaluate(()=>SilkLocalRepository.getShifts()[0].name),'qa-early');
 const sizes=await page.locator('.workspace-nav button').evaluateAll(nodes=>nodes.map(x=>({width:x.getBoundingClientRect().width,height:x.getBoundingClientRect().height})));assert.ok(sizes.every(x=>x.width>=44&&x.height>=44));
 if(engine===chromium){await page.locator('.ad-menu-toggle').click();await page.evaluate(()=>backSettings());await page.locator('.silk-import-row').click();await shot('import-dialog');assert.equal(await page.evaluate(()=>document.activeElement.className),'sim-close');await page.keyboard.press('Escape');assert.equal(await page.locator('#silk-import-modal').count(),0);}
 // Existing period logic is exercised with the same synthetic dates, never a production snapshot.
 await page.evaluate(f=>{f.state.mode='period';f.state.periodEnd='2026-10-02';SilkLocalRepository.applyCloudSnapshot(f);},fixture);await area('entry');await shot('zeitraum');assert.equal(await page.evaluate(()=>calculate()),true);assert.equal(await page.evaluate(()=>SilkCalculatedNumbers.total),1132.55);
 assert.deepEqual(errors,[]);assert.equal(outbound.filter(x=>x.endsWith('supabase.co')).length,0);
 reports.push({viewport:[width,height],screens:checks,calculationsEqual:true,renameIdsStable:true,archiveBytesUnchanged:true,reload:true,keyboardFocus:true,touchTargets:true,horizontalOverflow:false,pageErrors:errors,blockedExternalHosts:[...new Set(outbound)]});await context.close();
 }await writeFile(output+'/browser-workspace-results.json',JSON.stringify({target:targetURL.protocol==='file:'?'local-dist':targetURL.origin,engine:engine===webkit?'webkit':'chromium',browser:browser.version(),camera:'denied simulation',physicalDevice:false,results:reports},null,2));console.log(JSON.stringify({passed:true,viewports:reports.length}));
}catch(error){console.error(String(error.stack||error).replace(/([?&]_vercel_share=)[^\s"']+/g,'$1[redacted]'));process.exitCode=1;}finally{await browser.close();}
