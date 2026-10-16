// App-scoped data recovery into an empty local PGlite instance. Never connects to cloud.
// Data file stays private. Authentication sessions, credentials and pairing codes excluded.
import {PGlite} from '@electric-sql/pglite';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {bundle} from './sql-bundle.mjs';
const path=process.argv[2];assert.ok(path&&path.startsWith('/'),'Explicit absolute private snapshot required');
const bytes=await readFile(path),backup=JSON.parse(bytes),db=new PGlite();
assert.equal(backup.workspace,'edb875da-fea6-49a0-8e50-e314254752a6');
const report={scope:'Trinkgeld workspace logical snapshot; not full Supabase/Auth backup',runtime:'local PGlite',cloudWrites:false,privateDataPublished:false,backupSHA256:createHash('sha256').update(bytes).digest('hex'),capturedAt:backup.captured_at,checks:[]};
const q=s=>'"'+s.replaceAll('"','""')+'"';
try{
 await db.exec("CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid primary key);CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;");
 await db.exec(await readFile('release/live-schema-fixture.sql','utf8'));
 const ids=new Set(Object.values(backup.tables).flatMap(rows=>rows.flatMap(r=>Object.values(r))).filter(v=>typeof v==='string'&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)));
 for(const id of ids)await db.query('INSERT INTO auth.users(id) VALUES($1)',[id]);
 // Empty isolated destination only; FK order. Original identities retained without login credentials.
 const order=['tip_workspaces','tip_workspace_members','tip_devices','tip_staff_members','tip_shift_types','tip_days','tip_assignments','tip_settlements','tip_settlement_lines','tip_legacy_snapshots','tip_drafts','tip_migrations','tip_sync_mutations','tip_workspace_state'];
 for(const table of order){assert.ok(Object.hasOwn(backup.tables,table));await db.query('INSERT INTO public.'+q(table)+' SELECT * FROM jsonb_populate_recordset(null::public.'+q(table)+',$1::jsonb)',[JSON.stringify(backup.tables[table])]);}
 async function compare(label){for(const table of order){const x=(await db.query('WITH restored AS (SELECT * FROM public.'+q(table)+'), original AS (SELECT * FROM jsonb_populate_recordset(null::public.'+q(table)+',$1::jsonb)), diff AS ((SELECT * FROM restored EXCEPT ALL SELECT * FROM original) UNION ALL (SELECT * FROM original EXCEPT ALL SELECT * FROM restored)) SELECT count(*)::int differences FROM diff',[JSON.stringify(backup.tables[table])])).rows[0];assert.equal(x.differences,0,table+' differs');}report.checks.push(label);}
 await compare('all 14 scoped tables restored; every field and original revision identical');
 await db.exec('BEGIN;'+await bundle());await db.exec('ROLLBACK;');assert.equal((await db.query("select to_regclass('private.tip_c2_gate') object")).rows[0].object,null);await compare('rolled back installation leaves all data unchanged and no C2 tables');
 await db.exec('BEGIN;'+await bundle()+'COMMIT;');await compare('prepared installation leaves all original rows unchanged');
 assert.equal((await db.query('SELECT count(*)::int n FROM private.tip_c2_gate')).rows[0].n,0);
 assert.equal((await db.query('SELECT count(*)::int n FROM private.tip_c2_operators')).rows[0].n,0);
 assert.equal((await db.query("select has_function_privilege('anon','public.tip_c2_finalize(uuid,bigint,uuid,jsonb,text,bigint,text,jsonb)','execute') allowed")).rows[0].allowed,false);
 report.checks.push('release gates and operators empty; explicit anonymous EXECUTE removed');
 report.rows=Object.fromEntries(order.map(t=>[t,backup.tables[t].length]));report.postgres=(await db.query('select version() v')).rows[0].v;report.status='passed';
}finally{await db.close();}
await writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
