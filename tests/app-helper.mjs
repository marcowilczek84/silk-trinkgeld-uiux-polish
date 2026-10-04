import {readFile} from 'node:fs/promises';
import {JSDOM,VirtualConsole} from 'jsdom';
export async function app(storage={}) {
 const root=new URL('../',import.meta.url);let html=await readFile(new URL('index.html',root),'utf8');
 for(const match of [...html.matchAll(/<script src="([^"?]+)(?:\?[^" ]*)?">\s*<\/script>/g)]) {
   const file=match[1];if(['supabase-config.js','supabase-client.js','sync-bootstrap.js','jsQR.js','silk-import.js'].includes(file)){html=html.replace(match[0],'');continue;}
   const source=await readFile(new URL(file,root),'utf8');html=html.replace(match[0],()=>'<script>'+source+'</script>');
 }
 const errors=[],virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://silk-test.invalid',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(w){
   for(const [k,v] of Object.entries(storage))w.localStorage.setItem(k,v);
   w.HTMLElement.prototype.scrollIntoView=()=>{};w.alert=()=>{};w.confirm=()=>true;
   w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
 }});
 return {dom,window:dom.window,errors};
}
