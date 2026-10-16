// Release packaging only: candidate SQL is verified byte-for-byte, never executed here.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
export async function bundle(){
 const manifest=JSON.parse(await readFile('release/sql-manifest.json','utf8'));
 const parts=[];
 for(const f of manifest.sources){const sql=await readFile(f.path,'utf8');assert.equal(createHash('sha256').update(sql).digest('hex'),f.sha256,'Candidate source changed: '+f.path);parts.push('-- Source: '+f.path+'\n'+sql.replace(/^BEGIN;\s*$/gm,'').replace(/^COMMIT;\s*$/gm,''));}
 return parts.join('\n')+`\n-- Target's default privileges explicitly grant anon EXECUTE. Remove that inherited grant\n-- from the new authenticated-only RPCs without changing global defaults or other apps.\nREVOKE ALL ON FUNCTION public.tip_write_workspace_v14(uuid,bigint,jsonb),public.tip_finalize_workspace_v14(uuid,bigint,uuid,jsonb),public.tip_c2_preview(uuid,bigint,jsonb,text),public.tip_c2_finalize(uuid,bigint,uuid,jsonb,text,bigint,text,jsonb),public.tip_c2_confirm_cash(uuid,bigint,uuid,text,bigint,text,text,jsonb,text),public.tip_c2_ledger(uuid,bigint,text) FROM anon;\n`;
}
export const preflight=`DO $$ BEGIN
 IF current_setting('server_version_num')::int/10000 <> 17 THEN RAISE EXCEPTION 'Release requires verified PostgreSQL 17';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.tip_workspace_state WHERE workspace_id='edb875da-fea6-49a0-8e50-e314254752a6' AND payload->>'format'='2') THEN RAISE EXCEPTION 'Workspace adoption required; no automatic migration';END IF;
 IF to_regclass('private.tip_c2_gate') IS NOT NULL OR to_regclass('private.tip_workspace_events_v14') IS NOT NULL OR to_regprocedure('public.tip_write_workspace_v14(uuid,bigint,jsonb)') IS NOT NULL THEN RAISE EXCEPTION 'Candidate partly present; stop and compare schema';END IF;
END $$;`;
if(process.argv[2]==='prepare'){
 const sql='-- PREPARED ONLY. Separate SQL approval + fresh verified backup required.\n-- One transaction: a failure rolls back every DDL step. No data backfill, gate or operators.\nBEGIN;\nSET LOCAL lock_timeout=\'5s\';\n'+preflight+'\nLOCK TABLE public.tip_workspace_state IN SHARE ROW EXCLUSIVE MODE;\n'+await bundle()+"\nNOTIFY pgrst,'reload schema';\nCOMMIT;\n";
 await writeFile(process.argv[3]||'release/INSTALL-PREPARED-NOT-APPLIED.sql',sql);
 console.log('Prepared atomic candidate SQL; no database connection. SHA256 '+createHash('sha256').update(sql).digest('hex'));
}
