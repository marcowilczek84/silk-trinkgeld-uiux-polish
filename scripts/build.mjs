import { build } from 'esbuild';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive:true, force:true }); await mkdir(dist, { recursive:true });
await build({ entryPoints:[new URL('../supabase-client-entry.js', import.meta.url).pathname], outfile:new URL('../dist/supabase-client.js', import.meta.url).pathname, bundle:true, format:'iife', platform:'browser', minify:true, target:['safari15'] });
const allowed = new Set(['.html','.js','.css','.png','.webp','.webmanifest']);
for (const entry of await readdir(root, { withFileTypes:true })) {
  if (!entry.isFile() || !allowed.has(extname(entry.name)) || entry.name === 'supabase-client-entry.js' || entry.name === 'supabase-config.js') continue;
  await cp(new URL('../'+entry.name, import.meta.url), new URL('../dist/'+entry.name, import.meta.url));
}
const url = process.env.SILK_SUPABASE_URL || '';
const publishableKey = process.env.SILK_SUPABASE_PUBLISHABLE_KEY || '';
await writeFile(new URL('../dist/supabase-config.js', import.meta.url), `window.SILK_SUPABASE_CONFIG=${JSON.stringify({url,publishableKey})};\n`);
if (!url || !publishableKey) console.warn('Supabase preview configuration missing; local-only fallback will be used.');
