(function (global) {
  'use strict';
  const labels = { synced: 'Synchronisiert', pending: 'Synchronisierung ausstehend', offline: 'Offline · Änderungen lokal erhalten', conflict: 'Konflikt', local: 'Lokal gespeichert · Gerät nicht verbunden', error: 'Synchronisierung fehlgeschlagen · lokal erhalten', connecting: 'Verbinden …' };
  let current = 'local';
  function ensure() {
    let node = document.getElementById('silkSyncStatus');
    if (!node && document.body) {
      node = document.createElement('div'); node.id = 'silkSyncStatus'; node.className = 'silk-sync-status'; node.setAttribute('aria-live', 'polite'); (document.querySelector('.actionbar') || document.body).appendChild(node);
    }
    return node;
  }
  function set(status, detail) {
    current = status; const node = ensure(); if (!node) return;
    node.dataset.status = status; node.textContent = detail || labels[status] || status;
  }
  global.SilkSyncStatus = { set, get: () => current };
})(window);
