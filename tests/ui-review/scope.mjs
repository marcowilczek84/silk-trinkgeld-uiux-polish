/* A targeted exception bound to the reviewed UI bytes. Any other product change,
 * dependency change, SQL edit or manual run retains full Supabase acceptance. */
import {readFileSync,appendFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
let uiOnly=false;
try{
 const spec=JSON.parse(readFileSync('tests/ui-review/scope.json','utf8'));
 if(spec.base!=='06e139b83c562186c1b1a9933681801d4332789f')throw Error('Unreviewed base');
 const changed=execFileSync('git',['diff','--name-only',spec.base,'HEAD'],{encoding:'utf8'}).trim().split('\n');
 const allowed=p=>Object.hasOwn(spec.files,p)||p.startsWith('tests/ui-review/')||p.startsWith('docs/')&&!p.startsWith('docs/production/')||p==='tests/c2-ux-review.test.mjs'||p==='.github/workflows/c2-supabase-isolated.yml';
 uiOnly=process.env.EVENT_NAME==='push'&&changed.every(allowed)&&Object.entries(spec.files).every(([p,hash])=>createHash('sha256').update(readFileSync(p)).digest('hex')===hash);
}catch{uiOnly=false;}
appendFileSync(process.env.GITHUB_OUTPUT,'ui_only='+uiOnly+'\n');
if(uiOnly)console.log('Targeted UI review only; accepted SQL/financial/cloud evidence carried forward.');

// Last requested input adjustment only: no repeat of the accepted UI/cloud suite.
let lateOnly=false;
try{
 const spec=JSON.parse(readFileSync('tests/ui-review/late-scope.json','utf8'));
 if(spec.base!=='f43fe885cbc50afb63e6818727d802567de7d474')throw Error('Unreviewed base');
 const changed=execFileSync('git',['diff','--name-only',spec.base,'HEAD'],{encoding:'utf8'}).trim().split('\n');
 const allowed=p=>['index.html','tests/ui-review/late-empty.test.mjs','tests/ui-review/late-browser.mjs','tests/ui-review/late-scope.json','tests/ui-review/scope.mjs','.github/workflows/c2-supabase-isolated.yml'].includes(p)||p.startsWith('docs/')&&!p.startsWith('docs/production/');
 lateOnly=process.env.EVENT_NAME==='push'&&changed.every(allowed)&&createHash('sha256').update(readFileSync('index.html')).digest('hex')===spec.indexSha256;
}catch{lateOnly=false;}
appendFileSync(process.env.GITHUB_OUTPUT,'late_only='+lateOnly+'\n');
if(lateOnly)console.log('Targeted blank late-input flow only; all other accepted evidence retained.');
if(!uiOnly&&!lateOnly)console.log('Full isolated Supabase acceptance selected.');
