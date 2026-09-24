(function (global) {
  'use strict';
  const { KEYS, parse, uuid, clone } = global.SilkStorageModels;
  const get = (key, fallback) => parse(localStorage.getItem(key), fallback);
  const set = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  let applyingCloud = false;
  const notify = (entity, payload) => { if (!applyingCloud) global.dispatchEvent(new CustomEvent('silk:local-change', { detail: { entity, payload: clone(payload) } })); };
  const repo = {
    getState: () => get(KEYS.state, {}),
    saveState(value, options = {}) { set(KEYS.state, value); if (!options.silent) notify('state', value); return value; },
    getStaff: fallback => get(KEYS.staff, fallback || []),
    saveStaff(value, options = {}) { set(KEYS.staff, value); if (!options.silent) notify('staff', value); return value; },
    getShifts: fallback => get(KEYS.shifts, fallback || []),
    saveShifts(value, options = {}) { set(KEYS.shifts, value); if (!options.silent) notify('shifts', value); return value; },
    getMode: fallback => localStorage.getItem(KEYS.mode) || fallback,
    saveMode(value, options = {}) { localStorage.setItem(KEYS.mode, value); if (!options.silent) notify('mode', value); },
    getSettlements: () => get(KEYS.settlements, []),
    saveSettlements(value, options = {}) { set(KEYS.settlements, value); if (!options.silent) notify('settlements', value); return value; },
    getDraftDeletes: () => get(KEYS.draftDeletes, []),
    saveDraftDeletes(value) { set(KEYS.draftDeletes, value); notify('drafts', value); },
    getActiveDraft: () => get(KEYS.activeDraft, null),
    saveActiveDraft(value) { set(KEYS.activeDraft, value); },
    getDeviceId() { let id = localStorage.getItem(KEYS.device); if (!id) { id = uuid(); localStorage.setItem(KEYS.device, id); } return id; },
    getWorkspace: () => get(KEYS.workspace, null),
    saveWorkspace(value) { set(KEYS.workspace, value); },
    getSyncMeta: () => get(KEYS.syncMeta, { revisions: {}, ids: { staff: {}, shifts: {}, days: {}, settlements: {} }, migrated: false }),
    saveSyncMeta(value) { set(KEYS.syncMeta, value); },
    getOutbox: () => get(KEYS.outbox, []),
    enqueue(entity, payload) { const list = repo.getOutbox(); list.push({ mutationId: uuid(), entity, payload: clone(payload), queuedAt: new Date().toISOString() }); set(KEYS.outbox, list.slice(-100)); return list.at(-1); },
    removeOutbox(mutationId) { set(KEYS.outbox, repo.getOutbox().filter(item => item.mutationId !== mutationId)); },
    getConflicts: () => get(KEYS.conflicts, []),
    saveConflicts(value) { set(KEYS.conflicts, value); global.dispatchEvent(new CustomEvent('silk:conflicts', { detail: clone(value) })); },
    applyCloudSnapshot(snapshot) {
      applyingCloud = true;
      try {
        if (snapshot.state) repo.saveState(snapshot.state, { silent: true });
        if (snapshot.staff) repo.saveStaff(snapshot.staff, { silent: true });
        if (snapshot.shifts) repo.saveShifts(snapshot.shifts, { silent: true });
        if (snapshot.settlements) repo.saveSettlements(snapshot.settlements, { silent: true });
        global.dispatchEvent(new CustomEvent('silk:cloud-applied'));
      } finally { applyingCloud = false; }
    }
  };
  global.SilkLocalRepository = repo;
})(window);
