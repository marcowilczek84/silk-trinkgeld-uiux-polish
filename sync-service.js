(function (global) {
  'use strict';
  const local = global.SilkLocalRepository, status = global.SilkSyncStatus;
  const { CloudRepository, ConflictError } = global.SilkCloudRepository;
  const { uuid } = global.SilkStorageModels;
  let client, cloud, running = false, rerun = false, debounce, channel, refreshTimer;
  const deviceName = () => /iPad/.test(navigator.userAgent) ? 'iPad' : /iPhone/.test(navigator.userAgent) ? 'iPhone' : (navigator.platform || 'Browser');
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(x => x.toString(16).padStart(2,'0')).join('');
  const stableJson = value => JSON.stringify(value, function (_, item) {
    if (!item || Array.isArray(item) || typeof item !== 'object') return item;
    return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
  });
  const showNotice = message => {
    let node = document.getElementById('silkSyncNotice'); if (!node) { node = document.createElement('div'); node.id = 'silkSyncNotice'; node.className = 'silk-sync-notice'; document.body.appendChild(node); }
    node.textContent = message;
  };
  const draftFromRow = row => ({ id:row.id, cloudId:row.id, revision:row.revision,
    dataFormat:'draft-v1', label:row.label, savedAt:row.saved_at,
    periodStart:row.period_start, periodEnd:row.period_end, inputSnapshot:row.input_snapshot });
  function mergeCloudDrafts(rows, removed=new Set(), prune=false) {
    const items=local.getSettlements(), deletes=new Set([...removed,...local.getDraftDeletes().map(x=>x.id)]);
    for (const row of rows) {
      if (deletes.has(row.id) || local.getConflicts().some(c=>c.id==='draft:'+row.id)) continue;
      const index=items.findIndex(x=>x.cloudId===row.id);
      if (index<0) items.push(draftFromRow(row));
      else if (Number(row.revision)>Number(items[index].revision) && !local.getOutbox().some(x=>x.entity==='settlements')) items[index]=draftFromRow(row);
    }
    const remoteIds=new Set(rows.map(row=>row.id));
    local.saveSettlements(items.filter(item=>item.dataFormat!=='draft-v1'||(!deletes.has(item.cloudId) && (!prune || !item.revision || remoteIds.has(item.cloudId) || local.getConflicts().some(c=>c.id==='draft:'+item.cloudId)))),{silent:true});
  }
  function pairingView(errorText = '') {
    let wrap = document.getElementById('silkPairing'); if (wrap) wrap.remove(); wrap = document.createElement('div'); wrap.id = 'silkPairing'; wrap.className = 'silk-pairing';
    wrap.innerHTML = `<form class="silk-pairing-card"><small>Restaurant Silk</small><h2>Gerät verbinden</h2><p>Einmalig den Verbindungscode eingeben. Die lokale App bleibt bis zur erfolgreichen Verbindung vollständig nutzbar.</p><label>Verbindungscode<input name="code" autocomplete="one-time-code" autocapitalize="characters" required></label><label>Gerätename<input name="device" value="${deviceName()}" maxlength="80" required></label><button type="submit">Verbinden</button><button type="button" class="silk-pairing-later">Später verbinden</button><div class="silk-pairing-error" role="alert">${errorText}</div></form>`;
    document.body.appendChild(wrap); wrap.querySelector('.silk-pairing-later').onclick = () => wrap.remove();
    wrap.querySelector('form').onsubmit = async event => { event.preventDefault(); const form = new FormData(event.currentTarget); const button = event.currentTarget.querySelector('[type=submit]'); button.disabled = true;
      try { const paired = await cloud.pair(String(form.get('code')).trim(), String(form.get('device')).trim()); local.saveWorkspace({ id: paired.workspace_id, name: paired.workspace_name }); wrap.remove(); await connectWorkspace(); }
      catch (error) { wrap.querySelector('.silk-pairing-error').textContent = error.message || 'Verbindung nicht möglich.'; button.disabled = false; }
    };
  }
  function renderConflicts(conflicts) {
    document.getElementById('silkConflictPanel')?.remove(); if (!conflicts.length) return;
    const panel = document.createElement('div'); panel.id = 'silkConflictPanel'; panel.className = 'silk-conflict-panel';
    panel.innerHTML = `<div class="silk-conflict-card"><h2>Konflikt</h2><p>Unterschiedliche Werte werden nicht automatisch überschrieben.</p>${conflicts.map(c => `<section data-id="${c.id}"><strong>${c.type==='draft'?'Entwurf':c.date}</strong><small>${c.type==='draft'?'Dieser Entwurf wurde auf einem anderen Gerät geändert.':`Dieses Gerät: Früh ${c.local?.f||0} / Spät ${c.local?.s||0}<br>Cloud: Früh ${c.remote?.f||0} / Spät ${c.remote?.s||0}`}</small><div><button data-choice="local">${deviceName()} übernehmen</button><button data-choice="cloud">Cloud übernehmen</button><button data-choice="later">Später entscheiden</button></div></section>`).join('')}</div>`;
    panel.onclick = event => { const button = event.target.closest('[data-choice]'); if (!button) return; const section = button.closest('section'), conflict = local.getConflicts().find(c => c.id === section.dataset.id); if (!conflict) return;
      const state = local.getState();
      if (conflict.type==='draft') {
        if (button.dataset.choice==='later') return;
        const items=local.getSettlements().filter(x=>x.cloudId!==conflict.draftId);
        if (button.dataset.choice==='cloud' && conflict.remote) items.push(draftFromRow(conflict.remote));
        if (button.dataset.choice==='local' && conflict.local) { items.push({...conflict.local,revision:conflict.remote?.revision||null}); local.enqueue('settlements',items); }
        if (button.dataset.choice==='local' && !conflict.local && conflict.remote) local.saveDraftDeletes([{id:conflict.draftId,revision:conflict.remote.revision},...local.getDraftDeletes().filter(x=>x.id!==conflict.draftId)]);
        local.saveSettlements(items,{silent:true});
        if (button.dataset.choice==='cloud') local.saveDraftDeletes(local.getDraftDeletes().filter(x=>x.id!==conflict.draftId));
      } else {
        if (button.dataset.choice === 'cloud') { state.byDate = { ...(state.byDate || {}), [conflict.date]: conflict.remote }; local.applyCloudSnapshot({ state }); }
        if (button.dataset.choice === 'local') local.enqueue('state', state);
      }
      if (button.dataset.choice !== 'later') { const remaining = local.getConflicts().filter(c => c.id !== conflict.id); local.saveConflicts(remaining); section.remove(); if (!remaining.length) panel.remove(); schedule(); }
    };
    document.body.appendChild(panel); status.set('conflict');
  }
  async function ensureMemberRows(snapshot, meta) {
    const staffRows = new Map(snapshot.tip_staff_members.map(row => [row.display_name, row]));
    for (const name of local.getStaff([])) if (!staffRows.has(name)) { const row = await cloud.insert('tip_staff_members', { id: uuid(), workspace_id: cloud.workspaceId, display_name: name, aliases: [], active: true }); staffRows.set(name, row); }
    const shiftRows = new Map(snapshot.tip_shift_types.map(row => [row.code, row]));
    for (const item of local.getShifts([])) {
      const existing = shiftRows.get(item.name), changes = { early_weight: item.f, late_weight: item.s, color: item.color || null, active: true };
      if (!existing) shiftRows.set(item.name, await cloud.insert('tip_shift_types', { id: uuid(), workspace_id: cloud.workspaceId, code: item.name, ...changes }));
      else if (Number(existing.early_weight) !== Number(item.f) || Number(existing.late_weight) !== Number(item.s) || existing.color !== (item.color || null)) shiftRows.set(item.name, await cloud.updateWithRevision('tip_shift_types', existing.id, existing.revision, changes, 'shift:'+item.name));
    }
    meta.ids.staff = Object.fromEntries([...staffRows].map(([name,row]) => [name,row.id])); meta.ids.shifts = Object.fromEntries([...shiftRows].map(([code,row]) => [code,row.id]));
    return { staffRows, shiftRows };
  }
  async function syncNow() {
    if (!cloud) { status.set('local'); return; }
    if (running || !navigator.onLine) { if (running) rerun = true; status.set(navigator.onLine?'pending':'offline'); return; }
    running = true; status.set('connecting');
    try {
      const snapshot = await cloud.loadAll(), meta = local.getSyncMeta(), { staffRows, shiftRows } = await ensureMemberRows(snapshot, meta);
      const remoteDays = new Map(snapshot.tip_days.map(row => [row.business_date, row]));
      for (const [date, day] of Object.entries(local.getState().byDate || {})) {
        if (local.getConflicts().some(c => c.id === 'day:'+date)) continue;
        const existing = remoteDays.get(date), changes = { early_amount: Number(day.f || 0), late_amount: Number(day.s || 0) }, known = meta.revisions['day:'+date]; let row;
        if (!existing) row = await cloud.insert('tip_days', { id: uuid(), workspace_id: cloud.workspaceId, business_date: date, ...changes });
        else if (known && Number(existing.revision) > Number(known) && (Number(existing.early_amount) !== changes.early_amount || Number(existing.late_amount) !== changes.late_amount)) throw new ConflictError('day:'+date, day, { f:String(existing.early_amount), s:String(existing.late_amount), assignments:day.assignments || [] });
        else if (Number(existing.early_amount) !== changes.early_amount || Number(existing.late_amount) !== changes.late_amount) row = await cloud.updateWithRevision('tip_days', existing.id, existing.revision, changes, 'day:'+date); else row = existing;
        remoteDays.set(date, row); meta.revisions['day:'+date] = row.revision; meta.ids.days[date] = row.id;
        const current = snapshot.tip_assignments.filter(a => a.tip_day_id === row.id), wanted = new Map((day.assignments || []).filter(a => a.name && a.shift).map(a => [a.name, a]));
        for (const [name, assignment] of wanted) { const staff = staffRows.get(name), shift = shiftRows.get(assignment.shift); if (!staff) continue; const found = current.find(a => a.staff_member_id === staff.id), values = { shift_type_id: shift?.id || null, shift_code_snapshot: assignment.shift };
          if (!found) await cloud.insert('tip_assignments', { id: uuid(), workspace_id: cloud.workspaceId, tip_day_id: row.id, staff_member_id: staff.id, ...values });
          else if (found.shift_type_id !== values.shift_type_id || found.shift_code_snapshot !== values.shift_code_snapshot) { const key='assignment:'+date+':'+name, knownAssignment=meta.revisions[key]; if (knownAssignment && Number(found.revision)>Number(knownAssignment)) throw new ConflictError('day:'+date, day, global.SilkLegacyMigration.cloudState(snapshot)[date]); const updated=await cloud.updateWithRevision('tip_assignments', found.id, found.revision, values, key); meta.revisions[key]=updated.revision; }
          else meta.revisions['assignment:'+date+':'+name]=found.revision;
        }
        for (const found of current) { const name = [...staffRows].find(([,s]) => s.id === found.staff_member_id)?.[0]; if (name && !wanted.has(name)) await cloud.deleteWithRevision('tip_assignments', found.id, found.revision, 'assignment:'+date+':'+name); }
      }
      for (const item of local.getSettlements()) {
        if (item.dataFormat==='draft-v1') {
          if (local.getConflicts().some(c=>c.id==='draft:'+item.cloudId)) continue;
          const previousRevision=item.revision;
          const row=snapshot.tip_drafts.find(x=>x.id===item.cloudId);
          const values={label:item.label,period_start:item.periodStart,period_end:item.periodEnd,
            saved_at:item.savedAt,input_snapshot:item.inputSnapshot};
          if (!row) {
            if (item.revision) throw new ConflictError('draft:'+item.cloudId,item,null);
            const created=await cloud.insert('tip_drafts',{id:item.cloudId,workspace_id:cloud.workspaceId,...values});
            item.revision=created.revision;
          } else if (Date.parse(row.saved_at)!==Date.parse(item.savedAt) || stableJson(row.input_snapshot)!==stableJson(item.inputSnapshot)) {
            if (item.revision && Number(row.revision)!==Number(item.revision)) throw new ConflictError('draft:'+item.cloudId,item,row);
            const updated=await cloud.updateWithRevision('tip_drafts',row.id,row.revision,values,'draft:'+item.cloudId);
            item.revision=updated.revision;
          } else item.revision=row.revision;
          const active=local.getActiveDraft();
          if (active?.id===item.id && (active.revision==null || Number(active.revision)===Number(previousRevision))) local.saveActiveDraft({id:item.id,revision:item.revision});
          continue;
        }
        if (item.dataFormat === 'structured-v1') { if (!item.cloudId) { const row = await cloud.insert('tip_settlements', { id: uuid(), workspace_id: cloud.workspaceId, period_start:item.periodStart||null, period_end:item.periodEnd||null, label:item.label, calculation_version:item.calculationVersion||'silk-v13', input_snapshot:item.inputSnapshot||null, result:item.resultData||null, data_format:'structured-v1', source_device_installation_id:local.getDeviceId(), saved_at:item.savedAt }); item.cloudId=row.id; item.revision=row.revision;
          for (const line of item.resultData?.lines || []) { const lower=line.displayName.toLowerCase(), lineType=lower.includes('küche')?'kitchen':lower.includes('housekeeping')?'housekeeping':'employee', staffId=staffRows.get(line.displayName)?.id||null, amount=Number(String(line.amountDisplay||'').replace(/[^0-9,.-]/g,'').replace(',','.'))||0; await cloud.insert('tip_settlement_lines',{id:uuid(),workspace_id:cloud.workspaceId,settlement_id:row.id,line_type:lineType,staff_member_id:staffId,display_name:line.displayName,amount,details:line.details?[line.details]:[],sort_order:line.sortOrder||0}); }
        } }
        else { const sourceHash = await hash(JSON.stringify({ id:item.id,label:item.label,savedAt:item.savedAt,html:item.html })); if (!snapshot.tip_legacy_snapshots.some(row => row.source_hash === sourceHash)) await cloud.insert('tip_legacy_snapshots', { id:uuid(),workspace_id:cloud.workspaceId,legacy_id:item.id,label:item.label,saved_at:item.savedAt,legacy_html:item.html,source_device_installation_id:local.getDeviceId(),source_hash:sourceHash }); }
      }
      const removedDrafts=new Set();
      for (const pending of local.getDraftDeletes()) {
        if (local.getConflicts().some(c=>c.id==='draft:'+pending.id)) continue;
        const row=snapshot.tip_drafts.find(x=>x.id===pending.id);
        if (row && Number(row.revision)!==Number(pending.revision)) throw new ConflictError('draft:'+pending.id,null,row);
        if (row) await cloud.deleteWithRevision('tip_drafts',row.id,row.revision,'draft:'+pending.id);
        removedDrafts.add(pending.id);
        local.saveDraftDeletes(local.getDraftDeletes().filter(x=>x.id!==pending.id));
      }
      mergeCloudDrafts(snapshot.tip_drafts,removedDrafts);
      local.saveSettlements(local.getSettlements(), { silent:true }); meta.migrated = true; local.saveSyncMeta(meta);
      for (const item of local.getOutbox()) local.removeOutbox(item.mutationId);
      status.set(local.getConflicts().length ? 'conflict' : 'synced');
    } catch (error) {
      if (error instanceof ConflictError) { const conflicts = local.getConflicts(); const date = error.entity.startsWith('day:') ? error.entity.slice(4) : null; if (!conflicts.some(c => c.id === error.entity)) conflicts.push({ id:error.entity,type:error.entity.startsWith('draft:')?'draft':date?'day':'record',draftId:error.entity.startsWith('draft:')?error.entity.slice(6):null,date,local:error.local,remote:error.remote }); local.saveConflicts(conflicts); renderConflicts(conflicts); }
      else { console.warn('SILK sync pending:', error); status.set('pending'); }
    } finally { running = false; if (rerun) { rerun = false; schedule(50); } }
  }
  function schedule(delay = 450) { clearTimeout(debounce); debounce = setTimeout(syncNow, delay); }
  async function refreshFromCloud() {
    if (!cloud || running || local.getOutbox().length) return schedule();
    try { const snapshot = await cloud.loadAll(), remote = global.SilkLegacyMigration.cloudState(snapshot), state = local.getState();
      for (const [date, day] of Object.entries(remote)) if (!local.getConflicts().some(c => c.id === 'day:'+date)) (state.byDate ||= {})[date] = day;
      const meta = local.getSyncMeta(), dayById = new Map(snapshot.tip_days.map(row => [row.id, row.business_date])), staffById = new Map(snapshot.tip_staff_members.map(row => [row.id, row.display_name]));
      snapshot.tip_days.forEach(row => { meta.revisions['day:'+row.business_date] = row.revision; meta.ids.days[row.business_date] = row.id; });
      snapshot.tip_assignments.forEach(row => { const date = dayById.get(row.tip_day_id), name = staffById.get(row.staff_member_id); if (date && name) meta.revisions['assignment:'+date+':'+name] = row.revision; });
      local.saveSyncMeta(meta);
      const currentSettlements=local.getSettlements(), settlementKeys=new Set(currentSettlements.map(x=>x.cloudId));
      snapshot.tip_settlements.filter(row=>row.data_format!=='draft-v1').forEach(row=>{if(!settlementKeys.has(row.id))currentSettlements.push({id:row.legacy_id||Date.parse(row.saved_at),cloudId:row.id,revision:row.revision,label:row.label||'Abrechnung',savedAt:row.saved_at,html:row.legacy_html||'',dataFormat:row.data_format,periodStart:row.period_start,periodEnd:row.period_end,calculationVersion:row.calculation_version,inputSnapshot:row.input_snapshot,resultData:row.result})});
      mergeCloudDrafts(snapshot.tip_drafts,new Set(),true);
      currentSettlements.splice(0,currentSettlements.length,...local.getSettlements());
      local.applyCloudSnapshot({ state, staff:snapshot.tip_staff_members.map(r=>r.display_name), shifts:snapshot.tip_shift_types.map(r=>({name:r.code,f:Number(r.early_weight),s:Number(r.late_weight),color:r.color||'#eee'})), settlements:currentSettlements }); status.set('synced');
    } catch (_) { status.set('pending'); }
  }
  async function connectWorkspace() {
    const workspace = local.getWorkspace(); if (!workspace) return pairingView(); cloud.workspaceId = workspace.id;
    const snapshot = await cloud.loadAll(), meta = local.getSyncMeta();
    const backup = (() => { try { return JSON.parse(localStorage.getItem(global.SilkStorageModels.KEYS.legacyBackup) || 'null'); } catch (_) { return null; } })();
    if (!local.getShifts([]).length && !snapshot.tip_shift_types.length && backup?.values?.[global.SilkStorageModels.KEYS.shifts] == null && Array.isArray(global.SILK_DEFAULT_SHIFTS)) {
      local.saveShifts(global.SILK_DEFAULT_SHIFTS.map(item => ({ ...item })), { silent: true });
    }
    if (!meta.migrated) { const result = global.SilkLegacyMigration.merge(snapshot); renderConflicts(result.conflicts); }
    channel?.unsubscribe?.(); channel = cloud.subscribe(() => setTimeout(refreshFromCloud, 250));
    clearInterval(refreshTimer); refreshTimer = setInterval(() => { if (document.visibilityState === 'visible') refreshFromCloud(); }, 5000);
    schedule(0);
  }
  async function init() {
    global.SilkLegacyMigration.backup(); local.getDeviceId(); status.set('connecting');
    client = global.SilkSupabase?.create(); if (!client) { status.set('local'); showNotice('Cloud-Synchronisierung ist nicht konfiguriert. Die lokalen Daten bleiben verfügbar.'); return; }
    try { let { data:{ session }, error } = await client.auth.getSession(); if (error) throw error; if (!session) { const signed = await client.auth.signInAnonymously(); if (signed.error) throw signed.error; session = signed.data.session; } if (!session) throw new Error('Keine Supabase-Sitzung verfügbar.');
      cloud = new CloudRepository(client, local.getWorkspace()?.id || null, local.getDeviceId()); await connectWorkspace();
    } catch (error) { console.warn('SILK cloud unavailable:', error); status.set('local'); showNotice('Cloud-Verbindung nicht verfügbar. Die App arbeitet lokal weiter; Daten wurden nicht verändert. '+(error.message||'')); }
  }
  global.addEventListener('silk:local-change', event => { local.enqueue(event.detail.entity, event.detail.payload); schedule(); });
  global.addEventListener('online', () => schedule(0)); global.addEventListener('offline', () => status.set('offline'));
  global.addEventListener('focus', () => refreshFromCloud());
  global.addEventListener('silk:conflicts', event => renderConflicts(event.detail || []));
  global.SilkSyncService = { init, syncNow, refreshFromCloud };
})(window);
