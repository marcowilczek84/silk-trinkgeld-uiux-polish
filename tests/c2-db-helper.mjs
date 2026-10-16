import {database,target,member,documentFor,input} from './v14-db-helper.mjs';
import {readFile} from 'node:fs/promises';
export {target,member,documentFor,input};
export const second='00000000-0000-0000-0000-000000000003',editor='00000000-0000-0000-0000-000000000004',outsider='00000000-0000-0000-0000-000000000005';
export async function c2db({gate=true}={}){
 const db=await database();await db.exec('reset role');
 await db.exec(`create or replace function auth.uid() returns uuid language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
 create table public.tip_workspace_members(workspace_id uuid references public.tip_workspaces(id),user_id uuid,active boolean not null,primary key(workspace_id,user_id));
 alter table public.tip_workspace_members enable row level security;
 revoke all on public.tip_workspace_members from public,anon,authenticated;
 insert into public.tip_workspace_members values('${target}','${member}',true),('${target}','${second}',true),('${target}','${editor}',true);
 -- Same active-membership predicate as the read-only verified live schema (16 Oct 2026).
 create or replace function private.tip_is_workspace_member(id uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.tip_workspace_members m where m.workspace_id=id and m.user_id=auth.uid() and m.active=true)$$;`);
 for(const file of ['v14-prototypes/variant-c-postgres-PREPARED-NOT-APPLIED.sql','docs/production/c2-server-PREPARED-NOT-APPLIED.sql'])await db.exec(await readFile(new URL('../'+file,import.meta.url),'utf8'));
 if(gate)await db.query('insert into private.tip_c2_gate values($1,true)',[target]);
 await db.query('insert into private.tip_c2_operators values($1,$2,true,true),($1,$3,true,true)',[target,member,second]);
 await actor(db,member);return db;
}
export async function actor(db,id){await db.exec(`reset role;set role authenticated;select set_config('request.headers','{"x-silk-client-protocol":"4"}',false)`);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
export async function row(db){return (await db.query('select * from tip_workspace_state where workspace_id=$1',[target])).rows[0];}
export async function store(db,i){let r=await row(db);const doc=documentFor(i);doc.settlements=r.payload.settlements;return (await db.query('select r.* from tip_write_workspace_v14($1,$2,$3) r',[target,r.revision,doc])).rows[0];}
export async function preview(db,i,root=null){const r=await row(db);return (await db.query('select tip_c2_preview($1,$2,$3,$4) result',[target,r.revision,i,root])).rows[0].result;}
export const evidence=i=>{const amount=Math.round(Object.values(i.byDate).reduce((s,d)=>s+Number(d.f)*100+Number(d.s)*100,0)),delta=Math.floor((amount+50)/100)*100-amount;return delta?{adjustmentCents:delta,kind:delta>0?'funding':'remainder',reference:'SYNTHETIC-CASH-NOTE'}:null;};
export async function finish(db,i,id,options={}){const r=await row(db);return (await db.query('select r.* from tip_c2_finalize($1,$2,$3,$4,$5,$6,$7,$8) r',[target,options.revision??r.revision,id,i,options.root??null,options.chain??null,options.reason??null,options.cash===undefined?evidence(i):options.cash])).rows[0];}
export async function cash(db,root,id,lines,options={}){const r=await row(db);return (await db.query('select tip_c2_confirm_cash($1,$2,$3,$4,$5,$6,$7,$8,$9) result',[target,options.revision??r.revision,id,root,options.chain??0,options.receipt??root,options.kind??'baseline',lines,options.ref??id])).rows[0].result;}
