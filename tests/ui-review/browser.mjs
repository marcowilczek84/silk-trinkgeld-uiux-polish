import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve(process.env.UI_DIST||'dist'),baseline=resolve(process.env.UI_BASELINE_DIST||'.ci-ui-baseline/dist');
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://local').pathname;const isBase=path.startsWith('/baseline/');const dir=isBase?baseline:root;const rel=(isBase?path.slice(9):path).replace(/^\//,'')||'index.html',file=resolve(dir,rel);if(!file.startsWith(dir+'/'))throw Error('invalid path');const data=await readFile(file);res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.woff':'font/woff'})[extname(file)]||'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(55451,'127.0.0.1',r));const origin='http://127.0.0.1:55451';
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true});const reports=[];
try{
 for(const [width,height] of [[375,812],[393,852],[1024,768],[1440,900]]){
  const context=await browser.newContext({viewport:{width,height},hasTouch:width<1300,isMobile:width<700,locale:'de-CH',timezoneId:'Europe/Zurich',reducedMotion:'reduce'});const page=await context.newPage(),errors=[],outbound=[];
  page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();outbound.push(r.request().url());return r.abort();});
  async function load(prefix=''){await page.goto(origin+prefix+'/');await page.locator('#workspaceState #silkSyncStatus').waitFor();await page.evaluate(()=>document.fonts.ready);}
  async function overlap(){return page.evaluate(()=>{const notice=document.querySelector('#silkSyncStatus'),logo=document.querySelector('.header-logo'),title=document.querySelector('.ad-header-name');const n=notice.getBoundingClientRect(),h=logo.getBoundingClientRect();window.scrollBy(0,n.top-h.top);return new Promise(r=>requestAnimationFrame(()=>{const box=notice.getBoundingClientRect(),header=logo.getBoundingClientRect();const x=Math.max(box.left,header.left)+2,y=Math.max(box.top,header.top)+2,top=document.elementFromPoint(x,y);r({noticeOnTop:top===notice||notice.contains(top),logoVisible:document.elementFromPoint(header.left+header.width/2,header.top+header.height/2)===logo,titleVisible:document.elementFromPoint(title.getBoundingClientRect().left+5,title.getBoundingClientRect().top+5)===title,position:getComputedStyle(notice).position,zIndex:getComputedStyle(notice).zIndex,overflow:document.documentElement.scrollWidth>innerWidth+1});}));});}
  let baselineOverlap=null;
  if(width===393){await load('/baseline');baselineOverlap=await overlap();console.log('BASELINE_HEADER '+JSON.stringify({engine:engine.name(),width,...baselineOverlap}));}
  await load();assert.deepEqual(await page.evaluate(()=>({url:SILK_SUPABASE_CONFIG.url,key:SILK_SUPABASE_CONFIG.publishableKey,localOnly:SILK_SUPABASE_CONFIG.localOnly,approved:SILK_SUPABASE_CONFIG.c2AppApproved})),{url:'',key:'',localOnly:true,approved:false});
  const header=await overlap();assert.equal(header.noticeOnTop,false);assert.equal(header.logoVisible,true);assert.equal(header.titleVisible,true);assert.equal(header.overflow,false);
  if(width===393){console.log('SILK_UI_IMAGE '+engine.name()+'-393-header '+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'));}
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.getByRole('button',{name:'Zeitraum',exact:true}).click();await page.locator('#periodEndDay').selectOption('1');assert.equal(await page.locator('#unsavedDialog[open]').count(),0);
  await page.getByRole('button',{name:'Ein Tag',exact:true}).click();await page.locator('#singleDate').fill('2035-01-01');await page.locator('#singleDate').press('Tab');
  const early=page.locator('#f_2035-01-01');await early.fill('1000');await page.locator('#s_2035-01-01').fill('0');await page.getByRole('combobox',{name:'Dienst für Marco Wilczek',exact:true}).selectOption('F1');
  await page.getByRole('button',{name:'Als Entwurf speichern',exact:true}).click();await page.getByRole('button',{name:'Zeitraum',exact:true}).click();assert.equal(await page.locator('#unsavedDialog[open]').count(),0);
  await page.getByRole('button',{name:'Ein Tag',exact:true}).click();await early.fill('1001');await page.getByRole('button',{name:'Zeitraum',exact:true}).click();await page.locator('#unsavedDialog[open]').waitFor();await page.getByRole('button',{name:'Zurück',exact:true}).click();
  await early.fill('1000');await page.getByRole('button',{name:'Zeitraum',exact:true}).click();assert.equal(await page.locator('#unsavedDialog[open]').count(),0);await page.getByRole('button',{name:'Ein Tag',exact:true}).click();
  await page.getByRole('button',{name:'Trinkgeld berechnen',exact:true}).click();await page.locator('[data-workspace-view=settlement]').waitFor();
  assert.match(await page.locator('#finalizationStatus').textContent(),/CHF 0.00 · kein Kassenausgleich erforderlich/);assert.doesNotMatch(await page.locator('#finalizationStatus').textContent(),/Kein bestätigter Kassenausgleich/);
  await page.getByRole('button',{name:'Abschluss prüfen',exact:true}).click();await page.getByText('Testversion ohne Cloud-Verbindung: Der endgültige Abschluss ist hier deaktiviert.',{exact:false}).last().waitFor();assert.equal(await page.locator('#c2CloseDialog form').count(),0);assert.doesNotMatch(await page.locator('#c2CloseDialog').textContent(),/benötigt eine Verbindung|Internetverbindung/);
  if(width===393)console.log('SILK_UI_IMAGE '+engine.name()+'-393-test-notice '+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'));
  await page.getByRole('button',{name:'Zurück',exact:true}).click();await page.reload();await page.locator('#workspaceState #silkSyncStatus').waitFor();assert.equal(await page.evaluate(()=>SilkWorkflow.isDirty()),false);assert.equal(await early.inputValue(),'1000');assert.equal(await page.evaluate(()=>SilkC2.writesEnabled()),false);
  assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);reports.push({width,height,baselineOverlap,header,emptyNavigation:true,savedNavigation:true,realEditGuard:true,revertedEditClean:true,zeroRoundingClear:true,previewClosureDisabled:true,reloadClean:true,cloudRequests:0,pageErrors:errors});await context.close();
 }
 console.log('SILK_UI_REVIEW '+JSON.stringify({engine:engine.name(),version:browser.version(),physicalDevices:false,hostedCloud:false,reports}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
