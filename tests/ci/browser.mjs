// Actual built candidate -> real local Supabase APIs. Browser emulation, no devices.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {operatorFlow,waitSync} from '../c2-operator-flow.mjs';
import {connect,reset,output,input,target} from './native-helper.mjs';
const h=await connect(),origin='http://127.0.0.1:55441',reports=[];
const server=createServer(async(req,res)=>{try{const base=resolve('dist'),p=resolve(base,'.'+(req.url==='/'?'/index.html':req.url.split('?')[0]));assert.ok(p.startsWith(base+'/'));res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(55441,'127.0.0.1',r));const engineName=process.env.QA_BROWSER==='webkit'?'webkit':'chromium',engine=engineName==='webkit'?webkit:chromium,browser=await engine.launch({headless:true});
try{
 for(const [width,height] of (engineName==='webkit'?[[393,852],[1024,768]]:[[393,852],[1024,768],[1440,900]])){
  await reset(h);await h.store(input('1801.10',['A']),h.users.a.session.access_token);const contexts=[];
  try{
   async function device(k){const context=await browser.newContext({viewport:{width,height},hasTouch:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'});contexts.push(context);
    await context.route('**/*',r=>[origin,h.cfg.api].includes(new URL(r.request().url()).origin)?r.continue():r.abort());
    await context.addInitScript(({session,target})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify(session));localStorage.setItem('silk_workspace_connection_v1',JSON.stringify({id:target,name:'SYNTHETIC CI ONLY'}));},{session:h.users[k].session,target});
    const page=await context.newPage();page.on('dialog',d=>d.accept(d.type()==='prompt'?'SYNTHETIC-CI-REMAINDER':undefined));await page.goto(origin);await waitSync(page);return {context,page};
   }
   const a=await device('a'),b=await device('b');
   const result=await operatorFlow({a,b,row:h.row,setCashPermission:async allowed=>h.admin.query('update private.tip_c2_operators set can_confirm_cash=$1 where workspace_id=$2 and actor=$3',[allowed,target,h.users.a.id]),screenshot:async(page,name)=>{const data=await page.screenshot({type:'jpeg',quality:55});console.log('SILK_UI_IMAGE '+engineName+'-'+width+'-'+name+' '+data.toString('base64'));}});
   reports.push({width,height,status:'passed',actualAuthSessions:2,actualPostgREST:true,...result});
  }catch(error){const diagnostic={};for(const [i,c] of contexts.entries())try{diagnostic[i]=await c.pages()[0].evaluate(()=>({ready:document.readyState,sync:document.querySelector('.silk-sync-status')?.textContent,probe:window.silkC2SyncProbe?{done:window.silkC2SyncProbe.done,value:window.silkC2SyncProbe.value,error:window.silkC2SyncProbe.error}:null,conflicts:window.SilkLocalRepository?.getConflicts().length}));}catch{}reports.push({width,height,status:'failed',error:error.message.slice(0,1500),diagnostic});throw error;
  }finally{for(const c of contexts)await c.close();await writeFile(output()+'/browser-results-'+engineName+'.json',JSON.stringify({engine:engineName,engineVersion:browser.version(),physicalDevices:false,hostedCloud:false,reports},null,2));}
 }
 console.log('PASS: '+engineName+' operator forms through actual local Supabase APIs; not physical-device acceptance.');
}finally{await browser.close();await h.admin.end();await new Promise(r=>server.close(r));}
