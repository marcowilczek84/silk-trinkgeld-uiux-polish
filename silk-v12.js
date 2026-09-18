/* SILK Trinkgeld v12 — accessibility, mobile input and interaction polish. */
(function () {
  const menuButtons = document.querySelectorAll('.iconbtn');
  const drawerElement = document.getElementById('drawer');
  const drawerBackdrop = document.getElementById('drawerBack');

  menuButtons.forEach((button, index) => {
    button.setAttribute('aria-label', index === 0 ? 'Einstellungen schließen' : 'Einstellungen öffnen');
  });

  if (drawerElement) {
    drawerElement.setAttribute('role', 'dialog');
    drawerElement.setAttribute('aria-modal', 'true');
    drawerElement.setAttribute('aria-label', 'Einstellungen');
  }

  const originalOpenSettings = openSettings;
  const originalCloseSettings = closeSettings;

  openSettings = function () {
    originalOpenSettings();
    document.body.style.overflow = 'hidden';
    menuButtons[0]?.focus({ preventScroll: true });
  };

  closeSettings = function () {
    originalCloseSettings();
    document.body.style.overflow = '';
    menuButtons[1]?.focus({ preventScroll: true });
  };

  drawerBackdrop?.addEventListener('click', () => {
    document.body.style.overflow = '';
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && drawerElement?.classList.contains('open')) closeSettings();
  });

  document.addEventListener('input', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'number') return;
    input.min = '0';
    if (Number(input.value) < 0) input.value = '0';
  });

  const refreshAccordionState = () => {
    document.querySelectorAll('.day').forEach((day) => {
      const button = day.querySelector('.dayhead');
      if (button) button.setAttribute('aria-expanded', String(day.classList.contains('open')));
    });
  };

  const originalToggleDay = toggleDay;
  toggleDay = function (key) {
    originalToggleDay(key);
    refreshAccordionState();
  };

  const originalBuildVisibleDaysV12 = buildVisibleDays;
  buildVisibleDays = function () {
    originalBuildVisibleDaysV12();
    document.querySelectorAll('.dayhead').forEach((button) => button.type = 'button');
    document.querySelectorAll('.daybody input[type="number"]').forEach((input) => {
      input.min = '0';
      input.setAttribute('aria-label', input.id.startsWith('f_') ? 'Trinkgeld Frühdienst' : 'Trinkgeld Spätdienst');
    });
    refreshAccordionState();
  };

  buildVisibleDays();
})();
