(function (global) {
  'use strict';
  const labels = { synced: 'Synchronisiert', pending: 'Synchronisierung ausstehend', offline: 'Offline', conflict: 'Konflikt', local: 'Nur lokal', connecting: 'Verbinden …' };
  let current = 'local';
  function ensure() {
    let node = document.getElementById('silkSyncStatus');
    if (!node && document.body) {
      node = document.createElement('div'); node.id = 'silkSyncStatus'; node.className = 'silk-sync-status'; node.setAttribute('aria-live', 'polite'); document.body.appendChild(node);
    }
    return node;
  }
  function set(status, detail) {
    current = status; const node = ensure(); if (!node) return;
    node.dataset.status = status; node.textContent = detail || labels[status] || status;
  }
  global.SilkSyncStatus = { set, get: () => current };
})(window);
