/* SILK Trinkgeld v11 — focused interaction and accessibility refinements. */
(function () {
  const originalBuildVisibleDays = buildVisibleDays;

  function markDay(dayKey) {
    const day = document.getElementById('day_' + dayKey);
    const early = Number(document.getElementById('f_' + dayKey)?.value || 0);
    const late = Number(document.getElementById('s_' + dayKey)?.value || 0);
    day?.classList.toggle('has-values', early + late > 0);
  }

  buildVisibleDays = function () {
    originalBuildVisibleDays();
    document.querySelectorAll('.day').forEach((day) => markDay(day.id.slice(4)));
  };

  styleShift = function (select) {
    const active = Boolean(select.value);
    select.style.backgroundColor = active ? 'var(--turquoise-soft)' : '#fff';
    select.style.borderColor = active ? 'var(--turquoise)' : 'var(--line)';
    select.style.color = 'var(--ink)';
  };

  changeDay = function (dayKey) {
    const day = document.getElementById('day_' + dayKey);
    const early = Number(document.getElementById('f_' + dayKey)?.value || 0);
    const late = Number(document.getElementById('s_' + dayKey)?.value || 0);
    const sum = document.getElementById('sum_' + dayKey);
    const meta = document.getElementById('meta_' + dayKey);
    const active = [...day.querySelectorAll('select')].filter((select) => select.value).length;

    sum.textContent = chf(early + late);
    meta.textContent = active + ' aktiv';
    markDay(dayKey);
    saveState();
    resultSection.classList.add('hidden');
  };

  document.querySelectorAll('.iconbtn').forEach((button, index) => {
    button.type = 'button';
    button.setAttribute('aria-label', index === 0 ? 'Einstellungen schließen' : 'Einstellungen öffnen');
  });

  document.querySelectorAll('button').forEach((button) => {
    if (!button.type) button.type = 'button';
  });

  buildVisibleDays();
})();
