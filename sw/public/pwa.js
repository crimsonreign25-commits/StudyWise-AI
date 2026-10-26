(() => {
  const installButton = document.getElementById('install-app');
  let installPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if ('serviceWorker' in navigator && location.protocol === 'https:' || location.hostname === 'localhost') {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
  }
  if (isStandalone() && installButton) { installButton.hidden = true; }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); installPrompt = event;
    if (installButton) { installButton.hidden = false; installButton.textContent = '↓ Install app'; }
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    if (installButton) installButton.hidden = true;
    const toast = document.getElementById('toast');
    if (toast) { toast.textContent = 'StudyWise AI installed successfully.'; toast.classList.add('show'); }
  });
  if (installButton) installButton.addEventListener('click', async () => {
    if (installPrompt) {
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      installButton.hidden = true;
    } else {
      const isAndroid = /android/i.test(navigator.userAgent);
      const message = isAndroid
        ? 'To install StudyWise, open your browser menu (⋮) and choose “Install app” or “Add to Home screen”.'
        : 'Open your browser menu and choose “Install app” or “Add to Home Screen”, if available.';
      const toast = document.getElementById('toast');
      if (toast) { toast.textContent = message; toast.classList.add('show'); window.setTimeout(() => toast.classList.remove('show'), 5000); }
      else window.alert(message);
    }
  });
})();
