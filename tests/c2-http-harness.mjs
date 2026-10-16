// TEST TRANSPORT ONLY. Loopback HTTP -> verified synthetic JWT -> actual PostgreSQL/WASM SQL.
// This small RPC adapter is not PostgREST, GoTrue, Realtime, or a production backend.
import {c2db,target,member} from './c2-db-helper.mjs';import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';import {createServer} from 'node:http';import {readFile} from 'node:fs/promises';import {resolve,extname} from 'node:path';
const methods={
 tip_c2_ledger:['p_workspace_id','p_expected_revision','p_root_id'],
 tip_write_workspace_v14:['p_workspace_id','p_expected_revision','p_payload'],
 tip_finalize_workspace_v14:['p_workspace_id','p_expected_revision','p_id','p_input'],
 tip_c2_preview:['p_workspace_id','p_expected_revision','p_input','p_root_id'],
 tip_c2_finalize:['p_workspace_id','p_expected_revision','p_id','p_input','p_root_id','p_chain_revision','p_reason','p_cash_evidence'],
 tip_c2_confirm_cash:['p_workspace_id','p_expected_revision','p_id','p_root_id','p_chain_revision','p_receipt_id','p_kind','p_lines','p_evidence_ref']
};
export async function harness({port=0}={}){
 const db=await c2db();await db.exec("reset role;select set_config('request.jwt.claim.sub','',false)");
 const secret=randomBytes(32),sign=b=>createHmac('sha256',secret).update(b).digest('base64url');
 const jwt=(sub=member,role='authenticated',delta=3600)=>{const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=b({alg:'HS256',typ:'JWT'})+'.'+b({role,sub,exp:Math.floor(Date.now()/1000)+delta});return body+'.'+sign(body);};
 function verify(header){if(!header)return {role:'anon'};const parts=header.replace(/^Bearer /,'').split('.');if(parts.length!==3)throw Error('Invalid JWT');const expected=Buffer.from(sign(parts.slice(0,2).join('.'))),got=Buffer.from(parts[2]);if(expected.length!==got.length||!timingSafeEqual(expected,got))throw Error('Invalid JWT');const claims=JSON.parse(Buffer.from(parts[1],'base64url'));if(claims.role!=='authenticated'||claims.exp<=Date.now()/1000)throw Error('Invalid JWT');return claims;}
 const token=jwt();let queue=Promise.resolve();
 const server=createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/rest/v1/')){
   res.setHeader('content-type','application/json');let claims;try{claims=verify(req.headers.authorization);}catch{res.writeHead(401);res.end(JSON.stringify({code:'TEST_JWT_INVALID',message:'Invalid JWT'}));return;}
   const resource=url.pathname.slice(9);let args={};try{if(req.method!=='GET')args=JSON.parse(await new Promise(resolve=>{let b='';req.on('data',d=>{b+=d;});req.on('end',()=>resolve(b));}));}catch{res.writeHead(400);res.end('{}');return;}
   const task=async()=>{try{
    const result=await db.transaction(async tx=>{
     await tx.exec('set local role '+claims.role);
     await tx.query("select set_config('request.jwt.claims',$1,true),set_config('request.headers',$2,true)",[JSON.stringify(claims),JSON.stringify({'x-silk-client-protocol':req.headers['x-silk-client-protocol']||''})]);
     if(resource==='tip_workspace_state'){
      if(req.method==='PATCH')return (await tx.query('update tip_workspace_state set payload=$1 where workspace_id=$2 returning *',[args.payload,target])).rows;
      const rows=(await tx.query('select * from tip_workspace_state where workspace_id=$1',[target])).rows;return req.headers.accept?.includes('vnd.pgrst.object')?(rows[0]??null):rows;
     }
     const name=resource.slice(4),keys=resource.startsWith('rpc/')&&methods[name];if(!keys)throw Object.assign(Error('Unknown test RPC'),{code:'PGRST202'});
     const composite=name.includes('workspace')||name==='tip_c2_finalize';const result=await tx.query(composite?`select r.* from public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) r`:`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) result`,keys.map(k=>args[k]??null));return composite?result.rows[0]:result.rows[0].result;
    });res.end(JSON.stringify(result));
   }catch(e){res.statusCode=e.code==='42501'?(claims.role==='anon'?401:403):e.code==='40001'||e.code==='23505'?409:400;res.end(JSON.stringify({message:e.message,code:e.code||'TEST_ERROR'}));}};
   queue=queue.then(task,task);return;
  }
  try{const root=resolve('dist'),path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!path.startsWith(root+'/'))throw Error();res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');res.end(await readFile(path));}catch{res.writeHead(404);res.end();}
 });await new Promise(r=>{server.listen(port,'127.0.0.1',r);});const origin='http://127.0.0.1:'+server.address().port,api=origin+'/rest/v1';
 const rpc=async(name,args={},auth=token)=>{const r=await fetch(api+'/rpc/'+name,{method:'POST',headers:{'content-type':'application/json','x-silk-client-protocol':'4',...(auth?{authorization:'Bearer '+auth}:{})},body:JSON.stringify({p_workspace_id:target,...args})});return {status:r.status,body:await r.json()};};
 return {db,api,origin,jwt,token,rpc,async close(){await new Promise(r=>{server.close(r);});await queue;await db.close();}};
}
