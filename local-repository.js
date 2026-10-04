(function (global) {
  'use strict';
  const { KEYS, parse, uuid, clone } = global.SilkStorageModels;
  const DOC = 'silk_document_v2';
  const get = (key, fallback) => parse(localStorage.getItem(key), fallback);
  const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let applyingCloud = false, transaction = null;
  function read() {
    return transaction || get(DOC, null) || {
      state: get(KEYS.state, {}), staff: get(KEYS.staff, null), shifts: get(KEYS.shifts, null),
      settlements: get(KEYS.settlements, []), work: { activeId: get(KEYS.activeDraft, null)?.id || null, checkpoint: null, calculation: null }
    };
  }
  function notify(entity) {
    if (!applyingCloud && !transaction) global.dispatchEvent(new CustomEvent('silk:local-change', { detail: { entity } }));
  }
  function change(key, value, options = {}) {
    const doc = read();
    if (JSON.stringify(doc[key]) === JSON.stringify(value)) return value;
    doc[key] = clone(value);
    if (!transaction) set(DOC, doc);
    if (!options.silent) notify(key);
    return value;
  }
  const repo = {
    transaction(fn) {
      if (transaction) return fn();
      const before = read(); transaction = clone(before);
      try { const result = fn(); const next = transaction; transaction = null; set(DOC, next); if (JSON.stringify(before) !== JSON.stringify(next)) notify('document'); return result; }
      catch (error) { transaction = null; throw error; }
    },
    getState: () => clone(read().state), saveState: (value, options) => change('state', value, options),
    getStaff: fallback => clone(read().staff ?? fallback ?? []), saveStaff: (value, options) => change('staff', value, options),
    getShifts: fallback => clone(read().shifts ?? fallback ?? []), saveShifts: (value, options) => change('shifts', value, options),
    getSettlements: () => clone(read().settlements), saveSettlements: (value, options) => change('settlements', value, options),
    getWork: () => clone(read().work), saveWork: (value, options) => change('work', value, options),
    getActiveDraft: () => read().work.activeId ? { id: read().work.activeId } : null,
    saveActiveDraft: value => change('work', {...read().work, activeId: value?.id || null}),
    getMode: fallback => read().state.mode || localStorage.getItem(KEYS.mode) || fallback,
    saveMode() { /* The period is committed with saveState, never as a separate cloud mutation. */ },
    getDraftDeletes: () => [], saveDraftDeletes() {},
    getDeviceId() { let id = localStorage.getItem(KEYS.device); if (!id) { id = uuid(); localStorage.setItem(KEYS.device, id); } return id; },
    getWorkspace: () => get(KEYS.workspace, null), saveWorkspace: value => set(KEYS.workspace, value),
    getSyncMeta: () => get('silk_sync_v2_meta', {}), saveSyncMeta: value => set('silk_sync_v2_meta', value),
    getOutbox: () => get(KEYS.outbox, []),
    enqueue(entity, payload) { const entry = { mutationId: uuid(), entity, payload, queuedAt: new Date().toISOString() }; set(KEYS.outbox, [entry]); return entry; },
    removeOutbox(id) { set(KEYS.outbox, repo.getOutbox().filter(x => x.mutationId !== id)); },
    getConflicts: () => get(KEYS.conflicts, []),
    saveConflicts(value) { set(KEYS.conflicts, value); global.dispatchEvent(new CustomEvent('silk:conflicts', {detail: clone(value)})); },
    applyCloudSnapshot(snapshot) {
      applyingCloud = true;
      try {
        repo.transaction(() => {
          if (snapshot.state) repo.saveState(snapshot.state, {silent:true});
          if (snapshot.staff) repo.saveStaff(snapshot.staff, {silent:true});
          if (snapshot.shifts) repo.saveShifts(snapshot.shifts, {silent:true});
          if (snapshot.settlements) repo.saveSettlements(snapshot.settlements, {silent:true});
          if (snapshot.work) repo.saveWork(snapshot.work, {silent:true});
        });
        global.dispatchEvent(new CustomEvent('silk:cloud-applied'));
      } finally { applyingCloud = false; }
    },
    isApplyingCloud: () => applyingCloud,
    // Cloud shape uses maps so independent days/assignments can merge without loss.
    document() {
      const d = read(), s = d.state;
      return { format:2, period:{mode:s.mode || 'day', singleDate:s.singleDate || '', periodStart:s.periodStart || '', periodEnd:s.periodEnd || ''},
        days:Object.fromEntries(Object.entries(s.byDate || {}).filter(([,v]) => v.f !== '' || v.s !== '' || v.assignments?.some(a => a.shift)).map(([date,v]) => [date,{f:v.f ?? '',s:v.s ?? '',assignments:Object.fromEntries((v.assignments || []).filter(a => a.shift).map(a => [a.name,a.shift]))}])),
        staff:repo.getStaff(global.SILK_DEFAULT_STAFF), shifts:repo.getShifts(global.SILK_DEFAULT_SHIFTS),
        settlements:Object.fromEntries(d.settlements.map(item => [String(item.id), item])), work:clone(d.work) };
    },
    applyDocument(d) {
      repo.applyCloudSnapshot({state:{version:5,...d.period,byDate:Object.fromEntries(Object.entries(d.days || {}).map(([date,v]) => [date,{f:v.f,s:v.s,assignments:Object.entries(v.assignments || {}).map(([name,shift]) => ({name,shift}))}]))},staff:d.staff,shifts:d.shifts,settlements:Object.values(d.settlements || {}),work:d.work});
    }
  };
  global.SilkLocalRepository = repo;
})(window);
