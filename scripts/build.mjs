import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive:true, force:true }); await mkdir(dist, { recursive:true });
await build({ entryPoints:[new URL('../supabase-client-entry.js', import.meta.url).pathname], outfile:new URL('../dist/supabase-client.js', import.meta.url).pathname, bundle:true, format:'iife', platform:'browser', minify:true, target:['safari15'] });
const allowed = new Set(['.html','.js','.css','.svg','.jpg','.png','.webp','.webmanifest','.woff','.txt']);
for (const entry of await readdir(root, { withFileTypes:true })) {
  if (!entry.isFile() || !allowed.has(extname(entry.name)) || entry.name === 'supabase-client-entry.js' || entry.name === 'supabase-config.js') continue;
  await cp(new URL('../'+entry.name, import.meta.url), new URL('../dist/'+entry.name, import.meta.url));
}
// Integrity previews must not create sessions or write into the production workspace.
const localApi = process.env.SILK_C2_LOCAL_API || '';
if(localApi && (process.env.VERCEL_ENV || !/^http:\/\/(127\.0\.0\.1|localhost):[0-9]+$/.test(localApi)))throw Error('C2 test API must be loopback and cannot be used on Vercel');
await mkdir(new URL('../dist/v14-prototypes/',import.meta.url),{recursive:true});
for(const file of ['variant-c-allocation.js','variant-c-calculation-adapter.js'])await cp(new URL('../v14-prototypes/'+file,import.meta.url),new URL('../dist/v14-prototypes/'+file,import.meta.url));
const localOnly = !localApi && ( process.env.VERCEL_ENV === 'preview' || process.env.SILK_LOCAL_ONLY === '1');
const url = localApi || (localOnly ? '' : process.env.SILK_SUPABASE_URL || '');
const publishableKey = localOnly ? '' : process.env.SILK_SUPABASE_PUBLISHABLE_KEY || '';
await writeFile(new URL('../dist/supabase-config.js', import.meta.url), `window.SILK_SUPABASE_CONFIG=${JSON.stringify({url,publishableKey,localOnly,c2Candidate:true,c2LocalTest:!!localApi,c2AppApproved:!localApi&&!localOnly&&process.env.SILK_C2_APP_APPROVAL==='approved-c2'})};\n`);
if (localOnly) console.info('Isolated preview: Supabase disabled.');
else if (!url || !publishableKey) console.warn('Supabase configuration missing; local-only fallback will be used.');
