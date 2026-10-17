import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const root=resolve('operator-check/public'),origin='http://127.0.0.1:55453';
const server=createServer(async(req,res)=>{try{const p=resolve(root,'.'+(new URL(req.url,origin).pathname==='/'?'/index.html':new URL(req.url,origin).pathname));assert.ok(p.startsWith(root+'/'));res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(55453,'127.0.0.1',r));
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch({headless:true});
try{for(const [width,height] of [[393,852],[1024,768],[1440,900]]){
 const context=await browser.newContext({viewport:{width,height},hasTouch:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'}),page=await context.newPage(),errors=[],outbound=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')console.log('BROWSER_ERROR '+m.text());});await context.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();outbound.push(r.request().url());return r.abort();});
 page.setDefaultTimeout(90000);await page.goto(origin);
 const close=page.locator('#c2CloseDialog');await close.locator('form').waitFor();
 assert.match(await close.textContent(),/Abrundung:.*0[.,]10/);assert.equal(await close.getByRole('checkbox').isChecked(),false);assert.equal(await close.locator('form').evaluate(f=>f.checkValidity()),false);
 await close.getByLabel('Beleg / Verbleib des Restbetrags').fill('TEST-KASSE');await close.getByRole('checkbox').check();await close.getByRole('button',{name:'Abrechnung verbindlich abschliessen'}).click();
 await close.getByRole('button',{name:'Beleg öffnen'}).click();const archive=page.locator('#archiveDialog');await archive.waitFor();
 const original=await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v4-c2')));assert.equal(JSON.parse(original).paymentStatus,'not-confirmed');
 await page.getByRole('button',{name:'Auszahlungsnachweise laden'}).click();const ledger=page.locator('.c2-ledger');await ledger.getByRole('button',{name:'Auszahlung bestätigen',exact:true}).click();const form=ledger.locator('form');
 assert.equal(await form.getByRole('checkbox').isChecked(),false);await form.getByLabel('Auszahlungsbeleg / Referenz').fill('TEST-ZAHLUNG');await form.getByRole('checkbox').check();await form.getByRole('button',{name:'Tatsächliche Auszahlung bestätigen',exact:true}).click();await ledger.getByText('Berechnete Auszahlung vollständig bestätigt.').waitFor();
 const before=await page.evaluate(id=>SilkC2.ledger(id),JSON.parse(original).id);assert.equal(before.confirmations.length,1);
 assert.equal(await archive.evaluate(n=>n.scrollWidth>n.clientWidth+1),false);
 await page.reload();await page.locator('#archiveDialog[open]').waitFor();await page.getByRole('button',{name:'Auszahlungsnachweise laden'}).click();await page.locator('.c2-ledger').getByText('Berechnete Auszahlung vollständig bestätigt.').waitFor();
 const after=await page.evaluate(id=>SilkC2.ledger(id),JSON.parse(original).id);assert.deepEqual(after,before);assert.equal(await page.evaluate(()=>JSON.stringify(SilkLocalRepository.getSettlements().find(x=>x.dataFormat==='final-v4-c2'))),original);
 assert.deepEqual(errors,[]);assert.deepEqual(outbound,[]);
 console.log('SILK_OPERATOR_CHECK '+JSON.stringify({engine:engine.name(),version:browser.version(),viewport:[width,height],closeAndPaymentForms:true,explicitSeparateConfirmations:true,originalReceiptUnchanged:true,reloadSameSinglePayment:true,externalRequests:0,physicalDevices:false,hostedSupabase:false,adapter:'local browser PGlite',pageErrors:errors}));await context.close();
}}finally{await browser.close();await new Promise(r=>server.close(r));}
