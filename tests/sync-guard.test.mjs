import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from './app-helper.mjs';
for(const marker of ['UPDATE_REQUIRED','ROLLOUT_PAUSED','ARCHIVE_PROTECTED','INVALID_DOCUMENT'])test('server guard '+marker+' stops retrying and retains local inputs',async()=>{
 const c=await app(),w=c.window;let requests=0;const before=JSON.stringify(w.SilkLocalRepository.document());
 w.SilkLocalRepository.saveWorkspace({id:'synthetic-only'});
 const channel={on(){return this;},subscribe(){return this;},unsubscribe(){}};
 const query={select(){return this;},eq(){return this;},async maybeSingle(){requests++;return {error:{code:'42501',message:'SILK_'+marker}};}};
 w.SilkSupabase={create:()=>({auth:{getSession:async()=>({data:{session:{}}})},channel:()=>channel,from:()=>query})};
 await w.SilkSyncService.init();assert.equal(w.SilkSyncStatus.get(),'blocked');
 assert.match(w.document.getElementById('silkSyncStatus').textContent,/lokal|Lokale/);
 await w.SilkSyncService.syncNow();assert.equal(requests,1);assert.equal(JSON.stringify(w.SilkLocalRepository.document()),before);
 await w.SilkSyncService.stop();w.close();
});
