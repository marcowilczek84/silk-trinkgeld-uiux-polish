import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('dist'),origin='http://127.0.0.1:55452';
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+(new URL(req.url,origin).pathname==='/'?'/index.html':new URL(req.url,origin).pathname));assert.ok(p.startsWith(root+'/'));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff':'font/woff'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(55452,'127.0.0.1',r));
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:393,height:852},hasTouch:true,isMobile:true,locale:'de-CH',timezoneId:'Europe/Zurich'}),page=await context.newPage(),errors=[],outbound=[];
 page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();outbound.push(r.request().url());return r.abort();});
 await page.goto(origin);await page.locator('#workspaceState #silkSyncStatus').waitFor();assert.deepEqual(await page.evaluate(()=>({url:SILK_SUPABASE_CONFIG.url,key:SILK_SUPABASE_CONFIG.publishableKey,localOnly:SILK_SUPABASE_CONFIG.localOnly,approved:SILK_SUPABASE_CONFIG.c2AppApproved})),{url:'',key:'',localOnly:true,approved:false});
 await page.locator('#singleDate').fill('2035-01-01');await page.locator('#singleDate').press('Tab');const early=page.locator('#f_2035-01-01'),late=page.locator('#s_2035-01-01');
 await early.fill('100');await late.fill('0');await page.getByRole('combobox',{name:'Dienst für Marco Wilczek',exact:true}).selectOption('F1');
 const calculate=async()=>{await page.getByRole('button',{name:'Trinkgeld berechnen',exact:true}).click();await page.locator('[data-workspace-view=settlement]').waitFor();return page.evaluate(()=>SilkCalculatedNumbers);};
 const edit=()=>page.getByRole('button',{name:'Erfassung bearbeiten',exact:true}).click();
 const expected=await calculate();assert.equal(expected.inputCents,10000);await edit();await late.fill('');assert.equal(await late.inputValue(),'');assert.deepEqual(await calculate(),expected);
 await edit();await page.getByRole('button',{name:'Als Entwurf speichern',exact:true}).click();await page.reload();await page.locator('#workspaceState #silkSyncStatus').waitFor();assert.equal(await page.evaluate(()=>SilkWorkflow.isDirty()),false);assert.deepEqual(await calculate(),expected);
 await edit();await early.fill('101');await page.getByRole('button',{name:'Zeitraum',exact:true}).click();await page.locator('#unsavedDialog[open]').waitFor();await page.getByRole('button',{name:'Zurück',exact:true}).click();await early.fill('100');assert.equal(await page.evaluate(()=>SilkWorkflow.isDirty()),false);
 // A partially typed numeric token is not an intentional blank zero.
 await late.fill('');await late.pressSequentially('1e');const badInput=await late.evaluate(n=>n.validity.badInput);assert.equal(badInput,true);await page.getByRole('button',{name:'Trinkgeld berechnen',exact:true}).click();assert.equal(await page.locator('#resultSection').evaluate(n=>n.classList.contains('hidden')),true);await late.fill('');assert.equal(await page.evaluate(()=>SilkWorkflow.isDirty()),false);
 await page.locator('#singleDate').fill('2035-01-02');await page.locator('#singleDate').press('Tab');await page.getByRole('button',{name:'Trinkgeld berechnen',exact:true}).click();assert.match(await page.locator('#calculationError').textContent(),/Nicht bearbeitet/);assert.equal(await page.locator('#f_2035-01-02').inputValue(),'');assert.equal(await page.locator('#s_2035-01-02').inputValue(),'');
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);assert.equal(await page.evaluate(()=>SilkC2.writesEnabled()),false);
 console.log('SILK_LATE_INPUT '+JSON.stringify({engine:engine.name(),version:browser.version(),viewport:[393,852],blankEqualsZero:true,draftSaveReload:true,untouchedDayStillMissing:true,actualEditGuard:true,revertedEditClean:true,invalidNumericTokenBlocked:true,cloudRequests:0,pageErrors:errors,physicalDevices:false,hostedCloud:false}));await context.close();
}finally{await browser.close();await new Promise(r=>server.close(r));}
