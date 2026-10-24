/* Shared server-only adapter. It never forwards HUB cookies, passwords or client secrets to the browser. */
import {randomBytes,createCipheriv,createDecipheriv,createHash,createHmac,timingSafeEqual} from 'node:crypto';
const COOKIE='__Host-ambassador-module',PENDING=COOKIE+'-pending';
const safe={'Cache-Control':'private, no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'};
const token=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v);
const hash=v=>createHash('sha256').update(v).digest();
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(hash(a),hash(b));
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{...safe,'Content-Type':'application/json; charset=utf-8',...headers}});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${seconds}`;
function readCookie(request,name){const entries=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).filter(s=>s.startsWith(name+'='));return entries.length===1?entries[0].slice(name.length+1):null;}
export function createModuleClient({clientId,module,clientSecret,issuer,origin,fetcher=fetch,clock=Date.now}){
 for(const value of [issuer,origin]){const u=new URL(value);if(u.origin!==value||u.protocol!=='https:')throw Error('MODULE_CLIENT_ORIGIN');}
 if(!['inside','breakfast','tips'].includes(module)||clientId!=='ambassador-'+module||!token(clientSecret)||issuer===origin)throw Error('MODULE_CLIENT_CONFIG');
 const key=hash('module-pending-v1:'+clientSecret+':'+clientId+':'+origin),callback=origin+'/access/callback';
 const csrf=ref=>createHmac('sha256',clientSecret).update('csrf:'+ref).digest('base64url');
 function seal(body){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(Buffer.from(issuer));const encrypted=Buffer.concat([cipher.update(JSON.stringify(body)),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');}
 function unseal(value){try{if(typeof value!=='string'||value.length>2048)return null;const b=Buffer.from(value,'base64url'),cipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));cipher.setAAD(Buffer.from(issuer));cipher.setAuthTag(b.subarray(12,28));const v=JSON.parse(Buffer.concat([cipher.update(b.subarray(28)),cipher.final()]).toString());return v.expires>clock()&&v.clientId===clientId?v:null;}catch{return null;}}
 async function call(action,body){const r=await fetcher(issuer+'/api/module-sso/'+action,{method:'POST',redirect:'error',headers:{'Content-Type':'application/json',Authorization:'Bearer '+clientSecret},body:JSON.stringify({client_id:clientId,...body}),signal:AbortSignal.timeout(8000)});if(!r.ok)return null;return r.json();}
 function page(data,script,formOrigin=origin){return new Response('<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arbeitsplatz · Weiterleitung</title><script src="/access/'+script+'" defer></script></head><body data-transfer="'+escape(JSON.stringify(data))+'"><p id="transfer-status" role="status">Dein Zugang wird geprüft.</p><noscript>Bitte JavaScript aktivieren.</noscript></body></html>',{headers:{...safe,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; form-action "+formOrigin+"; base-uri 'none'; frame-ancestors 'none'"}});}
 const scripts={
  'redirect.js':"(()=>{'use strict';const d=JSON.parse(document.body.dataset.transfer),f=document.createElement('form');f.method='post';f.action=d.action;for(const [k,v]of Object.entries(d.fields)){const i=document.createElement('input');i.type='hidden';i.name=k;i.value=v;f.append(i)}document.body.append(f);f.submit()})();",
  'finish.js':"(()=>{'use strict';(async()=>{try{const d=JSON.parse(document.body.dataset.transfer),r=await fetch('/access/finish',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-Workplace-Request':'1'},body:JSON.stringify(d)});if(!r.ok)throw Error();location.replace('/')}catch{document.querySelector('#transfer-status').textContent='Der Zugang konnte nicht übernommen werden. Bitte die Fachapp im Arbeitsplatz erneut öffnen.'}})()})();"
 };
 async function identity(request,{permission,write=false}={}){
  if(new URL(request.url).origin!==origin)return null;
  const ref=readCookie(request,COOKIE);if(!token(ref))return null;
  if(write&&(request.headers.get('origin')!==origin||!equal(request.headers.get('x-workplace-csrf'),csrf(ref))))return null;
  const d=await call('introspect',{session_ref:ref});
  if(!d?.active||d.access?.module!==module||!Array.isArray(d.access.permissions)||d.idle_expires_at<=clock()||d.absolute_expires_at<=clock()||permission&&!d.access.permissions.includes(permission))return null;
  return {...d.access,csrf:csrf(ref),expiresAt:Math.min(d.idle_expires_at,d.absolute_expires_at)};
 }
 async function handle(request){
  try{
   const url=new URL(request.url),name=url.pathname.slice('/access/'.length);
   if(url.origin!==origin||!url.pathname.startsWith('/access/')||url.search)return json({error:'invalid_request'},400);
   if(scripts[name]&&request.method==='GET')return new Response(scripts[name],{headers:{...safe,'Content-Type':'text/javascript; charset=utf-8'}});
   if(name==='start'&&request.method==='GET'){
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(32).toString('base64url');
    const r=page({action:issuer+'/access/module',fields:{client_id:clientId,redirect_uri:callback,state,code_challenge:hash(verifier).toString('base64url'),code_challenge_method:'S256'}},'redirect.js',issuer);
    r.headers.append('Set-Cookie',cookie(PENDING,seal({clientId,state,verifier,expires:clock()+120000}),120));return r;
   }
   if(name==='callback'&&request.method==='POST'){
    if(request.headers.get('origin')!==issuer||request.headers.get('sec-fetch-dest')!=='document'||request.headers.get('sec-fetch-mode')!=='navigate'||request.headers.get('content-type')?.split(';')[0]!=='application/x-www-form-urlencoded')return json({error:'forbidden_origin'},403);
    const raw=await request.text();if(raw.length>1024)return json({error:'invalid_request'},400);const params=new URLSearchParams(raw),d=Object.fromEntries(params);
    if([...params].length!==3||Object.keys(d).sort().join(',')!=='code,iss,state'||!token(d.code)||!token(d.state)||d.iss!==issuer)return json({error:'invalid_request'},400);
    return page(d,'finish.js');
   }
   if(name==='finish'&&request.method==='POST'){
    if(request.headers.get('origin')!==origin||request.headers.get('x-workplace-request')!=='1'||request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'forbidden_origin'},403);
    const raw=await request.text();if(raw.length>1024)return json({error:'invalid_request'},400);let d;try{d=JSON.parse(raw)}catch{return json({error:'invalid_request'},400)}const pending=unseal(readCookie(request,PENDING));
    if(!pending||!d||Object.keys(d).sort().join(',')!=='code,iss,state'||!token(d.code)||!equal(d.state,pending.state)||d.iss!==issuer)return json({error:'invalid_transaction'},400,{'Set-Cookie':cookie(PENDING,'',0)});
    const result=await call('exchange',{code:d.code,code_verifier:pending.verifier,redirect_uri:callback});
    if(!token(result?.session_ref)||result.access?.module!==module||result.absolute_expires_at<=clock())return json({error:'invalid_grant'},401,{'Set-Cookie':cookie(PENDING,'',0)});
    const response=json({ok:true});response.headers.append('Set-Cookie',cookie(PENDING,'',0));response.headers.append('Set-Cookie',cookie(COOKIE,result.session_ref,Math.max(1,Math.min(14400,Math.floor((result.absolute_expires_at-clock())/1000)))));return response;
   }
   if(name==='status'&&request.method==='GET'){const access=await identity(request);return access?json({authenticated:true,access}):json({authenticated:false},401);}
   if(['activity','logout'].includes(name)&&request.method==='POST'){
    const access=await identity(request,{write:true});if(!access)return json({error:'unauthorized'},401);
    const result=await call(name==='logout'?'revoke':'activity',{session_ref:readCookie(request,COOKIE)});if(!result)return json({error:'unauthorized'},401);
    return name==='logout'?json({ok:true},200,{'Set-Cookie':cookie(COOKIE,'',0)}):json({ok:true,expiresAt:Math.min(result.idle_expires_at,result.absolute_expires_at)});
   }
   return json({error:'not_found'},404);
  }catch{return json({error:'authority_unavailable'},503)}
 }
 return {handle,identity,async databaseToken(request){const ref=readCookie(request,COOKIE);if(!token(ref)||new URL(request.url).origin!==origin)return null;const result=await call('database',{session_ref:ref});return result?.token||null;},async backendProof(request,body=''){const ref=readCookie(request,COOKIE);if(!token(ref))return null;const url=new URL(request.url);if(url.origin!==origin)return null;const result=await call('proof',{session_ref:ref,method:request.method,path:url.pathname+url.search,body_sha256:hash(body).toString('base64url')});return result?.proof||null;},reference(request){const value=readCookie(request,COOKIE);return token(value)?value:null;}};
}
