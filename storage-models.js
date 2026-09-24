(function (global) {
  'use strict';
  const KEYS = Object.freeze({
    state: 'silk_v12_data', staff: 'silk_staff', shifts: 'silk_shifts', mode: 'silk_tip_mode',
    settlements: 'silk_saved_calculations_v1', legacyBackup: 'silk_legacy_backup_v1',
    device: 'silk_device_installation_v1', workspace: 'silk_workspace_connection_v1',
    syncMeta: 'silk_sync_meta_v1', outbox: 'silk_sync_outbox_v1', conflicts: 'silk_sync_conflicts_v1',
    draftDeletes: 'silk_draft_deletes_v1', activeDraft: 'silk_active_draft_v1'
  });
  const LEGACY_KEYS = [KEYS.state, KEYS.staff, KEYS.shifts, KEYS.mode, KEYS.settlements];
  const parse = (value, fallback) => { try { return value == null ? fallback : JSON.parse(value); } catch (_) { return fallback; } };
  const uuid = () => global.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  global.SilkStorageModels = { KEYS, LEGACY_KEYS, parse, uuid, clone };
})(window);
