// Opt-in browser integration against the one disposable, synthetic QA workspace.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
const config=JSON.parse(await readFile(process.env.SILK_QA_CONFIG,'utf8'));
assert.equal(config.workspace_id,'aec9330b-678a-40f8-b2c3-c75523490115');assert.match(config.workspace_name,/synthetic only/);
const output=process.env.QA_OUTPUT||'/tmp/silk-browser-cloud';await mkdir(output,{recursive:true});
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium;
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;assert.ok(!path.includes('..'));const body=await readFile(new URL('../dist'+(path==='/'?'/index.html':path),import.meta.url));res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html');res.end(body);}catch{res.statusCode=404;res.end();}});
await new Promise(r=>{server.listen(0,'127.0.0.1',r);});const origin='http://127.0.0.1:'+server.address().port;
const p=process.env.QA_PROXY_URL?new URL(process.env.QA_PROXY_URL):null;
const proxy=p?{server:p.origin,bypass:'127.0.0.1,localhost',...(p.username?{username:decodeURIComponent(p.username),password:decodeURIComponent(p.password)}:{})}:undefined;
const executable=engine===webkit?process.env.WEBKIT_EXECUTABLE_PATH:process.env.CHROMIUM_EXECUTABLE_PATH;
const browser=await engine.launch({headless:true,proxy,...(executable?{executablePath:executable}:{}),args:engine===chromium?JSON.parse(process.env.CHROMIUM_ARGS||'[]'):[]});
const records=[],contexts=[],errors=[],requests=[],blocked=[];let completed=false;
const syncSource=await readFile(new URL('../sync-service.js',import.meta.url),'utf8');
async function connect(name,viewport){
 const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,locale:'de-CH',timezoneId:'Europe/Zurich',ignoreHTTPSErrors:process.env.QA_IGNORE_HTTPS_ERRORS==='1'});contexts.push(context);
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url());if(u.origin===origin)return route.continue();
  if(u.origin!==new URL(config.url).origin){blocked.push(u.hostname);return route.abort();}
  if(u.pathname.startsWith('/rest/v1/')){const body=r.postDataJSON();if(u.searchParams.get('workspace_id')!=='eq.'+config.workspace_id&&body?.p_workspace_id!==config.workspace_id){blocked.push('non-test-workspace');return route.abort();}requests.push({method:r.method(),path:u.pathname,protocol:r.headers()['x-silk-client-protocol']});}
  return route.continue();
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.goto(origin);await page.locator('#days').waitFor();
 assert.equal(await page.evaluate(()=>SILK_SUPABASE_CONFIG.localOnly),true);
 await page.evaluate(async cfg=>{await SilkSyncService.stop();window.SILK_SUPABASE_CONFIG={url:cfg.url,publishableKey:cfg.key};const client=SilkSupabase.create();const signed=await client.auth.setSession(cfg.session);if(signed.error)throw Error(signed.error.message);window.qaClient=client;window.SilkSupabase.create=()=>client;SilkLocalRepository.saveWorkspace({id:cfg.id,name:'Synthetic browser QA'});},{url:config.url,key:config.key,session:config.clients[name],id:config.workspace_id});
 await page.addScriptTag({content:syncSource});await page.evaluate(()=>SilkSyncService.init());return page;
}
async function flush(page){await page.evaluate(()=>SilkSyncService.syncNow());await page.waitForFunction(()=>SilkSyncStatus.get()==='synced'&&SilkSyncMerge.equal(SilkLocalRepository.document(),SilkLocalRepository.getSyncMeta().base),null,{timeout:60000});}
async function converge(...pages){for(let i=0;i<2;i++)for(const page of pages)await flush(page);}
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=x=>createHash('sha256').update(canonical(x)).digest('hex');
try{
 const A=await connect('A',{width:393,height:852}),B=await connect('B',{width:1194,height:834});await converge(A,B);
 const archivesBefore=await A.evaluate(()=>SilkLocalRepository.document().settlements);
 await A.evaluate(()=>{openSettings();openEditor('staff');addEmployee();document.querySelector('#employeeEditor .editrow:last-child input').value='Browser QA person';if(!saveEmployees())throw Error('Staff save failed');openEditor('shifts');addShift();document.querySelector('#shiftEditorRows .shift-edit:last-child [data-field=name]').value='QA NEW';if(!saveShifts())throw Error('Shift save failed');closeSettings();});
 await converge(A,B);const ids=await B.evaluate(()=>({staff:SilkLocalRepository.getStaff().at(-1),shift:SilkLocalRepository.getShifts().at(-1).name}));assert.match(ids.staff,/^staff-/);assert.match(ids.shift,/^shift-/);
 await B.evaluate(ids=>{const state=SilkLocalRepository.getState();state.byDate['2035-03-01']={f:'12.50',s:'0',assignments:[{name:ids.staff,shift:ids.shift}]};SilkLocalRepository.saveState(state);},ids);await converge(A,B);
 await A.evaluate(()=>{openSettings();openEditor('staff');document.querySelector('#employeeEditor .editrow:last-child input').value='Browser QA renamed';saveEmployees();closeSettings();});await converge(A,B);
 assert.equal(await B.evaluate(id=>SilkIdentity.staffLabel(id),ids.staff),'Browser QA renamed');assert.equal(await B.evaluate(id=>SilkLocalRepository.document().days['2035-03-01'].assignments[id],ids.staff),ids.shift);
 records.push({id:'B01',result:'PASS',detail:'Real iPhone/iPad-sized independent browser contexts share UUID-based new staff/shifts, assignment and rename.'});
 // Reload one browser context from persisted local data and reconnect its independent session.
 await B.reload();await B.locator('#days').waitFor();assert.equal(await B.evaluate(id=>SilkIdentity.staffLabel(id),ids.staff),'Browser QA renamed');
 await B.evaluate(async cfg=>{await SilkSyncService.stop();window.SILK_SUPABASE_CONFIG={url:cfg.url,publishableKey:cfg.key};const client=SilkSupabase.create();const signed=await client.auth.setSession(cfg.session);if(signed.error)throw Error(signed.error.message);window.qaClient=client;window.SilkSupabase.create=()=>client;},{url:config.url,key:config.key,session:config.clients.B});
 await B.addScriptTag({content:syncSource});await B.evaluate(()=>SilkSyncService.init());await converge(A,B);assert.equal(await B.evaluate(id=>SilkLocalRepository.document().days['2035-03-01'].assignments[id],ids.staff),ids.shift);
 records.push({id:'B02',result:'PASS',detail:'Real browser reload and cloud reconnection preserve new IDs and assignment.'});
 const archivesAfter=await B.evaluate(()=>SilkLocalRepository.document().settlements);assert.equal(hash(archivesAfter),hash(archivesBefore));
 assert.ok(requests.length>0);assert.ok(requests.every(x=>x.protocol==='3'));assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 records.push({id:'B03',result:'PASS',detail:'Archive hash unchanged; actual bundled client sends protocol 3 on every REST request.',archiveSha256:hash(archivesAfter)});
 completed=true;
}finally{
 await writeFile(output+'/browser-cloud-results.json',JSON.stringify({testedAt:new Date().toISOString(),engine:engine===webkit?'webkit':'chromium',browser:browser.version(),completed,workspace:config.workspace_id,requests:requests.length,blocked,pageErrors:errors,results:records},null,2));
 for(const context of contexts){for(const page of context.pages())try{await page.evaluate(async()=>{await SilkSyncService.stop();await window.qaClient?.removeAllChannels();window.qaClient?.auth.stopAutoRefresh();});}catch{}}
 await browser.close();await new Promise(r=>{server.close(r);});
}
