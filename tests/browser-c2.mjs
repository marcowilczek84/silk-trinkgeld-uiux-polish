import {chromium,webkit} from 'playwright';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {harness} from './c2-http-harness.mjs';import {operatorFlow,waitSync} from './c2-operator-flow.mjs';import {input,documentFor,target,member,second} from './c2-db-helper.mjs';
const engine=process.env.QA_BROWSER==='webkit'?webkit:chromium,out=resolve(process.env.QA_OUTPUT||'../evidence-c2/browser');await mkdir(out,{recursive:true});
const browser=await engine.launch({headless:true,executablePath:process.env.QA_EXECUTABLE,args:engine===chromium?['--no-sandbox','--disable-dev-shm-usage']:[]});const reports=[];
try{for(const [width,height] of [[393,852],[1024,768],[1440,900]]){
 const h=await harness({port:55441}),contexts=[];try{
  const initial=input('1801.10',['A']);assert.equal((await h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload:documentFor(initial)})).status,200);
  async function device(user){const context=await browser.newContext({viewport:{width,height},hasTouch:width<1300,locale:'de-CH',timezoneId:'Europe/Zurich'});contexts.push(context);
   await context.route('**/*',route=>route.request().url().startsWith(h.origin)?route.continue():route.abort());
   await context.addInitScript(({token,user,target})=>{localStorage.setItem('sb-127-auth-token',JSON.stringify({access_token:token,refresh_token:'synthetic-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:user,aud:'authenticated',role:'authenticated'}}));localStorage.setItem('silk_workspace_connection_v1',JSON.stringify({id:target,name:'SYNTHETIC C2 ONLY'}));},{token:h.jwt(user),user,target});
   const page=await context.newPage();page.on('dialog',d=>d.accept(d.type()==='prompt'?'SYNTHETIC-BROWSER-REMAINDER':undefined));await page.goto(h.origin);await waitSync(page);return {context,page};}
  const a=await device(member),b=await device(second);
  const result=await operatorFlow({a,b,row:async()=>(await h.db.query('select * from tip_workspace_state where workspace_id=$1',[target])).rows[0],setCashPermission:async allowed=>{await h.db.exec('reset role');await h.db.query('update private.tip_c2_operators set can_confirm_cash=$1 where workspace_id=$2 and actor=$3',[allowed,target,member]);},screenshot:(page,name)=>page.screenshot({path:out+'/'+width+'-'+name+'.png'})});
  reports.push({width,height,...result});
 }finally{for(const c of contexts)await c.close();await h.close();}
}await writeFile(out+'/results.json',JSON.stringify({engine:process.env.QA_BROWSER||'chromium',transport:'test HTTP adapter -> PostgreSQL/WASM; not hosted Supabase',physicalDevices:false,reports},null,2));console.log(JSON.stringify(reports));
}finally{await browser.close();}
