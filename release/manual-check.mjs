// Manual operator check only. Uses existing synthetic loopback adapter, not cloud Supabase.
// Product source stays byte-for-byte at the accepted candidate. No real data or payments.
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {harness} from '../tests/c2-http-harness.mjs';
import {input,documentFor,target,member} from '../tests/c2-db-helper.mjs';
import assert from 'node:assert/strict';
assert.ok(!process.env.VERCEL_ENV&&!process.env.SILK_SUPABASE_URL&&!process.env.DATABASE_URL,'No cloud environment allowed');
const h=await harness({port:55449});
try{
 execFileSync(process.execPath,['scripts/build.mjs'],{stdio:'inherit',env:{...process.env,SILK_C2_LOCAL_API:h.origin,SILK_SUPABASE_PUBLISHABLE_KEY:'synthetic-loopback-only'}});
 assert.equal((await h.rpc('tip_write_workspace_v14',{p_expected_revision:1,p_payload:documentFor(input('1801.10',['TEST A']))})).status,200);
 const session={access_token:h.token,refresh_token:'synthetic-only',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id:member,aud:'authenticated',role:'authenticated'}};
 await writeFile('dist/c2-manual-start.html',`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SILK Bediencheck – Testdaten</title><body><h1>Kurzer Bediencheck</h1><p>Nur synthetische Daten. Keine Cloud-Verbindung und keine echte Auszahlung. Dieser lokale Testadapter ersetzt keine Supabase-Cloud-Abnahme.</p><button id="start">Synthetischen Bediencheck öffnen</button><script>document.getElementById('start').onclick=()=>{localStorage.setItem('sb-127-auth-token',${JSON.stringify(JSON.stringify(session))});localStorage.setItem('silk_workspace_connection_v1',${JSON.stringify(JSON.stringify({id:target,name:'SYNTHETISCHER BEDIENCHECK'}))});location.href='/';};</script></body></html>`);
 console.log('Bediencheck bereit: '+h.origin+'/c2-manual-start.html');
 console.log('Anleitung: docs/C2_RELEASE_BEDIENCHECK.md. Nur Testbeträge verwenden. Beenden: Strg+C.');
}catch(e){await h.close();throw e;}
let closing=false;async function close(){if(closing)return;closing=true;await h.close();process.exit(0);}process.on('SIGINT',close);process.on('SIGTERM',close);
