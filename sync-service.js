(function (global) {
  'use strict';
  const repo = global.SilkLocalRepository, ui = global.SilkSyncStatus, M = global.SilkSyncMerge;
  let client, cloud, running=false, again=false, timer, channel, initialized=false,stopped=false,refreshTimer;
  const deviceName=() => /iPad/.test(navigator.userAgent)?'iPad':/iPhone/.test(navigator.userAgent)?'iPhone':'Browser';
  const escape=value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function schedule(delay=450) { if(stopped)return;clearTimeout(timer); timer=setTimeout(syncNow,delay); }
  function clearQueue() { repo.getOutbox().forEach(x=>repo.removeOutbox(x.mutationId)); }
  function showError(message) { ui.set('error',message); }
  async function getRow() {
    const {data,error}=await client.from('tip_workspace_state').select('*').eq('workspace_id',cloud.workspaceId).maybeSingle();
    if(error) throw error; return data;
  }
  function legacyDocument(snapshot) {
    const current=repo.document(), remoteDays=global.SilkLegacyMigration.cloudState(snapshot);
    const saved={};
    for(const row of snapshot.tip_settlements) {
      const item={id:row.legacy_id||row.id,cloudId:row.id,label:row.label||'Archiv',savedAt:row.saved_at,html:row.legacy_html||'',dataFormat:row.data_format,periodStart:row.period_start,periodEnd:row.period_end,inputSnapshot:row.input_snapshot,resultData:row.result}; saved[item.id]=item;
    }
    for(const row of snapshot.tip_drafts) saved[row.id]={id:row.id,cloudId:row.id,dataFormat:'draft-v1',label:row.label,savedAt:row.saved_at,periodStart:row.period_start,periodEnd:row.period_end,inputSnapshot:row.input_snapshot};
    for(const row of snapshot.tip_legacy_snapshots) saved[row.id]={id:row.id,label:row.label||'Archiv',savedAt:row.saved_at,html:row.legacy_html,dataFormat:'legacy-html-v1'};
    return {format:2,period:current.period,days:Object.fromEntries(Object.entries(remoteDays).map(([date,v])=>[date,{f:v.f,s:v.s,assignments:Object.fromEntries(v.assignments.filter(a=>a.shift).map(a=>[a.name,a.shift]))}])),staff:snapshot.tip_staff_members.filter(r=>r.active).map(r=>r.display_name),shifts:snapshot.tip_shift_types.filter(r=>r.active).map(r=>({name:r.code,f:Number(r.early_weight),s:Number(r.late_weight),color:r.color||'#eee'})),settlements:saved,work:{activeId:null,checkpoint:null,calculation:null}};
  }
  function initialMerge(remote, local) {
    const hasRemote=remote.staff.length||Object.keys(remote.days).length||Object.keys(remote.settlements).length;
    if(!hasRemote) return {value:local,conflicts:[]};
    const empty={...remote,days:{},settlements:{}};
    const saved=Object.fromEntries(Object.values(local.settlements).map(item=>{const same=Object.values(remote.settlements).find(r=>item.cloudId&&r.cloudId===item.cloudId);const normalized=same?{...item,id:same.id}:item;return [String(normalized.id),normalized];}));
    const incoming={...remote,days:local.days,settlements:saved};
    // A clean new device adopts the shared period/staff. Legacy local entries are reconciled explicitly.
    const merged=M.merge(empty,incoming,remote);
    for(const field of ['staff','shifts']) {
      const key=global.SilkStorageModels.KEYS[field];
      if(localStorage.getItem(key)!=null && !M.equal(local[field],remote[field])) {
        merged.conflicts.push({path:[field],local:local[field],remote:remote[field]}); merged.value[field]=local[field];
      }
    }
    return merged;
  }
  function conflictLabel(path) {
    const labels={days:'Tag',staff:'Mitarbeiter',shifts:'Dienste',period:'Zeitraum',settlements:'Abrechnung',work:'Aktueller Arbeitsstand',f:'Früh',s:'Spät',assignments:'Dienstzuordnung'};
    return path.map(p=>labels[p]||p).join(' · ');
  }
  function renderConflicts() {
    document.getElementById('silkConflictPanel')?.remove();
    const current=repo.document();const conflicts=repo.getConflicts().map(c=>({...c,local:(c.path||[]).reduce((v,k)=>v?.[k],current)})); if(!conflicts.length) return;repo.saveConflicts(conflicts);
    const panel=document.createElement('div');panel.id='silkConflictPanel';panel.className='silk-conflict-panel';
    panel.innerHTML=`<div class="silk-conflict-card" role="dialog" aria-modal="true" aria-label="Synchronisationskonflikt"><h2>Änderungen prüfen</h2><p>Beide Fassungen bleiben erhalten, bis du entscheidest. Unabhängige Änderungen wurden zusammengeführt.</p>${conflicts.map((c,i)=>`<section><strong>${escape(conflictLabel(c.path||[]))}</strong><details><summary>Werte vergleichen</summary><p>Dieses Gerät</p><pre>${escape(JSON.stringify(c.local??'Gelöscht',null,2))}</pre><p>Gemeinsamer Stand</p><pre>${escape(JSON.stringify(c.remote??'Gelöscht',null,2))}</pre></details><div><button data-index="${i}" data-choice="local">Diesen lokalen Wert übernehmen</button><button data-index="${i}" data-choice="remote">Gemeinsamen Wert übernehmen</button></div></section>`).join('')}<button data-choice="later">Später entscheiden</button></div>`;
    panel.onclick=e=>{
      const button=e.target.closest('[data-choice]');if(!button)return;
      if(button.dataset.choice==='later'){panel.remove();return;}
      const list=repo.getConflicts(), conflict=list[Number(button.dataset.index)];if(!conflict)return;
      const doc=M.choose(repo.document(),conflict.path,conflict[button.dataset.choice]);
      repo.applyDocument(doc);list.splice(Number(button.dataset.index),1);repo.saveConflicts(list);
      if(!list.length){panel.remove();schedule(0);}else renderConflicts();
    };
    document.body.appendChild(panel);panel.querySelector('button')?.focus();ui.set('conflict');
  }
  function rememberConflict(remote, revision, merged) {
    // Persist remote base and both alternatives before touching the visible working copy.
    repo.saveSyncMeta({base:remote,revision});repo.saveConflicts(merged.conflicts);
    repo.applyDocument(merged.value);renderConflicts();
  }
  async function syncNow() {
    if(stopped)return false;
    if(!cloud?.workspaceId){ui.set('local');return false;}
    if(!navigator.onLine){ui.set('offline');return false;}
    if(repo.getConflicts().length){ui.set('conflict');return false;}
    if(running){again=true;return false;}
    running=true;ui.set('pending');
    try {
      for(let attempt=0;attempt<4;attempt++) {
        const row=await getRow();if(stopped)return false;const meta=repo.getSyncMeta(), local=repo.document();
        let remote=row?.payload,legacyRevision;
        if(!remote) {
          const before=await client.rpc('tip_legacy_revision',{p_workspace_id:cloud.workspaceId});if(before.error)throw before.error;
          remote=legacyDocument(await cloud.loadAll());
          const after=await client.rpc('tip_legacy_revision',{p_workspace_id:cloud.workspaceId});if(after.error)throw after.error;
          if(before.data!==after.data)continue;legacyRevision=after.data;
        }
        const merged=meta.base?M.merge(meta.base,local,remote):initialMerge(remote,local);
        if(merged.conflicts.length){rememberConflict(remote,row?.revision||0,merged);return false;}
        const staleFinalization=M.protectFinalization(meta.base||remote,merged.value);
        let committed=row;
        if(!row||!M.equal(merged.value,remote)) {
          const request=row?client.from('tip_workspace_state').update({payload:merged.value}).eq('workspace_id',cloud.workspaceId).eq('revision',row.revision).select().maybeSingle():client.rpc('tip_create_workspace_state',{p_workspace_id:cloud.workspaceId,p_payload:merged.value,p_legacy_revision:legacyRevision}).single();
          const {data,error}=await request;
          if(['23505','40001'].includes(error?.code)||(!error&&!data))continue;
          if(error)throw error;if(stopped)return false;committed=data;
        }
        // Edits made during network requests must survive the acknowledgement.
        const latest=repo.document(), rebased=M.merge(local,latest,committed.payload);
        repo.saveSyncMeta({base:committed.payload,revision:committed.revision});
        if(rebased.conflicts.length){rememberConflict(committed.payload,committed.revision,rebased);return false;}
        if(!M.equal(latest,rebased.value))repo.applyDocument(rebased.value);
        const clean=M.equal(repo.document(),committed.payload);
        if(clean){clearQueue();ui.set('synced');}else{ui.set('pending');again=true;}
        if(staleFinalization.length)global.dispatchEvent(new CustomEvent('silk:finalization-stale'));
        global.dispatchEvent(new CustomEvent('silk:sync-complete',{detail:{revision:committed.revision}}));
        return clean;
      }
      ui.set('pending','Weitere Änderungen eingegangen · erneuter Abgleich');again=true;return false;
    } catch(error) {
      if(stopped)return false;console.warn('SILK sync:',error.code||error.name);
      if(!navigator.onLine)ui.set('offline');else showError('Synchronisierung fehlgeschlagen · lokal erhalten');
      return false;
    } finally {running=false;if(again){again=false;schedule(200);}}
  }
  function pairingView() {
    document.getElementById('silkPairing')?.remove();
    const wrap=document.createElement('div');wrap.id='silkPairing';wrap.className='silk-pairing';
    wrap.innerHTML=`<form class="silk-pairing-card" role="dialog" aria-modal="true" aria-label="Gerät verbinden"><small>Restaurant Silk</small><h2>Gerät verbinden</h2><p>Mit dem Verbindungscode lädt dieses Gerät den gemeinsamen Stand. Lokale Eingaben werden vorher abgeglichen.</p><label>Verbindungscode<input name="code" autocomplete="one-time-code" autocapitalize="characters" required></label><label>Gerätename<input name="device" value="${deviceName()}" maxlength="80" required></label><button type="submit">Verbinden</button><button type="button" class="silk-pairing-later">Später verbinden</button><p class="silk-pairing-error" role="alert"></p></form>`;
    document.body.appendChild(wrap);wrap.querySelector('.silk-pairing-later').onclick=()=>{wrap.remove();ui.set('local');};
    wrap.querySelector('form').onsubmit=async e=>{
      e.preventDefault();const form=new FormData(e.currentTarget),button=e.currentTarget.querySelector('[type=submit]');button.disabled=true;
      try {const paired=await cloud.pair(String(form.get('code')).trim(),String(form.get('device')).trim());repo.saveWorkspace({id:paired.workspace_id,name:paired.workspace_name});wrap.remove();await connect();}
      catch(error){wrap.querySelector('[role=alert]').textContent=error.message?.includes('PAIRING')?'Dieser Verbindungscode ist ungültig oder abgelaufen.':'Verbindung nicht möglich. Bitte erneut versuchen.';button.disabled=false;}
    };
  }
  async function connect() {
    const workspace=repo.getWorkspace();if(!workspace){ui.set('local');pairingView();return;}
    cloud.workspaceId=workspace.id;
    channel?.unsubscribe();channel=client.channel('silk-work-'+workspace.id).on('postgres_changes',{event:'*',schema:'public',table:'tip_workspace_state',filter:`workspace_id=eq.${workspace.id}`},()=>schedule(150)).subscribe();
    await syncNow();if(repo.getConflicts().length)renderConflicts();
  }
  async function init() {
    if(initialized)return;initialized=true;global.SilkLegacyMigration.backup();repo.getDeviceId();
    client=global.SilkSupabase?.create();if(!client){ui.set('local');return;}
    try {
      const {data,error}=await client.auth.getSession();if(error)throw error;
      if(!data.session){const signed=await client.auth.signInAnonymously();if(signed.error)throw signed.error;}
      cloud=new global.SilkCloudRepository.CloudRepository(client,repo.getWorkspace()?.id||null,repo.getDeviceId());
      await connect();refreshTimer=setInterval(()=>{if(document.visibilityState==='visible')schedule(0);},5000);
    }catch(error){showError('Cloud-Verbindung nicht verfügbar · lokal erhalten');}
  }
  global.addEventListener('silk:local-change',()=>{repo.enqueue('document');schedule();});
  global.addEventListener('online',()=>schedule(0));global.addEventListener('offline',()=>ui.set(cloud?.workspaceId?'offline':'local'));
  global.addEventListener('focus',()=>schedule(0));
  async function stop(){stopped=true;clearTimeout(timer);clearInterval(refreshTimer);await channel?.unsubscribe();while(running)await new Promise(resolve=>setTimeout(resolve,25));}
  global.SilkSyncService={init,stop,syncNow,refreshFromCloud:syncNow,showConflicts:renderConflicts,pair:()=>cloud?pairingView():init()};
})(window);
