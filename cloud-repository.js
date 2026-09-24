(function (global) {
  'use strict';
  class ConflictError extends Error { constructor(entity, local, remote) { super('Cloud revision is newer'); this.name = 'ConflictError'; this.entity = entity; this.local = local; this.remote = remote; } }
  class CloudRepository {
    constructor(client, workspaceId, deviceId) { this.client = client; this.workspaceId = workspaceId; this.deviceId = deviceId; }
    async loadAll() {
      const tables = ['tip_staff_members','tip_shift_types','tip_days','tip_assignments','tip_settlements','tip_settlement_lines','tip_legacy_snapshots','tip_drafts'];
      const results = await Promise.all(tables.map(table => this.client.from(table).select('*').eq('workspace_id', this.workspaceId)));
      const failed = results.find(result => result.error); if (failed) throw failed.error;
      return Object.fromEntries(tables.map((table, i) => [table, results[i].data || []]));
    }
    async insert(table, row) { const { data, error } = await this.client.from(table).insert(row).select().single(); if (error) throw error; return data; }
    async updateWithRevision(table, id, revision, changes, entity) {
      const { data, error } = await this.client.from(table).update(changes).eq('id', id).eq('revision', revision).select();
      if (error) throw error;
      if (!data?.length) { const remote = await this.client.from(table).select('*').eq('id', id).maybeSingle(); throw new ConflictError(entity, changes, remote.data); }
      return data[0];
    }
    async deleteWithRevision(table, id, revision, entity) {
      const { data, error } = await this.client.from(table).delete().eq('id', id).eq('revision', revision).select();
      if (error) throw error;
      if (!data?.length) { const remote = await this.client.from(table).select('*').eq('id', id).maybeSingle(); throw new ConflictError(entity, { deleted: true }, remote.data); }
      return data[0];
    }
    async pair(code, deviceName) {
      const { data, error } = await this.client.rpc('tip_redeem_pairing_code', { p_code: code, p_device_installation_id: this.deviceId, p_device_name: deviceName });
      if (error) throw error; const row = Array.isArray(data) ? data[0] : data; if (!row?.workspace_id) throw new Error('Workspace konnte nicht verbunden werden.'); return row;
    }
    subscribe(onSignal) {
      return this.client.channel('silk-tip-'+this.workspaceId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_days', filter: `workspace_id=eq.${this.workspaceId}` }, p => onSignal('day', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_assignments', filter: `workspace_id=eq.${this.workspaceId}` }, p => onSignal('assignment', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_staff_members', filter: `workspace_id=eq.${this.workspaceId}` }, p => onSignal('staff', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_shift_types', filter: `workspace_id=eq.${this.workspaceId}` }, p => onSignal('shift', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_settlements', filter: `workspace_id=eq.${this.workspaceId}` }, p => onSignal('settlement', p))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tip_drafts', filter: `workspace_id=eq.${this.workspaceId}` }, p => onSignal('draft', p))
        .subscribe();
    }
  }
  global.SilkCloudRepository = { CloudRepository, ConflictError };
})(window);
