document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const masterToggle = document.getElementById('master-toggle');
  const focusGenreInput = document.getElementById('focus-genre');
  const positiveKeywordsInput = document.getElementById('positive-keywords');
  const negativeKeywordsInput = document.getElementById('negative-keywords');
  const whitelistedChannelsInput = document.getElementById('whitelisted-channels');
  const blacklistedChannelsInput = document.getElementById('blacklisted-channels');
  const thresholdSlider = document.getElementById('threshold-slider');
  const thresholdVal = document.getElementById('threshold-val');
  const blockClickbaitInput = document.getElementById('block-clickbait');
  const blockShortsInput = document.getElementById('block-shorts');
  const filterCurrentVideoInput = document.getElementById('filter-current-video');
  const showBadgesInput = document.getElementById('show-badges');
  const enableTakeawaysInput = document.getElementById('enable-takeaways');
  const ollamaEndpointInput = document.getElementById('ollama-endpoint');
  const ollamaModelSelect = document.getElementById('ollama-model-select');
  const ollamaStatus = document.getElementById('ollama-status');
  const btnTestOllama = document.getElementById('btn-test-ollama');
  const btnRefreshModels = document.getElementById('btn-refresh-models');
  const btnSaveOnly = document.getElementById('btn-save-only');
  const btnSaveReload = document.getElementById('btn-save-reload');
  const saveStatus = document.getElementById('save-status');
  const btnClearStats = document.getElementById('btn-clear-stats');
  const blockedListContainer = document.getElementById('blocked-list');

  // Pomodoro Elements
  const pomoTimerText = document.getElementById('pomo-timer-text');
  const pomoModeTag = document.getElementById('pomo-mode-tag');
  const btnPomoToggle = document.getElementById('btn-pomo-toggle');
  const btnPomoReset = document.getElementById('btn-pomo-reset');

  // Stats Elements
  const statScanned = document.getElementById('stat-scanned');
  const statBlocked = document.getElementById('stat-blocked');
  const statLogic = document.getElementById('stat-logic');
  const statAi = document.getElementById('stat-ai');

  let selectedMode = 'hybrid';
  let savedModelName = FOCUSIFY_DEFAULTS.ollamaModel;
  let pomoTimerInterval = null;
  let pomState = focusifyDefaultPomodoro();

  // 1. Tab Switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      document.getElementById(targetId).classList.add('active');

      if (targetId === 'history-tab') {
        loadHistoryLog();
      }
    });
  });

  // 2. Engine Mode Selector
  const modeOpts = document.querySelectorAll('.mode-opt');
  modeOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      modeOpts.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      selectedMode = opt.getAttribute('data-mode');
    });
  });

  // 4. Preset chips are generated from FOCUSIFY_PRESETS (data, see scripts/presets.js)
  const presetContainer = document.getElementById('genre-presets');
  FOCUSIFY_PRESETS.forEach(preset => {
    const chip = document.createElement('button');
    chip.className = 'preset-chip';
    chip.type = 'button';
    chip.textContent = `${preset.icon} ${preset.label}`;
    chip.addEventListener('click', () => {
      focusGenreInput.value = preset.genre;
      positiveKeywordsInput.value = preset.positive;
      negativeKeywordsInput.value = preset.negative;
      showSaveToast('Preset loaded');
    });
    presetContainer.appendChild(chip);
  });

  // 5. Threshold Slider
  thresholdSlider.addEventListener('input', () => {
    thresholdVal.textContent = `${thresholdSlider.value}%`;
  });

  // 6. Load Settings from Storage
  async function loadSettings() {
    const config = await chrome.storage.sync.get(FOCUSIFY_DEFAULTS);

    masterToggle.checked = config.enabled;
    focusGenreInput.value = config.focusGenre;
    positiveKeywordsInput.value = config.positiveKeywords;
    negativeKeywordsInput.value = config.negativeKeywords;
    whitelistedChannelsInput.value = config.whitelistedChannels || '';
    blacklistedChannelsInput.value = config.blacklistedChannels || '';
    thresholdSlider.value = config.threshold;
    thresholdVal.textContent = `${config.threshold}%`;
    blockClickbaitInput.checked = config.blockClickbait;
    blockShortsInput.checked = config.blockShorts;
    filterCurrentVideoInput.checked = config.filterCurrentVideo;
    showBadgesInput.checked = config.showBadges;
    enableTakeawaysInput.checked = config.enableTakeaways;
    ollamaEndpointInput.value = config.ollamaEndpoint;
    savedModelName = config.ollamaModel;

    const radio = document.querySelector(`input[name="filter-action"][value="${config.filterAction}"]`);
    if (radio) radio.checked = true;

    selectedMode = config.mode;
    modeOpts.forEach(o => {
      if (o.getAttribute('data-mode') === selectedMode) {
        o.classList.add('active');
      } else {
        o.classList.remove('active');
      }
    });

    initActivationCard(config);
    initSitesTab(config);
    await fetchOllamaModels();
    await loadPomodoroState();
  }


  // Activation card: mode / schedule / pause. Saves instantly; open tabs react via storage events.
  function initActivationCard(config) {
    const seg = document.getElementById('state-seg');
    const dayRow = document.getElementById('day-row');
    const fields = document.getElementById('schedule-fields');
    const startEl = document.getElementById('schedule-start');
    const endEl = document.getElementById('schedule-end');
    const statusEl = document.getElementById('state-status');
    const pauseBtn = document.getElementById('btn-pause');
    let state = config.focusState || 'on';
    let days = Array.isArray(config.scheduleDays) ? [...config.scheduleDays] : [1, 2, 3, 4, 5];
    let pausedUntil = config.pausedUntil || 0;

    startEl.value = config.scheduleStart;
    endEl.value = config.scheduleEnd;

    function render() {
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.state === state));
      dayRow.querySelectorAll('button').forEach(b => b.classList.toggle('active', days.includes(Number(b.dataset.day))));
      fields.hidden = state !== 'auto';
      const now = Date.now();
      const cfg = { ...config, enabled: masterToggle.checked, focusState: state, scheduleDays: days,
        scheduleStart: startEl.value, scheduleEnd: endEl.value, pausedUntil };
      if (pausedUntil > now) {
        statusEl.textContent = `Paused until ${new Date(pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        pauseBtn.textContent = 'Resume';
      } else {
        const live = focusifyIsActive(cfg, now);
        statusEl.textContent = live ? '● Filtering now' : '○ Not filtering now';
        statusEl.classList.toggle('on', live);
        pauseBtn.textContent = 'Pause 15 min';
      }
    }

    function persist() {
      chrome.storage.sync.set({
        focusState: state, scheduleDays: days, scheduleStart: startEl.value || FOCUSIFY_DEFAULTS.scheduleStart,
        scheduleEnd: endEl.value || FOCUSIFY_DEFAULTS.scheduleEnd, pausedUntil
      });
      render();
    }

    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-state]');
      if (b) { state = b.dataset.state; persist(); }
    });
    dayRow.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-day]');
      if (!b) return;
      const d = Number(b.dataset.day);
      days = days.includes(d) ? days.filter(x => x !== d) : [...days, d];
      persist();
    });
    startEl.addEventListener('change', persist);
    endEl.addEventListener('change', persist);
    pauseBtn.addEventListener('click', () => {
      pausedUntil = pausedUntil > Date.now() ? 0 : Date.now() + 15 * 60 * 1000;
      persist();
    });
    masterToggle.addEventListener('change', render);
    render();
  }


  // Streaming-site blocking tab. Every change saves immediately; the service worker rebuilds the rules.
  async function initSitesTab(config) {
    const master = document.getElementById('block-sites');
    const chipBox = document.getElementById('site-chips');
    const customEl = document.getElementById('custom-domains');
    const permCard = document.getElementById('perm-card');
    const btnGrant = document.getElementById('btn-grant');
    let unblocked = new Set(Array.isArray(config.unblockedSiteIds) ? config.unblockedSiteIds : []);

    master.checked = Boolean(config.blockSites);
    customEl.value = focusifyParseDomainList(config.customBlockedDomains).join('\n');

    const currentConfig = () => ({ ...config, unblockedSiteIds: [...unblocked], customBlockedDomains: customEl.value });
    const origins = () => focusifyBlockedDomains(currentConfig()).map(d => `*://*.${d}/*`);

    async function refreshPermCard() {
      if (!master.checked) { permCard.hidden = true; return; }
      const list = origins();
      const granted = list.length === 0 || await chrome.permissions.contains({ origins: list });
      permCard.hidden = granted;
    }

    function renderChips() {
      chipBox.replaceChildren(...FOCUSIFY_SITE_PRESETS.map(site => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'site-chip' + (unblocked.has(site.id) ? '' : ' on');
        chip.textContent = site.name;
        chip.setAttribute('aria-pressed', String(!unblocked.has(site.id)));
        chip.addEventListener('click', () => {
          if (unblocked.has(site.id)) unblocked.delete(site.id); else unblocked.add(site.id);
          chrome.storage.sync.set({ unblockedSiteIds: [...unblocked] });
          renderChips();
          refreshPermCard();
        });
        return chip;
      }));
    }

    // Ask for access (needs a user gesture) so blocked sites get the friendly page. Blocking works either way.
    function requestAccess() {
      const list = origins();
      if (!list.length) return Promise.resolve(true);
      return chrome.permissions.request({ origins: list }).catch(() => false);
    }

    master.addEventListener('change', async () => {
      const on = master.checked;
      const asked = on ? requestAccess() : null; // start the prompt inside the click gesture
      await chrome.storage.sync.set({ blockSites: on });
      if (asked) await asked;
      refreshPermCard();
    });

    customEl.addEventListener('change', async () => {
      const cleaned = focusifyParseDomainList(customEl.value);
      customEl.value = cleaned.join('\n');
      await chrome.storage.sync.set({ customBlockedDomains: cleaned.join(', ') });
      refreshPermCard();
    });

    btnGrant.addEventListener('click', async () => {
      await requestAccess();
      refreshPermCard();
    });

    renderChips();
    refreshPermCard();
  }

  // 7. Fetch installed Ollama models. Options come only from the server plus the saved choice.
  function setModelOptions(models) {
    const names = [...new Set([savedModelName, ...models].filter(Boolean))];
    ollamaModelSelect.replaceChildren(...names.map(name => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = models.includes(name) ? name : `${name} (not installed)`;
      opt.selected = name === savedModelName;
      return opt;
    }));
  }

  function setOllamaStatus(kind, text) {
    ollamaStatus.className = `status-badge ${kind}`;
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    ollamaStatus.replaceChildren(dot, ` ${text}`);
  }

  async function fetchOllamaModels() {
    setOllamaStatus('disconnected', 'Checking…');
    const endpoint = ollamaEndpointInput.value.trim();
    try {
      const res = await chrome.runtime.sendMessage({ action: 'PING_OLLAMA', endpoint });
      if (res && res.success) {
        const models = res.models || [];
        setOllamaStatus('connected', `Online (${models.length} models)`);
        setModelOptions(models);
      } else {
        setOllamaStatus('disconnected', `Offline (${res ? res.error : 'no server'})`);
        setModelOptions([]);
      }
    } catch (err) {
      setOllamaStatus('disconnected', 'Offline');
      setModelOptions([]);
    }
  }

  // 8. Save Settings to Storage
  async function saveSettings(shouldReload = false) {
    const filterAction = document.querySelector('input[name="filter-action"]:checked')?.value || 'hide';
    const selectedModel = ollamaModelSelect.value || savedModelName;

    const newConfig = {
      enabled: masterToggle.checked,
      mode: selectedMode,
      focusGenre: focusGenreInput.value.trim(),
      positiveKeywords: positiveKeywordsInput.value.trim(),
      negativeKeywords: negativeKeywordsInput.value.trim(),
      whitelistedChannels: whitelistedChannelsInput.value.trim(),
      blacklistedChannels: blacklistedChannelsInput.value.trim(),
      threshold: Number(thresholdSlider.value),
      blockClickbait: blockClickbaitInput.checked,
      blockShorts: blockShortsInput.checked,
      filterCurrentVideo: filterCurrentVideoInput.checked,
      showBadges: showBadgesInput.checked,
      enableTakeaways: enableTakeawaysInput.checked,
      filterAction,
      ollamaEndpoint: ollamaEndpointInput.value.trim(),
      ollamaModel: selectedModel
    };

    await chrome.storage.sync.set(newConfig);

    if (shouldReload) {
      showSaveToast('Applied! Reloading page...');
      await chrome.runtime.sendMessage({ action: 'RELOAD_ACTIVE_TAB' });
    } else {
      showSaveToast('Settings saved!');
    }
  }

  function showSaveToast(msg = 'Settings saved') {
    saveStatus.textContent = msg;
    saveStatus.classList.add('show');
    setTimeout(() => {
      saveStatus.classList.remove('show');
    }, 2200);
  }

  btnSaveOnly.addEventListener('click', () => saveSettings(false));
  btnSaveReload.addEventListener('click', () => saveSettings(true));
  masterToggle.addEventListener('change', () => saveSettings(false));
  btnTestOllama.addEventListener('click', fetchOllamaModels);
  btnRefreshModels.addEventListener('click', fetchOllamaModels);

  // 9. Pomodoro Timer Logic
  async function loadPomodoroState() {
    const res = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
    if (res && res.success && res.stats.pomodoroState) {
      pomState = res.stats.pomodoroState;
    }
    updatePomoUI();
    if (pomState.active) {
      startPomoTimer();
    }
  }

  function updatePomoUI() {
    const min = Math.floor(pomState.remainingSec / 60);
    const sec = pomState.remainingSec % 60;
    pomoTimerText.textContent = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    pomoModeTag.textContent = pomState.mode === 'focus' ? '⏳ Focus Session' : '☕ Break Time';

    if (pomState.active) {
      btnPomoToggle.textContent = '⏸ Pause';
      btnPomoToggle.className = 'btn btn-secondary small';
    } else {
      btnPomoToggle.textContent = pomState.mode === 'focus' ? '▶ Start' : '▶ Start Break';
      btnPomoToggle.className = 'btn btn-primary small';
    }
  }

  function startPomoTimer() {
    if (pomoTimerInterval) clearInterval(pomoTimerInterval);

    pomoTimerInterval = setInterval(async () => {
      if (!pomState.active) return;

      pomState.remainingSec--;
      if (pomState.remainingSec <= 0) {
        if (pomState.mode === 'focus') {
          pomState.mode = 'break';
          pomState.remainingSec = FOCUSIFY_DEFAULTS.pomodoroBreakMin * 60;
          showSaveToast('🎉 Focus Session Finished! Break Started.');
        } else {
          pomState.mode = 'focus';
          pomState.remainingSec = FOCUSIFY_DEFAULTS.pomodoroFocusMin * 60;
          showSaveToast('🔔 Break Over! Focus Session Started.');
        }
      }

      updatePomoUI();
      await chrome.runtime.sendMessage({ action: 'UPDATE_POMODORO', pomodoroState: pomState });
    }, 1000);
  }

  btnPomoToggle.addEventListener('click', async () => {
    pomState.active = !pomState.active;
    updatePomoUI();
    if (pomState.active) {
      startPomoTimer();
    } else {
      if (pomoTimerInterval) clearInterval(pomoTimerInterval);
    }
    await chrome.runtime.sendMessage({ action: 'UPDATE_POMODORO', pomodoroState: pomState });
  });

  btnPomoReset.addEventListener('click', async () => {
    if (pomoTimerInterval) clearInterval(pomoTimerInterval);
    pomState.active = false;
    pomState.mode = 'focus';
    pomState.remainingSec = FOCUSIFY_DEFAULTS.pomodoroFocusMin * 60;
    updatePomoUI();
    await chrome.runtime.sendMessage({ action: 'UPDATE_POMODORO', pomodoroState: pomState });
    showSaveToast('Timer Reset');
  });

  // 10. Load Live Statistics
  async function loadStats() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
      if (response && response.success) {
        const stats = response.stats;
        statScanned.textContent = stats.scannedCount || 0;
        const blocked = stats.blockedCount || 0;
        statBlocked.textContent = blocked;
        statLogic.textContent = stats.logicCount || 0;
        statAi.textContent = stats.aiCount || 0;
      }
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  }

  // 11. Load History Log
  async function loadHistoryLog() {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATS' });
      if (response && response.success) {
        const recentBlocked = response.stats.recentBlocked || [];
        if (recentBlocked.length === 0) {
          blockedListContainer.innerHTML = '<div class="empty-state">No videos blocked yet in this session.</div>';
          return;
        }

        blockedListContainer.innerHTML = recentBlocked.map(item => {
          const dateStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const isAI = item.engine && item.engine.includes('ai');
          const engineBadge = isAI ? '🤖 Ollama' : '⚡ Logic';
          return `
            <div class="blocked-item">
              <div class="blocked-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
              <div class="blocked-meta">
                <span>${escapeHtml(item.channel)} • <strong class="engine-tag ${isAI ? 'ai' : 'logic'}">${engineBadge}</strong></span>
                <span>${dateStr}</span>
              </div>
              <div class="blocked-reason">🚫 ${escapeHtml(item.reason)}</div>
            </div>
          `;
        }).join('');
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }

  // 12. Clear Statistics
  btnClearStats.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'CLEAR_STATS' });
    loadStats();
    loadHistoryLog();
    showSaveToast('History Cleared');
  });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  await loadSettings();
  await loadStats();
});
