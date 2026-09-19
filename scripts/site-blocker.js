/**
 * Streaming-site blocker (service worker side).
 *
 * Keeps declarativeNetRequest dynamic rules in sync with the settings:
 *  - sites the user has granted access to are redirected to a friendly Focusify page
 *  - other sites get a plain "block" rule (browser error page) so blocking works without any permission
 * Rules only exist while blocking is active (feature on, mode/schedule/pause allow it, not on a break).
 */
const BLOCK_PAGE_PATH = 'blocked/blocked.html';
const SYNC_ALARM = 'focusify-sync';
const REDIRECT_RULE_ID = 2001;
const BLOCK_RULE_ID = 2002;
const HOST_REGEX = '^https?://([^/:?#]+)';

let syncChain = Promise.resolve();
let lastSignature = null;

function originPattern(domain) {
  return `*://*.${domain}/*`;
}

function isGranted(grantedOrigins, domain) {
  return grantedOrigins.includes('<all_urls>') || grantedOrigins.includes('*://*/*') ||
    grantedOrigins.includes(originPattern(domain));
}

async function readBlockState() {
  const config = { ...FOCUSIFY_DEFAULTS, ...(await chrome.storage.sync.get(null)) };
  const { pomodoroState } = await chrome.storage.local.get(['pomodoroState']);
  const onBreak = Boolean(pomodoroState && pomodoroState.active && pomodoroState.mode === 'break');
  const active = Boolean(config.blockSites) && focusifyIsActive(config) && !onBreak;
  return { active, domains: active ? focusifyBlockedDomains(config) : [] };
}

async function applySiteRules() {
  const { active, domains } = await readBlockState();
  const { origins = [] } = await chrome.permissions.getAll();
  const friendly = domains.filter(d => isGranted(origins, d));
  const plain = domains.filter(d => !friendly.includes(d));

  const signature = JSON.stringify([friendly, plain]);
  if (signature !== lastSignature) {
    const pageUrl = chrome.runtime.getURL(BLOCK_PAGE_PATH);
    const addRules = [];
    if (friendly.length) {
      addRules.push({
        id: REDIRECT_RULE_ID,
        priority: 1,
        action: { type: 'redirect', redirect: { regexSubstitution: `${pageUrl}?host=\\1` } },
        condition: { regexFilter: HOST_REGEX, requestDomains: friendly, resourceTypes: ['main_frame'] }
      });
    }
    if (plain.length) {
      addRules.push({
        id: BLOCK_RULE_ID,
        priority: 1,
        action: { type: 'block' },
        condition: { requestDomains: plain, resourceTypes: ['main_frame'] }
      });
    }
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(r => r.id),
      addRules
    });
    lastSignature = signature;
  }

  // When blocking switches on, move already-open tabs of those sites to the blocked page too.
  const { sitesActive } = await chrome.storage.local.get(['sitesActive']);
  if (Boolean(sitesActive) !== active) {
    await chrome.storage.local.set({ sitesActive: active });
    if (active && friendly.length) await redirectOpenTabs(friendly);
  }
}

async function redirectOpenTabs(domains) {
  try {
    const tabs = await chrome.tabs.query({ url: domains.map(originPattern) });
    for (const tab of tabs) {
      let host = '';
      try { host = new URL(tab.url).hostname; } catch (e) { continue; }
      await chrome.tabs.update(tab.id, { url: `${chrome.runtime.getURL(BLOCK_PAGE_PATH)}?host=${encodeURIComponent(host)}` });
    }
  } catch (err) {
    console.warn('[Focusify] Could not redirect open tabs:', err);
  }
}

// Serialize syncs so overlapping triggers can't interleave rule updates.
function syncSiteRules() {
  syncChain = syncChain.then(applySiteRules).catch(err => console.error('[Focusify] Site rule sync failed:', err));
  return syncChain;
}

// Listeners must be registered synchronously at worker start.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' || (area === 'local' && changes.pomodoroState)) syncSiteRules();
});
chrome.permissions.onAdded.addListener(() => { lastSignature = null; syncSiteRules(); });
chrome.permissions.onRemoved.addListener(() => { lastSignature = null; syncSiteRules(); });
chrome.alarms.onAlarm.addListener((alarm) => { if (alarm.name === SYNC_ALARM) syncSiteRules(); });
chrome.runtime.onInstalled.addListener(() => syncSiteRules());
chrome.runtime.onStartup.addListener(() => syncSiteRules());

// A once-a-minute tick catches schedule boundaries and the end of a pause.
chrome.alarms.create(SYNC_ALARM, { periodInMinutes: 1 });
syncSiteRules();
