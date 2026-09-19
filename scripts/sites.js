/**
 * Streaming / OTT site blocking: preset list (pure data) and domain helpers.
 * Loaded by the service worker, the popup and the blocked page.
 */
const FOCUSIFY_SITE_PRESETS = [
  { id: 'netflix', name: 'Netflix', domains: ['netflix.com'] },
  { id: 'prime', name: 'Prime Video', domains: ['primevideo.com'] },
  { id: 'hotstar', name: 'JioHotstar', domains: ['hotstar.com', 'jiohotstar.com', 'jiocinema.com'] },
  { id: 'disney', name: 'Disney+', domains: ['disneyplus.com'] },
  { id: 'hulu', name: 'Hulu', domains: ['hulu.com'] },
  { id: 'max', name: 'Max', domains: ['max.com', 'hbomax.com'] },
  { id: 'peacock', name: 'Peacock', domains: ['peacocktv.com'] },
  { id: 'paramount', name: 'Paramount+', domains: ['paramountplus.com'] },
  { id: 'appletv', name: 'Apple TV+', domains: ['tv.apple.com'] },
  { id: 'sonyliv', name: 'SonyLIV', domains: ['sonyliv.com'] },
  { id: 'zee5', name: 'ZEE5', domains: ['zee5.com'] },
  { id: 'mxplayer', name: 'MX Player', domains: ['mxplayer.in'] },
  { id: 'crunchyroll', name: 'Crunchyroll', domains: ['crunchyroll.com'] },
  { id: 'discovery', name: 'discovery+', domains: ['discoveryplus.com'] }
];

/** Accepts "https://www.Example.com/path", "example.com", etc. Returns a bare hostname or ''. */
function focusifyNormalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '').replace(/^www\./, '');
  s = s.split(/[\/?#:]/)[0];
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(s) ? s : '';
}

/** Splits on commas, spaces and new lines; drops anything that isn't a valid hostname. */
function focusifyParseDomainList(text) {
  const parts = Array.isArray(text) ? text : String(text || '').split(/[\s,]+/);
  return [...new Set(parts.map(focusifyNormalizeDomain).filter(Boolean))];
}

/** Every domain that should currently be blocked, given the config (ignores schedule/pause). */
function focusifyBlockedDomains(config) {
  const off = new Set(Array.isArray(config.unblockedSiteIds) ? config.unblockedSiteIds : []);
  const fromPresets = FOCUSIFY_SITE_PRESETS.filter(p => !off.has(p.id)).flatMap(p => p.domains);
  return [...new Set([...fromPresets, ...focusifyParseDomainList(config.customBlockedDomains)])];
}

/** True when `host` is one of `domains` or a subdomain of one. */
function focusifyHostMatches(host, domains) {
  const h = String(host || '').toLowerCase();
  return domains.some(d => h === d || h.endsWith('.' + d));
}

globalThis.FOCUSIFY_SITE_PRESETS = FOCUSIFY_SITE_PRESETS;
globalThis.focusifyNormalizeDomain = focusifyNormalizeDomain;
globalThis.focusifyParseDomainList = focusifyParseDomainList;
globalThis.focusifyBlockedDomains = focusifyBlockedDomains;
globalThis.focusifyHostMatches = focusifyHostMatches;
