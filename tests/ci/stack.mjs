// Disposable GitHub-hosted runner only. Never uses Supabase Management API/secrets.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {execFileSync,spawn} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {resolve} from 'node:path';

assert.equal(process.env.GITHUB_ACTIONS,'true');
assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
assert.equal(process.env.RUNNER_OS,'Linux');
assert.equal(process.env.SILK_C2_CI,'synthetic-only');
assert.equal(process.env.GITHUB_REPOSITORY,'marcowilczek84/silk-trinkgeld-uiux-polish');
for(const key of ['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SILK_SUPABASE_URL','DATABASE_URL'])assert.ok(!process.env[key],key+' must not be injected');
const dir=resolve(process.env.RUNNER_TEMP,'silk-c2-ci'),source=resolve('.ci-supabase-source/docker');
const config=dir+'/compose.json',secretFile=dir+'/connection.json';
await mkdir(dir,{recursive:true,mode:0o700});
const command=process.argv[2];
const docker=args=>execFileSync('docker',args,{encoding:'utf8',maxBuffer:8*1024*1024});
const compose=args=>['compose','--project-name','silk-c2-ci','-f',config,...args];
async function diagnosticLogs(){
 let masks=[];try{masks=(await readFile(dir+'/stack.env','utf8')).split('\n').filter(x=>/^[A-Z_]*(KEY|PASSWORD|SECRET|TOKEN)[A-Z_]*=/.test(x)).map(x=>x.slice(x.indexOf('=')+1)).filter(x=>x.length>5);}catch{}
 for(const service of ['db','supavisor','auth','rest','realtime'])try{
  let log=docker(compose(['logs','--no-color','--tail','45',service]));for(const secret of masks)log=log.split(secret).join('[REDACTED]');
  log=log.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[REDACTED JWT]').replace(/(postgres(?:ql)?:\/\/[^: /]+:)[^@\s]+@/g,'$1[REDACTED]@');
  console.log('SANITIZED SERVICE '+service+'\n'+log);
 }catch{}
}
async function run(exe,args,options={}){await new Promise((resolve,reject)=>{const child=spawn(exe,args,{stdio:'inherit',...options});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error(exe+' exited '+code)));});}
if(command==='prepare'){
 const env=Object.fromEntries((await readFile(source+'/.env.example','utf8')).split('\n').filter(x=>/^[A-Z_]+=/.test(x)).map(x=>{const i=x.indexOf('=');return [x.slice(0,i),x.slice(i+1)];}));
 const random=n=>randomBytes(n).toString('hex');const jwtSecret=random(32);
 const jwt=role=>{const b=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=b({alg:'HS256',typ:'JWT'})+'.'+b({role,iss:'silk-c2-synthetic',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200});return body+'.'+createHmac('sha256',jwtSecret).update(body).digest('base64url');};
 Object.assign(env,{POSTGRES_PASSWORD:random(24),POSTGRES_HOST:'db',POSTGRES_PORT:'5432',POSTGRES_DB:'silk_c2_test_ci',JWT_SECRET:jwtSecret,ANON_KEY:jwt('anon'),SERVICE_ROLE_KEY:jwt('service_role'),JWT_EXPIRY:'3600',DASHBOARD_USERNAME:'synthetic',DASHBOARD_PASSWORD:random(24),SECRET_KEY_BASE:random(48),REALTIME_DB_ENC_KEY:random(8),VAULT_ENC_KEY:random(16),PG_META_CRYPTO_KEY:random(24),LOGFLARE_PUBLIC_ACCESS_TOKEN:random(24),LOGFLARE_PRIVATE_ACCESS_TOKEN:random(24),S3_PROTOCOL_ACCESS_KEY_ID:random(16),S3_PROTOCOL_ACCESS_KEY_SECRET:random(32),MINIO_ROOT_PASSWORD:random(24),OPENAI_API_KEY:'',SUPABASE_PUBLIC_URL:'http://127.0.0.1:54321',API_EXTERNAL_URL:'http://127.0.0.1:54321/auth/v1',SITE_URL:'http://127.0.0.1:55441',ADDITIONAL_REDIRECT_URLS:'',ENABLE_EMAIL_AUTOCONFIRM:'true',ENABLE_PHONE_SIGNUP:'false',ENABLE_PHONE_AUTOCONFIRM:'false',SMTP_HOST:'mailpit',SMTP_PORT:'1025',SMTP_USER:'',SMTP_PASS:'',SMTP_ADMIN_EMAIL:'test@example.invalid',SMTP_SENDER_NAME:'SILK synthetic only',STUDIO_DEFAULT_ORGANIZATION:'SILK synthetic CI',STUDIO_DEFAULT_PROJECT:'Disposable C2 test',POOLER_TENANT_ID:'silk-c2-ci',POOLER_DEFAULT_POOL_SIZE:'5',POOLER_MAX_CLIENT_CONN:'20',POOLER_DB_POOL_SIZE:'2',FUNCTIONS_VERIFY_JWT:'true'});
 for(const [key,value] of Object.entries(env))if(/KEY|PASSWORD|SECRET|TOKEN/.test(key)&&value)console.log('::add-mask::'+value);
 await writeFile(dir+'/stack.env',Object.entries(env).map(([k,v])=>k+'='+v).join('\n'),{mode:0o600});
 const c=JSON.parse(docker(['compose','--env-file',dir+'/stack.env','-f',source+'/docker-compose.yml','config','--format','json']));
 c.name='silk-c2-ci';c.networks={default:{name:'silk-c2-ci-internal',internal:true}};
 for(const service of Object.values(c.services)){service.ports=[];service.restart='no';assert.ok(!service.network_mode);}
 c.services.db.image='supabase/postgres:17.11.0.004';
 c.services.rest.image='postgrest/postgrest:v16.4';
 c.services.realtime.image='supabase/realtime:v2.143.4';
 c.services.storage.image='supabase/storage-api:v1.82.1';
 // Stay within the standard runner's descriptor limit; no privilege escalation.
 c.services.supavisor.environment.RLIMIT_NOFILE='1024';
 c.services.db.ports=[{target:5432,published:'54322',host_ip:'127.0.0.1',protocol:'tcp'}];
 c.services['api-gw'].ports=[{target:8000,published:'54321',host_ip:'127.0.0.1',protocol:'tcp'}];
 c.services.mailpit={image:'axllent/mailpit:v1.30.2',networks:{default:null},environment:{MP_SMTP_DISABLE_RDNS:'true'},healthcheck:{test:['CMD','/mailpit','readyz'],interval:'5s',timeout:'3s',retries:10}};
 // The complete stack includes Functions; its synthetic handler has no remote imports.
 await writeFile(source+'/volumes/functions/main/index.ts',"Deno.serve(() => new Response(JSON.stringify({syntheticOnly:true}),{headers:{'content-type':'application/json'}}));\n");
 for(const service of Object.values(c.services))for(const value of Object.values(service.environment||{}))assert.ok(!/https?:\/\/[^/]*\.supabase\.(co|com)/.test(String(value)),'Cloud URL rejected');
 await writeFile(config,JSON.stringify(c),{mode:0o600});
 await writeFile(secretFile,JSON.stringify({api:'http://127.0.0.1:54321',db:'postgresql://postgres:'+env.POSTGRES_PASSWORD+'@127.0.0.1:54322/silk_c2_test_ci',anon:env.ANON_KEY,service:env.SERVICE_ROLE_KEY}),{mode:0o600});
 await writeFile(dir+'/images.json',JSON.stringify(Object.fromEntries(Object.entries(c.services).map(([n,s])=>[n,s.image])),null,2));
 console.log('Prepared synthetic-only complete Supabase stack: internal network, loopback endpoints, no cloud credentials.');
}else if(command==='start'){
 await run('docker',compose(['pull','--quiet']));
 try{await run('docker',compose(['up','-d','--wait','--wait-timeout','240']));}catch(e){await diagnosticLogs();throw e;}
 const net=JSON.parse(docker(['network','inspect','silk-c2-ci-internal']))[0];assert.equal(net.Internal,true);
 console.log('PASS: all configured Supabase services ready; Docker network is internal.');
}else if(command==='build'){
 const x=JSON.parse(await readFile(secretFile));
 await run(process.execPath,['scripts/build.mjs'],{env:{...process.env,SILK_C2_LOCAL_API:x.api,SILK_SUPABASE_PUBLISHABLE_KEY:x.anon}});
}else if(command==='report'){
 const report={commit:process.env.GITHUB_SHA,run:'https://github.com/'+process.env.GITHUB_REPOSITORY+'/actions/runs/'+process.env.GITHUB_RUN_ID,runner:'ubuntu-24.04 standard github-hosted',supabaseDockerSource:'bc27d2661edd09a5d0b8d76ce33da6d4071a756e',cloudAcceptance:false,physicalDeviceTests:false,realFinalizationEnabled:false};
 try{report.images=JSON.parse(await readFile(dir+'/images.json'));report.imageDigests=Object.fromEntries(Object.entries(report.images).map(([k,v])=>{try{return [k,JSON.parse(docker(['image','inspect','--format','{{json .RepoDigests}}',v]))];}catch{return [k,[]];}}));}catch{}
 try{report.containers=JSON.parse('['+docker(compose(['ps','--all','--format','json'])).trim().split('\n').join(',')+']').map(x=>({service:x.Service,state:x.State,health:x.Health}));}catch{}
 for(const name of ['native-results','browser-results'])try{report[name]=JSON.parse(await readFile(dir+'/'+name+'.json'));}catch{report[name]={status:'not-completed'};}
 console.log('SILK_C2_CI_EVIDENCE_BEGIN\n'+JSON.stringify(report,null,2)+'\nSILK_C2_CI_EVIDENCE_END');
 await writeFile(dir+'/evidence.json',JSON.stringify(report,null,2));
 if(process.env.GITHUB_STEP_SUMMARY)await writeFile(process.env.GITHUB_STEP_SUMMARY,'C2 synthetic Supabase CI: '+report.commit+'\n\nFull evidence is in this step log. This is a runner-local integration test, not hosted-cloud or physical-device acceptance. Real finalization stays locked.\n',{flag:'a'});
}else if(command==='stop'){
 try{await run('docker',compose(['down','--volumes','--remove-orphans','--timeout','10']));}finally{await rm(secretFile,{force:true});await rm(dir+'/stack.env',{force:true});await rm(config,{force:true});}
}else throw Error('Unknown isolated CI command');
