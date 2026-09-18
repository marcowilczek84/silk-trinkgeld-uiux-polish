(function () {
  const splash = document.createElement("div");
  splash.id = "silk-launch-splash";

  const silkLogo = document.querySelector("img[data-silk-logo]")?.src || "";
  splash.innerHTML = `
    <div class="sls-inner">
      <img class="sls-logo" src="${silkLogo}" alt="SILK Restaurant & Bar">
      <span class="sls-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M7 3v4M12 3v4M17 3v4M5 8h14v4a7 7 0 0 1-14 0V8Z"/>
          <path d="M8 21h8M12 16v5"/>
        </svg>
      </span>
      <span class="sls-label">Trinkgeld</span>
      <strong class="sls-title">Guten Tag</strong>
      <small class="sls-sub">Interne Anwendung</small>
    </div>
    <img class="sls-meili" src="https://ambassador-fruehstuecksliste.vercel.app/meili-selection.png" alt="Meili Selection Hotels">
  `;

  document.body.appendChild(splash);
  window.setTimeout(() => {
    splash.classList.add("is-leaving");
    window.setTimeout(() => splash.remove(), 500);
  }, 2500);
})();


