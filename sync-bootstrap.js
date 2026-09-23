(function () {
  const start = () => window.SilkSyncService?.init();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true }); else start();
})();
