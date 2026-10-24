/* Same-origin data relay. Supabase still enforces its native RLS/RPC rules. */
const tables={breakfast:new Set(['breakfast_lists','guest_preferences']),tips:new Set(['tip_staff_members','tip_shift_types','tip_days','tip_assignments','tip_settlements','tip_settlement_lines','tip_legacy_snapshots','tip_drafts','tip_workspace_state'])};
const rpc={breakfast:{breakfast_service_action_v4:'checkin',breakfast_service_action_v41:'checkin',breakfast_import_v41:'manage',breakfast_room_edit_v42:'manage',merge_breakfast_changes:'manage'},tips:{tip_legacy_revision:'read',tip_c2_ledger:'read',tip_c2_preview:'read',tip_write_workspace_v14:'write',tip_create_workspace_state:'write',tip_finalize_workspace_v14:'finalize',tip_c2_finalize:'finalize',tip_c2_confirm_cash:'finalize'}};
export function relayPermission(module,path,method){
 if(!tables[module]||!['GET','HEAD','POST','PATCH','DELETE'].includes(method))return null;
 const match=/^\/api\/workplace-data\/rest\/v1\/(?:rpc\/([a-z0-9_]+)|([a-z0-9_]+))$/.exec(path);if(!match)return null;
 if(match[1])return method==='POST'&&rpc[module][match[1]]?module+':'+rpc[module][match[1]]:null;
 if(!tables[module].has(match[2]))return null;
 if(['GET','HEAD'].includes(method))return module+':read';
 // Existing financial writes use guarded RPCs, never raw table mutation in personal mode.
 if(module==='tips')return null;
 return 'breakfast:manage';
}
export async function relayData({client,request,module,publishableKey,fetcher=fetch}){
 const headers={'Cache-Control':'private, no-store, max-age=0','CDN-Cache-Control':'no-store','Vercel-CDN-Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Type':'application/json; charset=utf-8'};
 const fail=(status,error)=>new Response(JSON.stringify({error}),{status,headers});
 try{
  if(typeof publishableKey!=='string'||!publishableKey)return fail(503,'Datenzugang nicht eingerichtet.');
  const url=new URL(request.url),permission=relayPermission(module,url.pathname,request.method);if(!permission)return fail(403,'Diese Datenaktion ist nicht freigegeben.');
  const write=!['GET','HEAD'].includes(request.method),access=await client.identity(request,{permission,write});if(!access)return fail(401,'Persönlicher Zugang oder Berechtigung fehlt.');
  let body;if(write){body=await request.text();if(body.length>3000000)return fail(413,'Anfrage zu gross.');if(request.headers.get('content-type')?.split(';')[0]!=='application/json')return fail(400,'Ungültiges Datenformat.');}
  const jwt=await client.databaseToken(request);if(!jwt)return fail(503,'Datenzugang derzeit nicht verfügbar.');
  const target=new URL('https://xgbbwnmqgpwxxftnjrkc.supabase.co'+url.pathname.slice('/api/workplace-data'.length)+url.search);
  const upstreamHeaders={apikey:publishableKey,Authorization:'Bearer '+jwt};
  for(const name of ['content-type','accept','prefer','range','range-unit','x-silk-client-protocol']){const value=request.headers.get(name);if(value)upstreamHeaders[name]=value;}
  const response=await fetcher(target,{method:request.method,redirect:'error',headers:upstreamHeaders,body,signal:AbortSignal.timeout(25000)});
  for(const name of ['content-type','content-range','range-unit','preference-applied','retry-after']){const value=response.headers.get(name);if(value)headers[name]=value;}
  return new Response(request.method==='HEAD'?null:await response.arrayBuffer(),{status:response.status,headers});
 }catch{return fail(503,'Der gemeinsame Stand ist derzeit nicht erreichbar. Lokale Entwürfe bleiben erhalten.');}
}
