/**
 * Single source of truth for Focusify configuration defaults.
 * Loaded by the service worker (importScripts) and the content script.
 */
const FOCUSIFY_DEFAULTS = {
  enabled: true,
  mode: 'hybrid', // 'logic' | 'ai' | 'hybrid'
  focusGenre: '', // set by the user; empty means "no topic yet"
  positiveKeywords: '',
  negativeKeywords: 'vlog, gaming, prank, reaction, drama, compilation, unboxing, music video',
  // Words that signal learning content in any field. Editable data, not engine logic.
  educationalSignals: 'tutorial, lecture, course, guide, explained, explanation, lesson, walkthrough, introduction, concepts',
  // Title phrases that mark hype/clickbait.
  clickbaitPhrases: "you won't believe, i spent 24 hours, gone wrong, exposed, what happens if, omg",
  whitelistedChannels: '',
  blacklistedChannels: '',
  threshold: 40,
  blockClickbait: true,
  blockShorts: true,
  filterCurrentVideo: true, // also check the video you are watching, not just the feeds
  showBadges: false, // debug UI (badges + header bar) is opt-in so the filter stays invisible
  enableTakeaways: true,
  filterAction: 'hide', // 'hide' | 'blur'
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'llama3.2:3b',
  aiTimeoutMs: 3500,
  pomodoroFocusMin: 25,
  pomodoroBreakMin: 5,
  pomodoroLock: false,
  // Activation: 'on' = always filter, 'auto' = follow the schedule, 'off' = never.
  focusState: 'on',
  scheduleDays: [1, 2, 3, 4, 5], // 0 = Sunday
  scheduleStart: '09:00',
  scheduleEnd: '18:00',
  feedPatience: 40, // pause infinite scroll after this many filtered videos in a row (0 = never)
  // Streaming-site blocking (opt-in). Follows the same mode, schedule and pause as the YouTube filter.
  blockSites: false,
  unblockedSiteIds: [], // preset sites the user turned off; empty means all presets are blocked
  customBlockedDomains: '', // extra hostnames, comma or newline separated
  siteUnlockDelaySec: 10, // wait before the blocked page offers a 15-minute pause
  pausedUntil: 0 // epoch ms; filtering is suspended until then
};

// Every key that can change a classification result. Used to invalidate caches.
const FOCUSIFY_SCORING_KEYS = [
  'enabled', 'mode', 'focusGenre', 'positiveKeywords', 'negativeKeywords', 'educationalSignals', 'clickbaitPhrases',
  'whitelistedChannels', 'blacklistedChannels', 'threshold', 'blockClickbait',
  'blockShorts', 'filterCurrentVideo', 'filterAction', 'ollamaModel', 'ollamaEndpoint'
];

function focusifyConfigHash(config) {
  const str = FOCUSIFY_SCORING_KEYS.map(k => `${k}=${config[k]}`).join('|');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function focusifyMinutes(hhmm) {
  const [h, m] = String(hhmm || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function focusifyInSchedule(config, now = new Date()) {
  const days = Array.isArray(config.scheduleDays) ? config.scheduleDays : [];
  const start = focusifyMinutes(config.scheduleStart);
  const end = focusifyMinutes(config.scheduleEnd);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start === end) return days.includes(now.getDay()); // whole day
  if (start < end) return days.includes(now.getDay()) && cur >= start && cur < end;
  // Overnight window (e.g. 22:00-02:00): the after-midnight part belongs to the previous day's window.
  if (cur >= start) return days.includes(now.getDay());
  if (cur < end) return days.includes((now.getDay() + 6) % 7);
  return false;
}

/** Whether filtering should be applied right now (master switch, pause, and mode). */
function focusifyIsActive(config, nowMs = Date.now()) {
  if (!config.enabled) return false;
  if (config.pausedUntil && nowMs < config.pausedUntil) return false;
  if (config.focusState === 'off') return false;
  if (config.focusState === 'auto') return focusifyInSchedule(config, new Date(nowMs));
  return true;
}

function focusifyDefaultPomodoro() {
  return { active: false, mode: 'focus', remainingSec: FOCUSIFY_DEFAULTS.pomodoroFocusMin * 60, lockSettings: false };
}

globalThis.focusifyDefaultPomodoro = focusifyDefaultPomodoro;
globalThis.focusifyIsActive = focusifyIsActive;
globalThis.FOCUSIFY_DEFAULTS = FOCUSIFY_DEFAULTS;
globalThis.focusifyConfigHash = focusifyConfigHash;
