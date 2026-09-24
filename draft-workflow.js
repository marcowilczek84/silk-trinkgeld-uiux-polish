/* Explicit, structured drafts are separate from the automatically saved work state. */
(function () {
  const local = window.SilkLocalRepository;
  const drafts = () => local.getSettlements().filter(item => item.dataFormat === 'draft-v1' && !item.deleted);
  const stamp = value => new Intl.DateTimeFormat('de-CH', { dateStyle:'medium', timeStyle:'short' }).format(new Date(value));
  const labelFor = dates => dates.length === 1 ? stamp(dates[0]).split(',')[0] : `${dateIn(dates[0])} – ${dateIn(dates.at(-1))}`;

  window.saveCurrentDraft = function () {
    saveState();
    const dates = visibleDates();
    if (!dates.length) return;
    const current = getState(), selected = Object.fromEntries(dates.map(date => {
      const key = dateIn(date); return [key, JSON.parse(JSON.stringify(current.byDate?.[key] || { f:'', s:'', assignments:[] }))];
    }));
    const periodStart = dateIn(dates[0]), periodEnd = dateIn(dates.at(-1));
    const active = local.getActiveDraft(), activeId = active?.id;
    const items = local.getSettlements();
    const existing = items.find(item => item.id === activeId && item.dataFormat === 'draft-v1' && !item.deleted);
    const now = new Date().toISOString();
    const item = existing || { id:SilkStorageModels.uuid(), cloudId:SilkStorageModels.uuid(), dataFormat:'draft-v1', createdAt:now };
    Object.assign(item, { label:labelFor(dates), savedAt:now, periodStart, periodEnd,
      inputSnapshot:{ mode:MODE, singleDate:singleDate.value, periodStart, periodEnd, byDate:selected,
        staff:[...STAFF], shifts:SHIFTS.map(shift => ({...shift})) } });
    if (existing && active.revision != null) item.revision = active.revision;
    if (!existing) items.unshift(item);
    local.saveSettlements(items);
    local.saveActiveDraft({id:item.id,revision:item.revision||null});
    const button = document.querySelector('.draft-actions button');
    if (button) button.textContent = 'Entwurf aktualisieren';
  };

  window.continueDraft = function (id) {
    const item = drafts().find(entry => entry.id === id);
    if (!item?.inputSnapshot) return;
    const snapshot = item.inputSnapshot, state = getState();
    local.saveState({ ...state, mode:snapshot.mode || 'day', singleDate:snapshot.singleDate || snapshot.periodStart,
      periodStart:snapshot.periodStart, periodEnd:snapshot.periodEnd,
      byDate:{ ...(state.byDate || {}), ...(snapshot.byDate || {}) } });
    local.saveActiveDraft({id:item.id,revision:item.revision||null});
    closeSettings();
    loadState();
    resultSection.classList.add('hidden');
    document.querySelector('.draft-actions button').textContent = 'Entwurf aktualisieren';
  };

  window.deleteDraft = function (id) {
    const items = local.getSettlements(), item = items.find(entry => entry.id === id && entry.dataFormat === 'draft-v1');
    if (!item || !confirm('Diesen Entwurf löschen?')) return;
    if (item.cloudId && item.revision) local.saveDraftDeletes([...local.getDraftDeletes(), { id:item.cloudId, revision:item.revision }]);
    local.saveSettlements(items.filter(entry => entry !== item));
    if (local.getActiveDraft()?.id === id) local.saveActiveDraft(null);
    openSavedCalculations();
  };

  window.clearCurrentPeriod = () => document.getElementById('clearPeriodDialog').classList.remove('hidden');
  window.closeClearPeriod = () => document.getElementById('clearPeriodDialog').classList.add('hidden');
  window.confirmClearPeriod = function () {
    saveState();
    const state = getState(), byDate = { ...(state.byDate || {}) };
    for (const date of visibleDates()) byDate[dateIn(date)] = { f:'', s:'', assignments:[] };
    local.saveState({ ...state, byDate });
    local.saveActiveDraft(null);
    document.querySelector('.draft-actions button').textContent = 'Entwurf anlegen';
    resultSection.classList.add('hidden');
    buildVisibleDays();
    closeClearPeriod();
  };

  const originalOpen = window.openSavedCalculations;
  window.openSavedCalculations = function () {
    originalOpen();
    const panel = document.getElementById('savedCalculations');
    const draftItems = drafts().sort((a,b) => String(b.savedAt).localeCompare(String(a.savedAt)));
    const finalItems = local.getSettlements().filter(item => item.dataFormat !== 'draft-v1');
    const draftMarkup = draftItems.map(item => `<div class="saved-item"><button class="saved-open" onclick="continueDraft('${item.id}')"><strong>${esc(item.label || 'Entwurf')}</strong><small>Zuletzt gespeichert: ${stamp(item.savedAt)}</small></button><button class="saved-delete" onclick="deleteDraft('${item.id}')">Löschen</button></div>`).join('');
    const finalMarkup = panel.querySelector('.saved-list')?.innerHTML || '';
    panel.querySelector('.saved-list').innerHTML = `<h3 class="saved-section-title">Entwürfe</h3>${draftMarkup || '<p class="saved-empty">Noch keine Entwürfe.</p>'}<h3 class="saved-section-title">Gespeicherte Abrechnungen</h3>${finalItems.length ? finalMarkup : '<p class="saved-empty">Noch keine Abrechnung gespeichert.</p>'}`;
  };
})();
