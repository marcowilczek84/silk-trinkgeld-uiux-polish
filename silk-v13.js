/* SILK Trinkgeld v13 — final visual consistency and responsive mode state. */
(function () {
  const setBodyMode = (mode) => {
    document.body.dataset.mode = mode === 'period' ? 'period' : 'day';
  };

  const previousSetMode = setMode;
  setMode = function (mode) {
    setBodyMode(mode);
    previousSetMode(mode);
  };

  setBodyMode(MODE);

  document.querySelectorAll('.settingsrow').forEach((row) => {
    row.setAttribute('role', row.tagName === 'LABEL' ? 'button' : row.getAttribute('role') || 'button');
  });
})();

/* Whole-franc results and locally saved calculations. */
(function () {
  const SAVED_KEY = 'silk_saved_calculations_v1';
  const originalCalculate = calculate;

  chf = function (value) {
    return 'CHF ' + Math.round(Number(value) || 0).toLocaleString('de-CH', {
      maximumFractionDigits: 0
    });
  };

  function readSaved() {
    return SilkLocalRepository.getSettlements();
  }

  function writeSaved(items) {
    SilkLocalRepository.saveSettlements(items);
  }

  function currentLabel() {
    if (MODE === 'day') {
      const date = new Date((singleDate.value || dateIn(new Date())) + 'T12:00:00');
      return new Intl.DateTimeFormat('de-CH', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      }).format(date);
    }
    const dates = visibleDates();
    if (!dates.length) return 'Zeitraum';
    const short = (date) => new Intl.DateTimeFormat('de-CH', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(date);
    return short(dates[0]) + ' – ' + short(dates[dates.length - 1]);
  }

  window.saveCurrentCalculation = function () {
    if (resultSection.classList.contains('hidden') || !result.innerHTML.trim()) return;
    const items = readSaved();
    const dates = visibleDates();
    const structuredRows = [...result.querySelectorAll('.resrow')].map((row, sortOrder) => ({
      displayName: row.querySelector('span')?.childNodes[0]?.textContent.trim() || '',
      details: row.querySelector('small')?.textContent.trim() || '',
      amountDisplay: row.querySelector('b')?.textContent.trim() || '',
      amount: Number((row.querySelector('b')?.textContent || '').replace(/[^0-9,.-]/g, '').replace(',', '.')) || 0,
      sortOrder
    }));
    items.unshift({
      id: Date.now(),
      label: currentLabel(),
      savedAt: new Date().toISOString(),
      html: result.innerHTML,
      dataFormat: 'structured-v1',
      periodStart: dates.length ? dateIn(dates[0]) : null,
      periodEnd: dates.length ? dateIn(dates[dates.length - 1]) : null,
      calculationVersion: 'silk-v13',
      inputSnapshot: { state: getState(), staff: [...STAFF], shifts: SHIFTS.map(item => ({...item})) },
      resultData: { totalDisplay: result.querySelector('.resulthead strong')?.textContent.trim() || '', lines: structuredRows }
    });
    writeSaved(items.slice(0, 50));
    const button = document.getElementById('saveCalculationButton');
    if (button) {
      button.textContent = 'Gespeichert';
      button.classList.add('saved');
    }
  };

  window.openSavedCalculations = function () {
    settingsHome.classList.add('hidden');
    staffEditor.classList.add('hidden');
    shiftEditor.classList.add('hidden');
    let panel = document.getElementById('savedCalculations');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'savedCalculations';
      drawer.appendChild(panel);
    }
    const items = readSaved();
    panel.classList.remove('hidden');
    panel.innerHTML = `<h3><button class="backlink" onclick="backFromSaved()">← Einstellungen</button></h3>
      <h3>Gespeicherte Berechnungen</h3>
      <div class="saved-list">${items.length ? items.map((item) => `
        <div class="saved-item">
          <button class="saved-open" onclick="restoreSavedCalculation(${item.id})">
            <strong>${esc(item.label)}</strong>
            <small>${new Intl.DateTimeFormat('de-CH', {dateStyle:'medium', timeStyle:'short'}).format(new Date(item.savedAt))}</small>
          </button>
          <button class="saved-delete" aria-label="Gespeicherte Berechnung löschen" onclick="deleteSavedCalculation(${item.id})">Löschen</button>
        </div>`).join('') : '<p class="saved-empty">Noch keine Berechnung gespeichert.</p>'}</div>`;
  };

  window.backFromSaved = function () {
    document.getElementById('savedCalculations')?.classList.add('hidden');
    settingsHome.classList.remove('hidden');
  };

  window.restoreSavedCalculation = function (id) {
    const item = readSaved().find((entry) => entry.id === id);
    if (!item) return;
    result.innerHTML = item.html;
    resultSection.classList.remove('hidden');
    closeSettings();
    setTimeout(() => resultSection.scrollIntoView({behavior:'smooth', block:'start'}), 220);
  };

  window.deleteSavedCalculation = function (id) {
    writeSaved(readSaved().filter((entry) => entry.id !== id));
    openSavedCalculations();
  };

  calculate = function () {
    originalCalculate();
    let actions = resultSection.querySelector('.result-actions');
    if (actions && !document.getElementById('saveCalculationButton')) {
      const button = document.createElement('button');
      button.id = 'saveCalculationButton';
      button.className = 'secondary save-calculation';
      button.textContent = 'Berechnung speichern';
      button.onclick = saveCurrentCalculation;
      actions.prepend(button);
    }
  };

  const settingsRows = settingsHome.querySelectorAll('.settingsrow');
  const savedRow = document.createElement('button');
  savedRow.className = 'settingsrow';
  savedRow.onclick = openSavedCalculations;
  savedRow.innerHTML = `<span class="setting-icon" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M5 4h14v16H5zM8 4v6h8V4M8 15h8"/></svg>
    </span><span class="setting-copy"><strong>Gespeicherte Berechnungen</strong>
    <small>Ergebnisse öffnen und verwalten</small></span><span class="setting-arrow">›</span>`;
  if (settingsRows.length > 1) settingsRows[1].after(savedRow);
  else settingsHome.prepend(savedRow);
})();
