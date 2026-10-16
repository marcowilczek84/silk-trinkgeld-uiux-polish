import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
export const target='edb875da-fea6-49a0-8e50-e314254752a6',other='00000000-0000-0000-0000-000000000001',member='00000000-0000-0000-0000-000000000002';
export function input(amount='100',staff=['A','B']){return {mode:'day',singleDate:'2035-01-01',periodStart:'2035-01-01',periodEnd:'2035-01-01',byDate:{'2035-01-01':{f:amount,s:'0',assignments:staff.map(name=>({name,shift:'F1'}))}},staff,shifts:[{name:'F1',f:1,s:0}],staffLabels:{}};}
export function documentFor(i=input()){return {format:2,period:{mode:i.mode,singleDate:i.singleDate,periodStart:i.periodStart,periodEnd:i.periodEnd},days:Object.fromEntries(Object.entries(i.byDate).map(([date,d])=>[date,{f:d.f,s:d.s,assignments:Object.fromEntries(d.assignments.map(a=>[a.name,a.shift]))}])),staff:i.staff,staffLabels:i.staffLabels,shifts:i.shifts,settlements:{},work:{activeId:null,checkpoint:null,calculation:null}};}
export async function database(){const db=new PGlite();await db.exec(`
create schema private;create schema auth;create role authenticated;create role anon;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table tip_workspaces(id uuid primary key);insert into tip_workspaces values('${target}'),('${other}');
create function private.tip_is_workspace_member(id uuid) returns boolean language sql stable security definer as $$select id='${target}'::uuid and auth.uid()='${member}'::uuid$$;
create table tip_workspace_state(workspace_id uuid primary key references tip_workspaces(id),payload jsonb not null,revision bigint not null default 1,updated_at timestamptz default now(),created_at timestamptz default now());
create function tip_touch_revision() returns trigger language plpgsql as $$begin new.revision:=old.revision+1;new.updated_at:=now();return new;end$$;
create trigger tip_workspace_state_touch before update on tip_workspace_state for each row execute function tip_touch_revision();
alter table tip_workspace_state enable row level security;create policy members on tip_workspace_state for all to authenticated using(private.tip_is_workspace_member(workspace_id)) with check(private.tip_is_workspace_member(workspace_id));
grant usage on schema public,private,auth to authenticated;grant select on tip_workspace_state to authenticated;grant insert(workspace_id,payload),update(payload) on tip_workspace_state to authenticated;
`);await db.query('insert into tip_workspace_state(workspace_id,payload) values($1,$2),($3,$2)',[target,documentFor(),other]);
await db.exec(await readFile(new URL('../docs/production/v14-integrity-PREPARED-NOT-APPLIED.sql',import.meta.url),'utf8'));
await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${member}',false);select set_config('request.headers','{"x-silk-client-protocol":"4"}',false);`);return db;}
export async function write(db,payload,rev=1){return (await db.query('select r.* from public.tip_write_workspace_v14($1,$2,$3) r',[target,rev,payload])).rows[0];}
export async function finalize(db,i=input(),rev=1,id='00000000-0000-0000-0000-000000000010'){return (await db.query('select r.* from public.tip_finalize_workspace_v14($1,$2,$3,$4) r',[target,rev,id,i])).rows[0];}
