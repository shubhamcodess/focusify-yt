/**
 * Focusify YouTube Content Script
 * Monitors YouTube DOM, extracts video titles & channel names, applies logic & AI filters.
 */

(function () {
  let currentConfig = null;
  let observer = null;
  let isProcessing = false;
  let unblockedElements = new WeakSet();
  let dirty = false;
  let breakActive = false;

  // In-page decision cache (videoId/title + config hash) so re-rendered cards never re-classify.
  const decisionCache = new Map();
  const MAX_LOCAL_CACHE = 2000;

  // Batched stats reporting: one message per second instead of one per card.
  let statsQueue = [];
  let statsTimer = null;
  function queueStat(decision, title, channel) {
    statsQueue.push({ decision, title, channel });
    if (!statsTimer) statsTimer = setTimeout(flushStats, 1000);
  }
  function flushStats() {
    statsTimer = null;
    if (!statsQueue.length) return;
    const items = statsQueue;
    statsQueue = [];
    try { chrome.runtime.sendMessage({ action: 'RECORD_STATS', items }).catch(() => {}); } catch (e) { /* context invalidated */ }
  }

  // Single active takeaways modal reference across the page
  let activeTakeawaysModal = null;
  let activeTakeawaysContainer = null;
  let isModalPinned = false;

  const VIDEO_SELECTORS = [
    'ytd-rich-item-renderer',                      // Home Page Grid Item
    'ytd-compact-video-renderer',                   // Watch Page Sidebar Item
    'ytd-video-renderer',                          // Search Result Item
    'ytd-grid-video-renderer',                     // Channel Video Grid Item
    'ytd-playlist-video-renderer',                 // Playlist Item
    'yt-lockup-view-model',                        // Polymer Redesign Lockup Item
    'ytd-rich-grid-media',                         // Alternative Grid Container
    '.ytp-videowall-still'                         // Endscreen Video Wall Card
  ];

  // Shorts are found by their /shorts/ links, not by YouTube's changing element names.
  // A shelf is hidden whole when it has no regular videos; otherwise only the Shorts card is hidden.
  const SHORTS_SHELF_TAGS = 'grid-shelf-view-model, ytd-reel-shelf-renderer, ytd-rich-shelf-renderer, ytd-rich-section-renderer, ytd-shelf-renderer';
  const SHORTS_ITEM_TAGS = 'ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2, ytd-reel-item-renderer, ytd-video-renderer, ytd-rich-item-renderer, yt-lockup-view-model, ytd-compact-video-renderer, ytd-grid-video-renderer';
  const SHORTS_NAV_ENTRIES = 'ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer';

  function hideShorts() {
    document.querySelectorAll('a[href*="/shorts/"]').forEach(a => {
      if (a.closest('#focusify-current-guard')) return;
      const nav = a.closest(SHORTS_NAV_ENTRIES);
      if (nav) { markShortsHidden(nav); return; }

      const shelf = a.closest(SHORTS_SHELF_TAGS);
      if (shelf && !shelf.querySelector('a[href*="/watch?v="]')) {
        markShortsHidden(shelf);
        return;
      }
      const item = a.closest(SHORTS_ITEM_TAGS);
      if (item) markShortsHidden(item);
    });
  }

  function markShortsHidden(el) {
    el.dataset.focusifyShorts = 'true';
    el.classList.add('focusify-hidden');
  }

  function unhideShorts() {
    document.querySelectorAll('[data-focusify-shorts]').forEach(el => {
      el.classList.remove('focusify-hidden');
      delete el.dataset.focusifyShorts;
    });
  }

  function setGate(on) {
    const root = document.documentElement;
    if (on) root.setAttribute('data-focusify', 'on');
    else root.removeAttribute('data-focusify');
    // Lets the stylesheet hide known Shorts elements before any script runs on the page.
    if (on && currentConfig.blockShorts && !breakActive) root.setAttribute('data-focusify-noshorts', '');
    else root.removeAttribute('data-focusify-noshorts');
  }

  let isActive = false;
  let activeTimer = null;

  function computeActive() {
    return Boolean(currentConfig) && focusifyIsActive(currentConfig, Date.now());
  }

  // Redirect /shorts/ID to the normal watch page (no swipe-feed).
  function maybeRedirectShorts() {
    if (!isActive || !currentConfig.blockShorts || breakActive) return;
    const m = location.pathname.match(/^\/shorts\/([\w-]{6,})/);
    if (m) location.replace(`/watch?v=${m[1]}`);
  }

  // Turn filtering on/off to match the effective state (mode, schedule, pause, master switch).
  function syncActiveState() {
    const next = computeActive();
    const changed = next !== isActive;
    isActive = next;

    // Re-check on a timer: a schedule edge or the end of a pause flips the state with no storage event.
    clearTimeout(activeTimer);
    activeTimer = setTimeout(() => { if (computeActive() !== isActive) applyConfigChange(); }, 30000);

    if (!isActive) {
      removeCurrentGuard();
      setGate(false);
      if (observer) observer.disconnect();
      removeHeaderBar();
      removeAllBadgesAndOverlays();
      return changed;
    }
    setGate(true);
    maybeRedirectShorts();
    setupMutationObserver();
    if (currentConfig.showBadges) injectHeaderBar();
    return changed;
  }

  function applyConfigChange() {
    decisionCache.clear();
    clearFeedPatience();
    removeHeaderBar();
    syncActiveState();
    if (isActive) processPage();
    guardCurrentVideo();
  }

  let navHooked = false;
  function hookNavigation() {
    if (navHooked) return;
    navHooked = true;
    window.addEventListener('yt-navigate-finish', () => {
      maybeRedirectShorts();
      debouncedProcessPage();
      guardCurrentVideo();
    });
  }

  async function init() {
    currentConfig = await loadConfig();
    await refreshBreakState();
    listenForStorageChanges();
    hookNavigation();
    syncActiveState();
    if (!isActive) return;

    const onReady = () => { processPage(); guardCurrentVideo(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
    else onReady();
  }

  async function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(FOCUSIFY_DEFAULTS, resolve);
    });
  }

  async function refreshBreakState() {
    try {
      const { pomodoroState } = await chrome.storage.local.get(['pomodoroState']);
      breakActive = Boolean(pomodoroState && pomodoroState.active && pomodoroState.mode === 'break');
    } catch (e) { breakActive = false; }
  }

  function setupMutationObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          debouncedProcessPage();
          break;
        }
      }
    });

    // document_start: body may not exist yet, so observe the root element.
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  let debounceTimer = null;
  function debouncedProcessPage() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => processPage(), 40);
  }

  async function processPage() {
    if (!isActive) return;
    if (isProcessing) { dirty = true; return; }
    isProcessing = true;
    dirty = false;

    if (currentConfig.blockShorts && !breakActive) hideShorts();
    else unhideShorts();

    const videoElements = Array.from(document.querySelectorAll(VIDEO_SELECTORS.join(', ')));
    const configHash = getConfigHash();
    const unreadElements = videoElements.filter(el => !el.dataset.focusifyEvaluated || el.dataset.focusifyConfigHash !== configHash);

    try {
      if (unreadElements.length > 0) {
        // Score all pending cards in parallel; most resolve synchronously via the logic engine.
        await Promise.all(unreadElements.map(el => evaluateVideoElement(el).catch(() => {})));
        if (currentConfig.showBadges) updateHeaderStats();
      }
      checkFeedPatience();
    } finally {
      isProcessing = false;
      if (dirty) debouncedProcessPage();
    }
  }

  function getConfigHash() {
    return `${focusifyConfigHash(currentConfig)}-${currentConfig.showBadges}-${currentConfig.enableTakeaways}-${breakActive}`;
  }

  function extractVideoId(el) {
    const a = el.querySelector('a[href*="/watch?v="], a[href*="/shorts/"]');
    if (!a) return '';
    const href = a.getAttribute('href') || '';
    const m = href.match(/[?&]v=([\w-]{6,})/) || href.match(/\/shorts\/([\w-]{6,})/);
    return m ? m[1] : '';
  }

  // Cheap local verdict. Returns { decision, final } where final=false means "ask the AI".
  function classifyLocally(title, channel) {
    if (breakActive) {
      return { decision: { score: 100, allow: true, reason: '☕ Break Time Active - Filters Relaxed', engine: 'break' }, final: true };
    }
    const logic = FocusifyLogicEngine.evaluate(title, channel, currentConfig);
    if (currentConfig.mode === 'logic') return { decision: logic, final: true };
    if (logic.engine === 'whitelist' || logic.engine === 'blacklist') return { decision: logic, final: true };
    if (currentConfig.mode === 'ai') return { decision: logic, final: false };
    if (logic.negativeMatches && logic.negativeMatches.length > 0) return { decision: logic, final: true };
    // Discover style: anything the logic engine doesn't flag is shown; the AI isn't asked about topic fit.
    if (currentConfig.filterStyle === 'discover' && logic.allow) return { decision: logic, final: true };
    const upper = Math.min(95, Number(currentConfig.threshold) + 30);
    if (logic.score >= upper) return { decision: logic, final: true };
    return { decision: logic, final: false };
  }

  function extractVideoMetadata(el) {
    let title = '';
    let channel = '';

    const titleSelectors = [
      '#video-title',
      '#video-title-link',
      'a#video-title',
      'a#video-title-link',
      'yt-formatted-string#video-title',
      '.yt-lockup-metadata-view-model-wiz__title',
      'h3 a',
      'a[href*="/watch?v="]',
      '.ytp-videowall-still-info-title'
    ];

    for (const sel of titleSelectors) {
      const tEl = el.querySelector(sel);
      if (tEl) {
        const candidate = (tEl.getAttribute('title') || tEl.getAttribute('aria-label') || tEl.textContent || '').trim();
        if (candidate && candidate.length > 2) {
          title = candidate;
          break;
        }
      }
    }

    const channelSelectors = [
      '#channel-name',
      '#byline-container',
      '.ytd-channel-name',
      '#text.ytd-channel-name',
      '.yt-lockup-byline-view-model-wiz',
      '#byline',
      'a[href*="/@"]',
      '.ytp-videowall-still-info-author'
    ];

    for (const sel of channelSelectors) {
      const cEl = el.querySelector(sel);
      if (cEl) {
        const candidate = (cEl.textContent || '').trim();
        if (candidate) {
          channel = candidate;
          break;
        }
      }
    }

    // Newer card markup: pick the first metadata line that is a name (not views, age, or duration).
    if (!channel) {
      const skip = /\b(views?|watching|ago|subscribers?|waiting|premiere|live)\b|^[\d:.,]+[KMB]?$/i;
      const link = el.querySelector('a[href^="/@"], a[href*="/channel/"], a[href*="/c/"]');
      const linkText = link ? link.textContent.trim() : '';
      if (linkText && !skip.test(linkText)) {
        channel = linkText;
      } else {
        for (const n of el.querySelectorAll('[class*="metadata"] span, [class*="byline"] span, ytd-channel-name, yt-formatted-string')) {
          const t = (n.textContent || '').trim();
          if (t && t.length < 80 && !skip.test(t) && t !== title) { channel = t; break; }
        }
      }
    }

    return { title, channel };
  }

  // Local verdict first; the background (Ollama) is asked only for ambiguous cases. Cached per config.
  async function getDecision(title, channel, id) {
    const hash = getConfigHash();
    const cacheKey = `${hash}|${id || title.toLowerCase()}`;

    let decision = decisionCache.get(cacheKey);
    if (decision) return { decision, hash, fromCache: true };

    const local = classifyLocally(title, channel);
    decision = local.decision;

    if (!local.final) {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'CLASSIFY_VIDEO', title, channel });
        if (response && response.success) decision = response.decision;
      } catch (err) {
        // Keep the logic-engine verdict on failure.
      }
    }

    if (decisionCache.size >= MAX_LOCAL_CACHE) decisionCache.delete(decisionCache.keys().next().value);
    // Verdicts made without the AI are re-checked later, once Ollama may be back.
    if (!decision.degraded) decisionCache.set(cacheKey, decision);
    return { decision, hash, fromCache: false };
  }

  async function evaluateVideoElement(el) {
    if (unblockedElements.has(el)) return;

    const { title, channel } = extractVideoMetadata(el);
    if (!title) return;

    const { decision, hash, fromCache } = await getDecision(title, channel, extractVideoId(el));

    el.dataset.focusifyEvaluated = 'true';
    el.dataset.focusifyConfigHash = hash;

    // Count each card once per config, not on every re-render.
    if (!fromCache) queueStat(decision, title, channel);

    applyDecisionToElement(el, decision, title, channel);
  }

  // ---------- Feed patience: stop the endless "hide, load more, hide" loop ----------
  // Hidden cards take no space, so YouTube's scroll loader stays in view and keeps fetching. When the
  // most recent run of cards before a loader is all filtered out, pause the loader and say so.
  const CONTINUATION_TAG = 'ytd-continuation-item-renderer';
  const PAGE_SCOPE_TAGS = 'ytd-browse, ytd-search, ytd-watch-flexy, ytd-two-column-browse-results-renderer';

  function trailingBlockedRun(continuation) {
    const scope = continuation.closest(PAGE_SCOPE_TAGS) || document;
    const items = scope.querySelectorAll('[data-focusify-evaluated], [data-focusify-shorts]');
    let run = 0;
    for (let i = items.length - 1; i >= 0; i--) {
      const el = items[i];
      if (!(continuation.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING)) continue; // after the loader
      if (el.dataset.focusifySettled) break; // released earlier: start counting fresh
      const blocked = el.dataset.focusifyBlocked === 'true' || el.dataset.focusifyShorts === 'true';
      if (!blocked) break;
      run++;
    }
    return run;
  }

  function pauseLoader(continuation, run) {
    if (continuation.dataset.focusifyPaused) return;
    continuation.dataset.focusifyPaused = 'true';
    continuation.classList.add('focusify-hidden');

    const notice = document.createElement('div');
    notice.className = 'focusify-feed-end';
    notice.innerHTML = `
      <span>Nothing new on your topic here. Filtered ${run} off-topic videos in a row.</span>
      <button type="button">Load more anyway</button>`;
    notice.querySelector('button').addEventListener('click', () => {
      // Forget the blocked run so far and let the loader work again.
      const scope = continuation.closest(PAGE_SCOPE_TAGS) || document;
      scope.querySelectorAll('[data-focusify-blocked], [data-focusify-shorts]').forEach(el => { el.dataset.focusifySettled = 'true'; });
      notice.remove();
      delete continuation.dataset.focusifyPaused;
      continuation.classList.remove('focusify-hidden');
    });
    continuation.parentNode.insertBefore(notice, continuation);
  }

  function checkFeedPatience() {
    const patience = Number(currentConfig.feedPatience);
    if (!patience) return;
    document.querySelectorAll(CONTINUATION_TAG).forEach(cont => {
      if (cont.dataset.focusifyPaused) return;
      const run = trailingBlockedRun(cont);
      if (run >= patience) pauseLoader(cont, run);
    });
  }

  function clearFeedPatience() {
    document.querySelectorAll('.focusify-feed-end').forEach(n => n.remove());
    document.querySelectorAll('[data-focusify-paused]').forEach(c => {
      delete c.dataset.focusifyPaused;
      c.classList.remove('focusify-hidden');
    });
    document.querySelectorAll('[data-focusify-settled]').forEach(el => { delete el.dataset.focusifySettled; });
  }

  // ---------- The video you are currently watching ----------
  const allowedVideoIds = new Set(); // "Watch anyway" choices for this tab session
  let guardToken = 0;

  function currentVideoId() {
    return location.pathname === '/watch' ? new URLSearchParams(location.search).get('v') : null;
  }

  function readWatchMetadata(id) {
    // YouTube swaps metadata in after navigation, so only trust it once it belongs to this video.
    const flexy = document.querySelector('ytd-watch-flexy');
    if (!flexy || flexy.getAttribute('video-id') !== id) return null;
    const title = (document.querySelector('ytd-watch-metadata h1')?.textContent || '').trim();
    const channel = (document.querySelector('ytd-watch-metadata #owner ytd-channel-name a, ytd-watch-metadata #owner #channel-name a')?.textContent || '').trim();
    return title ? { title, channel } : null;
  }

  function removeCurrentGuard() {
    document.getElementById('focusify-current-guard')?.remove();
  }

  function pauseCurrentVideo() {
    document.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { /* ignore */ } });
  }

  // Keep a blocked video paused even if YouTube's autoplay tries to start it.
  document.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO' && document.getElementById('focusify-current-guard')) e.target.pause();
  }, true);

  function showCurrentGuard(id, decision, title, channel) {
    removeCurrentGuard();
    const host = document.querySelector('#movie_player') || document.querySelector('#player');
    if (!host) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

    const guard = document.createElement('div');
    guard.id = 'focusify-current-guard';
    guard.innerHTML = `
      <div class="focusify-guard-card">
        <div class="focusify-guard-kicker">Focusify · off-topic video</div>
        <div class="focusify-guard-title">${escapeHtml(title)}</div>
        <div class="focusify-guard-reason">${escapeHtml(decision.reason || 'Doesn\'t match your focus topic')}</div>
        <div class="focusify-guard-actions">
          <button class="focusify-guard-back">← Go back</button>
          <button class="focusify-guard-allow">Watch anyway</button>
          ${channel ? '<button class="focusify-guard-chan">⭐ Always allow this channel</button>' : ''}
        </div>
      </div>`;

    guard.querySelector('.focusify-guard-back').addEventListener('click', () => {
      if (history.length > 1) history.back(); else location.assign('/');
    });
    guard.querySelector('.focusify-guard-allow').addEventListener('click', () => {
      allowedVideoIds.add(id);
      removeCurrentGuard();
      document.querySelector('video')?.play().catch(() => {});
    });
    const chanBtn = guard.querySelector('.focusify-guard-chan');
    if (chanBtn) {
      chanBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'MANAGE_CHANNEL', channel, type: 'whitelist' });
        allowedVideoIds.add(id);
        removeCurrentGuard();
        document.querySelector('video')?.play().catch(() => {});
      });
    }
    host.appendChild(guard);
    pauseCurrentVideo();
  }

  async function guardCurrentVideo(attempt = 0) {
    const token = ++guardToken;
    const id = currentVideoId();
    if (!id || !isActive || !currentConfig.filterCurrentVideo || breakActive || allowedVideoIds.has(id)) {
      removeCurrentGuard();
      return;
    }

    const meta = readWatchMetadata(id);
    if (!meta) {
      if (attempt < 20) setTimeout(() => { if (token === guardToken) guardCurrentVideo(attempt + 1); }, 300);
      return;
    }

    const { decision, fromCache } = await getDecision(meta.title, meta.channel, id);
    if (token !== guardToken) return; // navigated away meanwhile
    if (!fromCache) queueStat(decision, meta.title, meta.channel);

    // Never interrupt a video on a weak, AI-less guess; only on clear signals (blocked word/channel, or the AI).
    if (decision.allow || (decision.degraded && !decision.confident)) removeCurrentGuard();
    else showCurrentGuard(id, decision, meta.title, meta.channel);
  }

  function applyDecisionToElement(el, decision, title, channel) {
    el.classList.remove('focusify-hidden', 'focusify-blurred');
    if (decision.allow) delete el.dataset.focusifyBlocked;
    else el.dataset.focusifyBlocked = 'true';
    const existingOverlay = el.querySelector('.focusify-blur-overlay');
    if (existingOverlay) existingOverlay.remove();

    const existingBadge = el.querySelector('.focusify-card-badge');
    if (existingBadge) existingBadge.remove();

    const existingTakeaway = el.querySelector('.focusify-takeaway-btn');
    if (existingTakeaway) existingTakeaway.remove();

    // Anchor overlays to the thumbnail itself, never the whole card (which would put them over the channel name).
    const thumbContainer = el.querySelector('#thumbnail, ytd-thumbnail, yt-thumbnail-view-model, .yt-lockup-view-model-wiz__thumbnail, .yt-lockup-view-model__content-image')
      || el.querySelector('img')?.closest('a, yt-thumbnail-view-model, div')
      || el;
    if (getComputedStyle(thumbContainer).position === 'static') {
      thumbContainer.style.position = 'relative';
    }

    // Nested card elements can share one thumbnail; keep a single badge and chip.
    thumbContainer.querySelectorAll(':scope > .focusify-card-badge, :scope > .focusify-takeaway-btn').forEach(n => n.remove());

    // Visual Engine Badge
    if (currentConfig.showBadges && decision.engine !== 'none') {
      const badge = document.createElement('div');
      const isAI = decision.engine && decision.engine.includes('ai');
      const engineIcon = decision.engine === 'whitelist' ? '⭐ White' : (decision.engine === 'blacklist' ? '🚫 Black' : (isAI ? '🤖 AI' : '⚡ Logic'));
      badge.className = `focusify-card-badge ${decision.allow ? 'allowed' : 'blocked'}`;
      badge.innerHTML = `<span class="engine-icon">${engineIcon}</span> <span>${decision.score}%</span> <span>${decision.allow ? '✓' : '🚫'}</span>`;
      thumbContainer.appendChild(badge);
    }

    // Allowed Study Video: Inject AI Takeaways Chip
    if (decision.allow) {
      if (currentConfig.enableTakeaways && title) {
        const takeawayBtn = document.createElement('button');
        takeawayBtn.className = 'focusify-takeaway-btn';
        takeawayBtn.innerHTML = '💡 Takeaways';
        takeawayBtn.title = 'Hover or click to preview AI key takeaways (local Ollama)';
        
        // Hover handler (Preview)
        takeawayBtn.addEventListener('mouseenter', () => {
          if (!isModalPinned || activeTakeawaysContainer !== thumbContainer) {
            showTakeawaysModal(thumbContainer, title, channel, false);
          }
        });

        takeawayBtn.addEventListener('mouseleave', () => {
          if (!isModalPinned && activeTakeawaysContainer === thumbContainer) {
            closeActiveTakeawaysModal();
          }
        });

        // Click handler (Pin Modal)
        takeawayBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          showTakeawaysModal(thumbContainer, title, channel, true);
        });

        thumbContainer.appendChild(takeawayBtn);
      }
      return;
    }

    // Content Blocked!
    if (currentConfig.filterAction === 'blur') {
      el.classList.add('focusify-blurred');

      const isAI = decision.engine && decision.engine.includes('ai');
      const engineLabel = isAI ? `🤖 Ollama (${currentConfig.ollamaModel})` : '⚡ Logic Engine';

      const overlay = document.createElement('div');
      overlay.className = 'focusify-blur-overlay';
      overlay.innerHTML = `
        <div class="focusify-overlay-engine-chip ${isAI ? 'ai-chip' : ''}">${engineLabel}</div>
        <div class="focusify-overlay-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
          </svg>
          Focusify Filtered (${decision.score}%)
        </div>
        <div class="focusify-overlay-reason">${escapeHtml(decision.reason || 'Distraction filtered')}</div>
        <div class="focusify-overlay-actions">
          <button class="focusify-unblock-btn">Show Video</button>
          ${channel ? `<button class="focusify-chan-btn" title="Add channel to Whitelist">⭐ Allow Channel</button>` : ''}
        </div>
      `;

      const unblockBtn = overlay.querySelector('.focusify-unblock-btn');
      unblockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        unblockedElements.add(el);
        el.classList.remove('focusify-blurred');
        overlay.remove();
      });

      const chanBtn = overlay.querySelector('.focusify-chan-btn');
      if (chanBtn && channel) {
        chanBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          e.preventDefault();
          await chrome.runtime.sendMessage({ action: 'MANAGE_CHANNEL', channel, type: 'whitelist' });
          unblockedElements.add(el);
          el.classList.remove('focusify-blurred');
          overlay.remove();
          processPage();
        });
      }

      el.appendChild(overlay);
    } else {
      // Default: Complete Hide Mode
      el.classList.add('focusify-hidden');
    }
  }

  // Close any active takeaways modal popover
  function closeActiveTakeawaysModal() {
    if (activeTakeawaysModal) {
      activeTakeawaysModal.remove();
      activeTakeawaysModal = null;
      activeTakeawaysContainer = null;
      isModalPinned = false;
    }
  }

  // Show AI Key Takeaways Popover Modal (Single instance, hover or pin)
  async function showTakeawaysModal(container, title, channel, pin = false) {
    // Close previous modal if on a different video container
    if (activeTakeawaysContainer !== container) {
      closeActiveTakeawaysModal();
    }

    if (activeTakeawaysModal && isModalPinned && pin) {
      // Clicking pin again toggles off
      closeActiveTakeawaysModal();
      return;
    }

    if (activeTakeawaysModal && !isModalPinned && pin) {
      // Pin existing hover modal
      isModalPinned = true;
      activeTakeawaysModal.classList.add('pinned');
      return;
    }

    if (activeTakeawaysModal) return;

    isModalPinned = pin;
    activeTakeawaysContainer = container;


    const modal = document.createElement('div');
    modal.className = `focusify-takeaways-modal ${pin ? 'pinned' : ''}`;
    modal.innerHTML = `
      <div class="focusify-takeaways-header">
        <span>💡 AI Key Takeaways</span>
        <button class="focusify-takeaways-close" title="Close Takeaways">✕</button>
      </div>
      <div class="focusify-takeaways-body">Generating summary… ⏳</div>
    `;

    modal.querySelector('.focusify-takeaways-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeActiveTakeawaysModal();
    });

    modal.addEventListener('mouseleave', () => {
      if (!isModalPinned) {
        closeActiveTakeawaysModal();
      }
    });

    container.appendChild(modal);
    activeTakeawaysModal = modal;

    try {
      const res = await chrome.runtime.sendMessage({ action: 'GENERATE_TAKEAWAYS', title, channel });
      const bodyEl = modal.querySelector('.focusify-takeaways-body');
      if (bodyEl) {
        if (res && res.success && res.takeaways) {
          bodyEl.textContent = res.takeaways;
        } else {
          bodyEl.textContent = 'No summary available right now.';
        }
      }
    } catch (err) {
      const bodyEl = modal.querySelector('.focusify-takeaways-body');
      if (bodyEl) bodyEl.textContent = 'No summary available right now.';
    }
  }

  function removeAllBadgesAndOverlays() {
    closeActiveTakeawaysModal();
    document.querySelectorAll('.focusify-hidden, .focusify-blurred').forEach(el => {
      el.classList.remove('focusify-hidden', 'focusify-blurred');
    });
    document.querySelectorAll('.focusify-blur-overlay, .focusify-card-badge, .focusify-takeaway-btn').forEach(el => el.remove());
    unhideShorts();
    clearFeedPatience();
    document.querySelectorAll('[data-focusify-evaluated]').forEach(el => {
      delete el.dataset.focusifyEvaluated;
      delete el.dataset.focusifyConfigHash;
    });
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function injectHeaderBar() {
    if (document.getElementById('focusify-header-bar')) return;

    const targetContainer = document.querySelector('#masthead #end, #masthead #buttons, #masthead #start');
    if (!targetContainer) return;

    const modeLabel = { ai: '🤖 AI', hybrid: '🔥 Hybrid', logic: '⚡ Logic' }[currentConfig.mode] || '⚡ Logic';

    const bar = document.createElement('div');
    bar.id = 'focusify-header-bar';
    bar.title = 'Focusify YouTube Active. Click extension icon to configure.';
    bar.innerHTML = `
      <span class="focusify-status-dot"></span>
      <span class="focusify-engine-tag">${modeLabel}</span>
      <span>Focus:</span>
      <span class="focusify-genre-pill">${escapeHtml(currentConfig.focusGenre || 'No topic set')}</span>
      <span class="focusify-blocked-chip" id="focusify-header-blocked-count">0 Blocked</span>
    `;

    targetContainer.prepend(bar);
    updateHeaderStats();
  }

  function removeHeaderBar() {
    const bar = document.getElementById('focusify-header-bar');
    if (bar) bar.remove();
  }

  async function updateHeaderStats() {
    try {
      const stats = await chrome.storage.local.get(['blockedCount']);
      const countEl = document.getElementById('focusify-header-blocked-count');
      if (countEl) {
        const count = stats.blockedCount || 0;
        countEl.textContent = `${count} Blocked`;
      }
    } catch (err) {
      // Ignore if context invalidated
    }
  }

  function listenForStorageChanges() {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.pomodoroState) {
        refreshBreakState().then(() => { setGate(isActive); processPage(); });
      }
      if (namespace === 'sync') {
        loadConfig().then(cfg => {
          currentConfig = cfg;
          applyConfigChange();
          // Activated from a dormant start (init returned early): register navigation handling now.
        });
      }
    });
  }

  init();
})();
