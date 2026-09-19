const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const read = f => fs.readFileSync(path.join(__dirname, '..', 'scripts', f), 'utf8');

// Runs the real site-blocker.js against a fake chrome API and returns what it did.
async function run({ sync = {}, local = {}, granted = [], openTabs = [] } = {}) {
  const calls = { rules: null, tabUpdates: [], queried: null };
  const listeners = {};
  const store = { sync: { ...sync }, local: { ...local } };
  const on = name => ({ addListener: fn => { listeners[name] = fn; } });
  const chrome = {
    storage: {
      sync: { get: async () => ({ ...store.sync }) },
      local: { get: async () => ({ ...store.local }), set: async o => Object.assign(store.local, o) },
      onChanged: on('storage')
    },
    permissions: { getAll: async () => ({ origins: granted }), onAdded: on('permAdded'), onRemoved: on('permRemoved') },
    declarativeNetRequest: {
      getDynamicRules: async () => [{ id: 9 }],
      updateDynamicRules: async o => { calls.rules = o; }
    },
    tabs: {
      query: async q => { calls.queried = q; return openTabs; },
      update: async (id, props) => { calls.tabUpdates.push({ id, ...props }); }
    },
    alarms: { create() {}, onAlarm: on('alarm') },
    runtime: { getURL: p => `chrome-extension://abc/${p}`, onInstalled: on('installed'), onStartup: on('startup') }
  };
  const ctx = vm.createContext({ chrome, console, URL });
  ctx.globalThis = ctx;
  for (const f of ['defaults.js', 'sites.js', 'site-blocker.js']) vm.runInContext(read(f), ctx);
  await new Promise(r => setTimeout(r, 30));
  return { calls, store };
}

// Objects made inside the vm sandbox have foreign prototypes, so compare by JSON.
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

const ruleFor = (calls, id) => calls.rules.addRules.find(r => r.id === id);

test('feature off: no rules', async () => {
  const { calls } = await run({ sync: { blockSites: false } });
  same(calls.rules.addRules, []);
  same(calls.rules.removeRuleIds, [9]); // clears whatever was there
});

test('on, no permission: plain block rule for every preset domain', async () => {
  const { calls } = await run({ sync: { blockSites: true } });
  const block = ruleFor(calls, 2002);
  assert.equal(block.action.type, 'block');
  assert.ok(block.condition.requestDomains.includes('netflix.com'));
  same(block.condition.resourceTypes, ['main_frame']);
  assert.equal(ruleFor(calls, 2001), undefined);
});

test('on with access granted: friendly redirect for granted sites, block for the rest', async () => {
  const { calls } = await run({ sync: { blockSites: true }, granted: ['*://*.netflix.com/*'] });
  const redirect = ruleFor(calls, 2001);
  assert.equal(redirect.action.type, 'redirect');
  same(redirect.condition.requestDomains, ['netflix.com']);
  assert.match(redirect.action.redirect.regexSubstitution, /^chrome-extension:\/\/abc\/blocked\/blocked\.html\?host=\\1$/);
  assert.ok(ruleFor(calls, 2002).condition.requestDomains.includes('primevideo.com'));
  assert.ok(!ruleFor(calls, 2002).condition.requestDomains.includes('netflix.com'));
});

test('blanket access grants friendly page for every site, including custom', async () => {
  const { calls } = await run({ sync: { blockSites: true, customBlockedDomains: 'foo.tv' }, granted: ['*://*/*'] });
  assert.ok(ruleFor(calls, 2001).condition.requestDomains.includes('foo.tv'));
  assert.equal(ruleFor(calls, 2002), undefined);
});

test('opted-out presets are not blocked', async () => {
  const { calls } = await run({ sync: { blockSites: true, unblockedSiteIds: ['netflix'] } });
  assert.ok(!ruleFor(calls, 2002).condition.requestDomains.includes('netflix.com'));
});

test('inactive states clear the rules: paused, Off, master switch, break', async () => {
  for (const sync of [
    { blockSites: true, pausedUntil: Date.now() + 60000 },
    { blockSites: true, focusState: 'off' },
    { blockSites: true, enabled: false }
  ]) {
    const { calls } = await run({ sync });
    same(calls.rules.addRules, [], JSON.stringify(sync));
  }
  const { calls } = await run({ sync: { blockSites: true }, local: { pomodoroState: { active: true, mode: 'break' } } });
  same(calls.rules.addRules, []);
});

test('schedule outside hours means no blocking', async () => {
  // Always-empty window on no days
  const { calls } = await run({ sync: { blockSites: true, focusState: 'auto', scheduleDays: [] } });
  same(calls.rules.addRules, []);
});

test('turning blocking on redirects already-open tabs of granted sites', async () => {
  const { calls, store } = await run({
    sync: { blockSites: true }, granted: ['*://*.netflix.com/*'],
    openTabs: [{ id: 7, url: 'https://www.netflix.com/browse' }]
  });
  same(calls.queried, { url: ['*://*.netflix.com/*'] });
  assert.equal(calls.tabUpdates.length, 1);
  assert.match(calls.tabUpdates[0].url, /blocked\.html\?host=www\.netflix\.com$/);
  assert.equal(store.local.sitesActive, true);
});

test('does not re-redirect tabs when already active', async () => {
  const { calls } = await run({
    sync: { blockSites: true }, granted: ['*://*.netflix.com/*'], local: { sitesActive: true },
    openTabs: [{ id: 7, url: 'https://www.netflix.com/browse' }]
  });
  assert.equal(calls.tabUpdates.length, 0);
});
