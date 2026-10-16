// Release-only native rehearsal. Synthetic data on the existing isolated standard runner.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import pg from 'pg';
import {connect,input,documentFor,target,output} from '../tests/ci/native-helper.mjs';
import {bundle,preflight} from './sql-bundle.mjs';
const h=await connect(),report={applicationCommit:'901b92a42350496c336fa7418fb9045a0ad785c2',releaseCommit:process.env.GITHUB_SHA,run:process.env.GITHUB_SERVER_URL+'/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID,postgres:h.version,syntheticOnly:true,cloudAcceptance:false,physicalDeviceTests:false,checks:[]};
const check=(name,details={})=>report.checks.push({name,status:'passed',...details});
const docker=(args,options={})=>execFileSync('docker',['exec','-i','supabase-db',...args],{maxBuffer:16*1024*1024,...options});
const sql=await bundle();let restore;
try{
 const pass=randomBytes(24).toString('hex');
 assert.equal((await h.http('/auth/v1/admin/users',{method:'POST',key:h.cfg.service,token:h.cfg.service,body:{email:'release@example.invalid',password:pass,email_confirm:true}})).status,200);
 const login=await h.http('/auth/v1/token?grant_type=password',{method:'POST',body:{email:'release@example.invalid',password:pass}});assert.equal(login.status,200);const token=login.body.access_token,actor=login.body.user.id;
 await h.admin.query(await readFile('release/live-schema-fixture.sql','utf8'));
 const other='00000000-0000-0000-0000-000000000001',i=input('1801.10',['A']);
 const doc=documentFor(i);doc.settlements['synthetic-old-archive']={id:'synthetic-old-archive',dataFormat:'legacy-html-v1',periodStart:'2034-01-01',periodEnd:'2034-01-01',legacyHtml:'SYNTHETIC IMMUTABLE ORIGINAL'};
 await h.admin.query("INSERT INTO public.tip_workspaces(id,name) VALUES($1,'SYNTHETIC RELEASE'),($2,'SYNTHETIC OTHER');",[target,other]);
 await h.admin.query('INSERT INTO public.tip_workspace_members(workspace_id,user_id) VALUES($1,$2)',[target,actor]);
 await h.admin.query('INSERT INTO public.tip_workspace_state(workspace_id,payload,revision) VALUES($1,$3,31),($2,$3,1)',[target,other,doc]);
 await h.admin.query("CREATE TABLE public.unrelated_release_sentinel(value text);INSERT INTO public.unrelated_release_sentinel VALUES('unchanged');");
 // Explicit per-table JSON snapshots include revision, receipt, timestamps and payment identity.
 const tables=async client=>(await client.query("select table_schema s,table_name t from information_schema.tables where table_schema in ('public','private') and table_name like 'tip_%' order by 1,2")).rows;
 async function fingerprints(client){const out={};for(const {s,t} of await tables(client))out[s+'.'+t]=(await client.query('SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),\'[]\')::text) hash,count(*)::int rows FROM '+s+'.'+t+' r')).rows[0];return out;}
 const before=await fingerprints(h.admin);
 await h.admin.query('BEGIN;'+preflight+'\n'+sql);await assert.rejects(h.admin.query('SELECT 1/0'),/division by zero/);await h.admin.query('ROLLBACK');
 assert.equal((await h.admin.query("select to_regclass('private.tip_c2_gate') t")).rows[0].t,null);assert.deepEqual(await fingerprints(h.admin),before);check('failed atomic installation rolls back all candidate objects and original rows');
 await h.admin.query(await readFile('release/INSTALL-PREPARED-NOT-APPLIED.sql','utf8'));
 const installed=await fingerprints(h.admin);for(const [t,v] of Object.entries(before))assert.deepEqual(installed[t],v,t);
 assert.equal(installed['private.tip_c2_gate'].rows,0);assert.equal(installed['private.tip_c2_operators'].rows,0);
 const grants=(await h.admin.query("select p.proname name,has_function_privilege('anon',p.oid,'execute') anonymous,has_function_privilege('authenticated',p.oid,'execute') member from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'tip_c2_%' or p.proname like 'tip_%_workspace_v14') order by 1")).rows;
 assert.equal(grants.length,6);for(const g of grants){assert.equal(g.anonymous,false);assert.equal(g.member,true);}check('exact target metadata install: unchanged original data, empty gates, explicit RPC rights',{rpcRights:grants});
 await assert.rejects(h.admin.query('BEGIN;'+preflight),/Candidate partly present/);await h.admin.query('ROLLBACK');check('repeat installation refuses existing candidate without dropping anything');
 await h.admin.query("NOTIFY pgrst,'reload schema'");let preview;
 for(let n=0;n<60;n++){preview=await h.rpc('tip_c2_preview',{p_expected_revision:31,p_input:i},token);if(preview.status===200)break;await new Promise(r=>setTimeout(r,200));}assert.equal(preview.status,200,JSON.stringify(preview.body));
 assert.equal(preview.body.permissions.enabled,false);
 const finalArgs={p_expected_revision:31,p_id:randomUUID(),p_input:i,p_cash_evidence:{adjustmentCents:-10,kind:'remainder',reference:'SYNTHETIC-RELEASE-REMAINDER'}};
 assert.equal((await h.rpc('tip_c2_finalize',finalArgs,token)).status,403);
 await h.admin.query('INSERT INTO private.tip_c2_gate(workspace_id,synthetic_only) VALUES($1,true)',[target]);
 await h.admin.query('INSERT INTO private.tip_c2_operators VALUES($1,$2,true,true)',[target,actor]);
 const closed=await h.rpc('tip_c2_finalize',finalArgs,token);assert.equal(closed.status,200,JSON.stringify(closed.body));const receipt=closed.body.payload.settlements[finalArgs.p_id];
 const cashArgs={p_expected_revision:Number(closed.body.revision),p_id:randomUUID(),p_root_id:finalArgs.p_id,p_chain_revision:0,p_receipt_id:finalArgs.p_id,p_kind:'baseline',p_lines:receipt.resultData.lines.map(x=>({id:x.id,amountCents:x.payoutCents})),p_evidence_ref:'SYNTHETIC-RELEASE-PAYOUT'};
 assert.equal((await h.rpc('tip_c2_confirm_cash',cashArgs,token)).status,200);
 const withPayments=await fingerprints(h.admin),originalRow=await h.row();
 // App-schema dump, not a full Supabase backup. Auth identities/roles are prerequisites.
 const dump=docker(['pg_dump','-U','postgres','-d','silk_c2_test_ci','--schema=public','--schema=private','--format=custom','--no-owner']);
 report.syntheticDumpSHA256=createHash('sha256').update(dump).digest('hex');report.syntheticDumpBytes=dump.length;
 docker(['psql','-U','supabase_admin','-d','silk_c2_test_ci','-v','ON_ERROR_STOP=1','-c','CREATE DATABASE silk_c2_test_restore OWNER postgres;']);
 const cfg=new URL(h.cfg.db);cfg.pathname='/silk_c2_test_restore';restore=new pg.Client({connectionString:cfg.toString()});await restore.connect();
 await restore.query("DROP SCHEMA public;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;").catch(async e=>{throw Error('restore prerequisites: '+e.message);});
 await restore.query('INSERT INTO auth.users VALUES($1)',[actor]);
 docker(['pg_restore','-U','postgres','-d','silk_c2_test_restore','--single-transaction','--exit-on-error','--no-owner'],{input:dump});
 assert.deepEqual(await fingerprints(restore),withPayments);check('pg_dump / pg_restore into separate empty PostgreSQL 17 database',{allTablesIdentical:true,authSessionsRestored:false});
 await restore.query("SELECT set_config('request.jwt.claims',$1,false),set_config('request.headers','{\"x-silk-client-protocol\":\"4\"}',false)",[JSON.stringify({sub:actor,role:'authenticated'})]);
 await restore.query('SET ROLE authenticated');
 const replay=(await restore.query('SELECT (public.tip_c2_finalize($1,$2,$3,$4,NULL,NULL,NULL,$5)).payload payload',[target,31,finalArgs.p_id,i,finalArgs.p_cash_evidence])).rows[0];assert.deepEqual(replay.payload.settlements[finalArgs.p_id],receipt);
 await restore.query('SELECT public.tip_c2_confirm_cash($1,$2,$3,$4,$5,$6,$7,$8,$9)',[target,cashArgs.p_expected_revision,cashArgs.p_id,cashArgs.p_root_id,0,cashArgs.p_receipt_id,'baseline',JSON.stringify(cashArgs.p_lines),cashArgs.p_evidence_ref]);
 await restore.query('RESET ROLE');assert.deepEqual(await fingerprints(restore),withPayments);check('restored finalization and payout replay retain original receipts and events without duplication');
 await h.admin.query(await readFile('release/PAUSE-PREPARED-NOT-APPLIED.sql','utf8'));
 const changed=structuredClone(originalRow.payload);changed.days['2035-01-01'].f='999';
 const blocked=await h.rpc('tip_write_workspace_v14',{p_expected_revision:Number(originalRow.revision),p_payload:changed},token);assert.equal(blocked.body.code,'55000');
 assert.equal((await h.rpc('tip_c2_finalize',finalArgs,token)).status,403);assert.equal((await h.rpc('tip_c2_confirm_cash',cashArgs,token)).status,403);
 assert.deepEqual(await h.row(),originalRow);
 const paused=await fingerprints(h.admin);for(const [t,v] of Object.entries(withPayments))if(!['private.tip_c2_gate','private.tip_c2_operators'].includes(t))assert.deepEqual(paused[t],v,t);
 await h.admin.query('UPDATE public.tip_workspace_state SET payload=payload WHERE workspace_id=$1',[other]);assert.equal((await h.admin.query('SELECT value FROM public.unrelated_release_sentinel')).rows[0].value,'unchanged');
 check('forward rollback blocks saving, finalization and payout; preserves receipts/events and unrelated workspace');
 report.status='passed';
}catch(e){report.status='failed';report.error={message:e.message.slice(0,1200),code:e.code};process.exitCode=1;}
finally{await restore?.end();await h.admin.end();await writeFile(output()+'/release-results.json',JSON.stringify(report,null,2));console.log('SILK_RELEASE_EVIDENCE_BEGIN\n'+JSON.stringify(report,null,2)+'\nSILK_RELEASE_EVIDENCE_END');}
