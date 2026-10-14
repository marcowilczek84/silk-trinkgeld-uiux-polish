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
const localOnly = process.env.VERCEL_ENV === 'preview' || process.env.SILK_LOCAL_ONLY === '1';
const url = localOnly ? '' : process.env.SILK_SUPABASE_URL || '';
const publishableKey = localOnly ? '' : process.env.SILK_SUPABASE_PUBLISHABLE_KEY || '';
await writeFile(new URL('../dist/supabase-config.js', import.meta.url), `window.SILK_SUPABASE_CONFIG=${JSON.stringify({url,publishableKey,localOnly})};\n`);
if (localOnly) console.info('Isolated preview: Supabase disabled.');
else if (!url || !publishableKey) console.warn('Supabase configuration missing; local-only fallback will be used.');
