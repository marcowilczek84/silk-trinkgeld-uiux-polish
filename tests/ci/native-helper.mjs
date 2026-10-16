import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {resolve} from 'node:path';
import pg from 'pg';
import {createClient} from '@supabase/supabase-js';
export {input,documentFor,target} from '../v14-db-helper.mjs';
import {input,documentFor,target} from '../v14-db-helper.mjs';
export const output=()=>resolve(process.env.RUNNER_TEMP,'silk-c2-ci');
export async function connect(){
 assert.equal(process.env.SILK_C2_CI,'synthetic-only');assert.equal(process.env.GITHUB_ACTIONS,'true');
 const cfg=JSON.parse(await readFile(output()+'/connection.json','utf8'));
 assert.equal(cfg.api,'http://127.0.0.1:54321');const url=new URL(cfg.db);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/silk_c2_test_ci');
 const admin=new pg.Client({connectionString:cfg.db,application_name:'silk-ci-admin'});await admin.connect();
 const v=(await admin.query("select current_database() db,current_setting('server_version') version,current_setting('server_version_num')::int number")).rows[0];assert.equal(v.db,'silk_c2_test_ci');assert.equal(Math.floor(v.number/10000),17);
 const client=(token,key=cfg.anon)=>createClient(cfg.api,key,{auth:{autoRefreshToken:false,persistSession:false},global:{headers:token?{Authorization:'Bearer '+token,'x-silk-client-protocol':'4'}:{'x-silk-client-protocol':'4'}}});
 async function http(path,{token,key=cfg.anon,method='GET',body,protocol='4',signal,headers={}}={}){
  const r=await fetch(cfg.api+path,{method,signal:signal||AbortSignal.timeout(20000),headers:{apikey:key,...(token?{authorization:'Bearer '+token}:{}),'content-type':'application/json',...(protocol===null?{}:{'x-silk-client-protocol':protocol}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:r.status,body:data};
 }
 const rpc=async(name,args,token,options={})=>{const r=await http('/rest/v1/rpc/'+name,{method:'POST',token,body:{p_workspace_id:target,...args},...options});if(r.status===200&&Array.isArray(r.body)&&r.body.length===1)r.body=r.body[0];return r;};
 const row=async()=> (await admin.query('select * from public.tip_workspace_state where workspace_id=$1',[target])).rows[0];
 const store=async(i,token)=>{const r=await row(),doc=documentFor(i);doc.settlements=r.payload.settlements;const result=await rpc('tip_write_workspace_v14',{p_expected_revision:Number(r.revision),p_payload:doc},token);assert.equal(result.status,200,JSON.stringify(result.body));return result.body;};
 const users=JSON.parse(await readFile(output()+'/users.json','utf8').catch(()=> '{}'));
 const h={cfg,admin,version:v.version,client,http,rpc,row,store,users};
 return h;
}
export async function bootstrap(h){
 for(const role of ['a','b','editor','outsider']){
  const password=randomBytes(24).toString('hex');
  const email='silk-ci-'+role+'@example.invalid';
  const created=await h.http('/auth/v1/admin/users',{method:'POST',key:h.cfg.service,token:h.cfg.service,body:{email,password,email_confirm:true}});assert.equal(created.status,200,'create synthetic Auth user '+role);
  const login=await h.http('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});assert.equal(login.status,200,'password login '+role);
  h.users[role]={id:login.body.user.id,session:login.body};
 }
 await writeFile(output()+'/users.json',JSON.stringify(h.users),{mode:0o600});
 await h.admin.query(`create schema private;
 create table public.tip_workspaces(id uuid primary key);
 create table public.tip_workspace_members(workspace_id uuid references public.tip_workspaces,user_id uuid references auth.users,active boolean not null,primary key(workspace_id,user_id));
 create function private.tip_is_workspace_member(id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.tip_workspace_members m where m.workspace_id=id and m.user_id=auth.uid() and m.active=true)$$;
 create table public.tip_workspace_state(workspace_id uuid primary key references public.tip_workspaces,payload jsonb not null,revision bigint not null default 1,updated_at timestamptz default now(),created_at timestamptz default now());
 create function public.tip_touch_revision() returns trigger language plpgsql set search_path='' as $$begin new.revision:=old.revision+1;new.updated_at:=now();return new;end$$;
 create trigger tip_workspace_state_touch before update on public.tip_workspace_state for each row execute function public.tip_touch_revision();
 alter table public.tip_workspace_state enable row level security;
 alter table public.tip_workspace_members enable row level security;
 alter table public.tip_workspaces enable row level security;
 revoke all on public.tip_workspace_members,public.tip_workspaces,public.tip_workspace_state from public,anon,authenticated;
 create policy members on public.tip_workspace_state for all to authenticated using(private.tip_is_workspace_member(workspace_id)) with check(private.tip_is_workspace_member(workspace_id));
 grant usage on schema private to authenticated;
 revoke all on function private.tip_is_workspace_member(uuid) from public,anon;
 grant execute on function private.tip_is_workspace_member(uuid) to authenticated;
 grant select on public.tip_workspace_state to authenticated;
 grant insert(workspace_id,payload),update(payload) on public.tip_workspace_state to authenticated;
 insert into public.tip_workspaces values('${target}');
 alter publication supabase_realtime add table public.tip_workspace_state;
 alter table public.tip_workspace_state replica identity full;`);
 for(const file of ['docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql','v14-prototypes/variant-c-postgres-PREPARED-NOT-APPLIED.sql','docs/production/c2-server-PREPARED-NOT-APPLIED.sql'])await h.admin.query(await readFile(file,'utf8'));
 await h.admin.query("notify pgrst,'reload schema'");
 // Envoy protects the OpenAPI root separately. Probe the actual application RPC;
 // no membership fixture exists yet, so a loaded function must deny access.
 let probe;
 for(let n=0;n<60;n++){probe=await h.rpc('tip_c2_preview',{p_expected_revision:1,p_input:input()},h.users.a.session.access_token);if(probe.status===403&&probe.body.message==='SILK_FORBIDDEN')return;await new Promise(r=>setTimeout(r,200));}
 throw Error('PostgREST RPC readiness failed: '+JSON.stringify(probe));
}
export async function reset(h){
 assert.equal((await h.admin.query('select current_database() db')).rows[0].db,'silk_c2_test_ci');
 // Only fresh synthetic fixture tables in this named disposable database; never cloud.
 await h.admin.query('truncate private.tip_workspace_events_v14,private.tip_c2_cash,private.tip_c2_operations,private.tip_c2_chains,private.tip_c2_operators,private.tip_c2_gate,public.tip_workspace_members,public.tip_workspace_state');
 await h.admin.query('insert into public.tip_workspace_state(workspace_id,payload) values($1,$2)',[target,documentFor(input())]);
 for(const k of ['a','b','editor'])await h.admin.query('insert into public.tip_workspace_members values($1,$2,true)',[target,h.users[k].id]);
 await h.admin.query('insert into private.tip_c2_gate values($1,true)',[target]);
 for(const k of ['a','b'])await h.admin.query('insert into private.tip_c2_operators values($1,$2,true,true)',[target,h.users[k].id]);
}
export async function concurrent(h,requests,beforeRelease=async()=>{}){
 const lock=new pg.Client({connectionString:h.cfg.db,application_name:'silk-ci-lock-holder'});await lock.connect();
 await lock.query('begin');await lock.query('select * from public.tip_workspace_state where workspace_id=$1 for update',[target]);
 const pending=requests.map(f=>f());let waiters=[];
 try{
  for(let i=0;i<100;i++){
   waiters=(await h.admin.query("select pid from pg_stat_activity where datname=current_database() and wait_event_type='Lock' and pid<>pg_backend_pid() and query ilike '%tip_%'")).rows;
   if(waiters.length>=requests.length)break;await new Promise(r=>setTimeout(r,50));
  }
  assert.ok(waiters.length>=requests.length,'distinct native backend transactions must overlap under lock');
  await beforeRelease();
 }finally{await lock.query('commit');await lock.end();}
 const results=await Promise.all(pending);return {results,backendCount:new Set(waiters.map(x=>x.pid)).size};
}
