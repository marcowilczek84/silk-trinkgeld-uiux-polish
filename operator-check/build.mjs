// Separate preview root. Never imported by the production build.
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir,cp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
import {c2db,target,member,input,documentFor} from '../tests/c2-db-helper.mjs';
assert.notEqual(process.env.VERCEL_ENV,'production','Operator check must never build for Production');
process.chdir(new URL('../',import.meta.url).pathname);
const app='a5df93a425360a0a35056890bee03432b29fffa8';
for(const file of ['index.html','c2-integration.js','c2-workflow-ui.js','sync-service.js','draft-workflow.js','financial-core.js']){
 const accepted=execFileSync('git',['show',app+':'+file]);
 assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),createHash('sha256').update(accepted).digest('hex'),file+' changed from accepted app');
}
execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit',env:{...process.env,SILK_LOCAL_ONLY:'1',SILK_SUPABASE_URL:'',SILK_SUPABASE_PUBLISHABLE_KEY:'',SILK_C2_LOCAL_API:'',SILK_C2_APP_APPROVAL:''}});
await rm('operator-check/public',{recursive:true,force:true});await mkdir('operator-check/public',{recursive:true});await cp('dist','operator-check/public',{recursive:true});
const db=await c2db();
try{
 await db.exec('reset role');
 // Simulate the fully approved state only inside the synthetic browser database.
 // Original server gates and client code stay unchanged. No cloud credentials exist.
 await db.query("update private.tip_c2_gate set synthetic_only=false,sql_approval_ref='SYNTHETIC-BROWSER-ACCEPTANCE-ONLY',approved_at=now() where workspace_id=$1",[target]);
 await db.query('update public.tip_workspace_state set payload=$1 where workspace_id=$2',[documentFor(input('1801.10',['TEST A'])),target]);
 await db.exec("select set_config('request.jwt.claim.sub','',false)");
 const dump=await db.dumpDataDir('gzip');await writeFile('operator-check/public/synthetic-fixture.tgz',Buffer.from(await dump.arrayBuffer()));
}finally{await db.close();}
for(const file of ['pglite.wasm','pglite.data'])await cp('node_modules/@electric-sql/pglite/dist/'+file,'operator-check/public/'+file);
await build({entryPoints:['operator-check/transport.mjs'],outfile:'operator-check/public/supabase-client.js',bundle:true,format:'iife',platform:'browser',external:['node:*'],target:['safari16'],define:{'import.meta.url':'location.href',SYNTHETIC_WORKSPACE:JSON.stringify(target),SYNTHETIC_ACTOR:JSON.stringify(member)},minify:true});
await writeFile('operator-check/public/supabase-config.js','window.SILK_SUPABASE_CONFIG={url:"",publishableKey:"",localOnly:false,c2Candidate:true,c2LocalTest:false,c2AppApproved:true};\n');
let html=await readFile('operator-check/public/index.html','utf8');
html=html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; connect-src \'self\'; script-src \'self\' \'unsafe-inline\' \'wasm-unsafe-eval\'; style-src \'self\' \'unsafe-inline\'; object-src \'none\'; base-uri \'self\'; form-action \'none\'"><style>dialog::before{content:"BEDIENCHECK · NUR TESTDATEN · KEINE ECHTE AUSZAHLUNG";display:block;font:600 12px/1.5 system-ui;color:#155c55;padding:8px 0 14px}</style>');
html=html.replace(/<body([^>]*)>/,'<body$1><aside id="operatorCheckNotice" style="padding:10px 16px;background:#e8f5f3;color:#123b37;border-bottom:1px solid #aacdc7;font:14px/1.45 system-ui;position:relative;z-index:0"><strong>Bediencheck · nur Testdaten · keine echte Auszahlung</strong><p style="margin:4px 0">Abschluss mit Referenz TEST-KASSE bestätigen, danach Beleg öffnen → Auszahlungsnachweise laden → Auszahlung mit TEST-ZAHLUNG bestätigen. Anschliessend neu laden.</p><span id="operatorCheckState" role="status">Testdaten werden vorbereitet …</span></aside>');
await writeFile('operator-check/public/index.html',html);
await writeFile('operator-check/public/check-manifest.json',JSON.stringify({appCommit:app,testTransport:'PGlite 0.5.10 in this browser only; no Supabase, Auth, Realtime or cross-device transport',syntheticOnly:true,cloudConnections:false,physicalAcceptance:false},null,2));
console.log('Synthetic browser operator check built; production application unchanged.');
