(function (global) {
  'use strict';
  const { KEYS, LEGACY_KEYS } = global.SilkStorageModels;
  const local = global.SilkLocalRepository;
  const assignmentKey = list => (list || []).filter(a => a.name && a.shift).map(a => `${a.name}\u0000${a.shift}`).sort().join('\u0001');
  const sameDay = (a, b, remoteAssignments) => Number(a?.f || 0) === Number(b?.early_amount || 0) && Number(a?.s || 0) === Number(b?.late_amount || 0) && assignmentKey(a?.assignments) === assignmentKey(remoteAssignments);
  function backup() {
    if (localStorage.getItem(KEYS.legacyBackup)) { try { return JSON.parse(localStorage.getItem(KEYS.legacyBackup)); } catch (_) { return null; } }
    const value = { createdAt: new Date().toISOString(), values: Object.fromEntries(LEGACY_KEYS.map(key => [key, localStorage.getItem(key)])) };
    localStorage.setItem(KEYS.legacyBackup, JSON.stringify(value)); return value;
  }
  function cloudState(cloud) {
    const staffById = Object.fromEntries(cloud.tip_staff_members.map(row => [row.id, row.display_name]));
    const shiftsById = Object.fromEntries(cloud.tip_shift_types.map(row => [row.id, row.code]));
    const assignments = cloud.tip_assignments.reduce((out, row) => {
      const day = cloud.tip_days.find(d => d.id === row.tip_day_id); if (!day) return out;
      (out[day.business_date] ||= []).push({ name: staffById[row.staff_member_id] || row.staff_member_id, shift: shiftsById[row.shift_type_id] || row.shift_code_snapshot || '' }); return out;
    }, {});
    return Object.fromEntries(cloud.tip_days.map(row => [row.business_date, { f: String(row.early_amount), s: String(row.late_amount), assignments: assignments[row.business_date] || [] }]));
  }
  function merge(cloud) {
    backup();
    const state = local.getState(), localDays = state.byDate || {}, remoteDays = cloudState(cloud), merged = { ...localDays }, conflicts = [];
    Object.entries(remoteDays).forEach(([date, remote]) => {
      const row = cloud.tip_days.find(item => item.business_date === date);
      if (!localDays[date]) merged[date] = remote;
      else if (!sameDay(localDays[date], row, remote.assignments)) conflicts.push({ id: 'day:'+date, type: 'day', date, local: localDays[date], remote, remoteRevision: row.revision });
    });
    const staff = [...new Set([...local.getStaff([]), ...cloud.tip_staff_members.map(row => row.display_name)])];
    const localShifts = local.getShifts([]), localCodes = new Set(localShifts.map(row => row.name));
    const shifts = [...localShifts, ...cloud.tip_shift_types.filter(row => !localCodes.has(row.code)).map(row => ({ name: row.code, f: Number(row.early_weight), s: Number(row.late_weight), color: row.color || '#eee' }))];
    const settlements = [...local.getSettlements()];
    const settlementKeys = new Set(settlements.map(item => item.cloudId ? 'cloud:'+item.cloudId : 'legacy:'+item.id));
    cloud.tip_settlements.forEach(row => { const key='cloud:'+row.id; if (!settlementKeys.has(key)) settlements.push({ id:row.legacy_id||Date.parse(row.saved_at), cloudId:row.id, revision:row.revision, label:row.label||'Abrechnung', savedAt:row.saved_at, html:row.legacy_html||'', dataFormat:row.data_format, periodStart:row.period_start, periodEnd:row.period_end, calculationVersion:row.calculation_version, inputSnapshot:row.input_snapshot, resultData:row.result }); });
    cloud.tip_legacy_snapshots.forEach(row => { const key='legacy:'+row.legacy_id; if (!settlementKeys.has(key)) settlements.push({ id:row.legacy_id||Date.parse(row.saved_at||row.created_at), label:row.label||'Legacy-Abrechnung', savedAt:row.saved_at||row.created_at, html:row.legacy_html, dataFormat:'legacy-html-v1' }); });
    local.applyCloudSnapshot({ state: { ...state, byDate: merged }, staff, shifts, settlements });
    local.saveConflicts(conflicts);
    return { conflicts, remoteDays };
  }
  global.SilkLegacyMigration = { backup, merge, cloudState };
})(window);
