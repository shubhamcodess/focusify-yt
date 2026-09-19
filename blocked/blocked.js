(async () => {
  const HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
  const host = (new URLSearchParams(location.search).get('host') || '').toLowerCase();
  const config = { ...FOCUSIFY_DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  const domains = focusifyBlockedDomains(config);
  // The page is reachable from the web, so only ever offer to visit a host the user actually blocks.
  const validHost = HOSTNAME_RE.test(host) && focusifyHostMatches(host, domains);

  if (validHost) document.getElementById('site').textContent = host;

  document.getElementById('btn-back').addEventListener('click', () => {
    if (history.length > 1) history.back();
    else window.close();
  });

  const pauseBtn = document.getElementById('btn-pause');
  const hint = document.getElementById('hint');
  if (!validHost) {
    pauseBtn.hidden = true;
    return;
  }

  // A short wait turns "just this once" into a deliberate choice.
  let left = Math.max(0, Number(config.siteUnlockDelaySec) || 0);
  const tick = () => {
    if (left > 0) {
      hint.textContent = `You can pause in ${left}s. Is it worth it?`;
      left--;
      setTimeout(tick, 1000);
    } else {
      hint.textContent = '';
      pauseBtn.disabled = false;
    }
  };
  tick();

  pauseBtn.addEventListener('click', async () => {
    await chrome.storage.sync.set({ pausedUntil: Date.now() + 15 * 60 * 1000 });
    // Give the rules a moment to update, then continue to the site.
    setTimeout(() => location.replace(`https://${host}/`), 400);
  });
})();
