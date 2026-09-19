const test = require('node:test');
const assert = require('node:assert/strict');

require('../scripts/defaults.js');
const Engine = require('../scripts/logic-engine.js');

const D = globalThis.FOCUSIFY_DEFAULTS;
const cfg = (over = {}) => ({ ...D, ...over });

const cooking = cfg({
  focusGenre: 'Italian Pasta & Culinary Techniques',
  positiveKeywords: 'recipe, pasta, sauce, cooking, carbonara',
  whitelistedChannels: 'Italia Squisita',
  blacklistedChannels: 'Prankster Channel'
});

test('whitelisted channel always passes', () => {
  const r = Engine.evaluate('Anything at all', 'Italia Squisita', cooking);
  assert.equal(r.allow, true);
  assert.equal(r.engine, 'whitelist');
});

test('blacklisted channel always blocked', () => {
  const r = Engine.evaluate('Nice pasta recipe', 'Prankster Channel', cooking);
  assert.equal(r.allow, false);
  assert.equal(r.engine, 'blacklist');
});

test('negative keyword blocks', () => {
  const r = Engine.evaluate('Minecraft gaming marathon', 'GamerX', cooking);
  assert.equal(r.allow, false);
  assert.deepEqual(r.negativeMatches, ['gaming']);
});

test('focus topic and positive keywords raise the score', () => {
  const match = Engine.evaluate('Handmade pasta sauce recipe', 'Chef', cooking);
  const plain = Engine.evaluate('Handmade something', 'Chef', cooking);
  assert.ok(match.score > plain.score);
  assert.equal(match.allow, true);
});

test('works for any topic: no built-in domain bias', () => {
  const chem = cfg({ focusGenre: 'Organic Chemistry', positiveKeywords: 'reaction mechanism, synthesis' });
  assert.ok(Engine.evaluate('Organic Chemistry: SN2 explained', 'Prof', chem).score >=
            Engine.evaluate('Random title', 'Prof', chem).score);
  // A coding word gets no special treatment unless the user's config says so.
  const noBoost = Engine.evaluate('React hooks course', 'Dev', cfg({ focusGenre: 'Cooking', educationalSignals: '' }));
  assert.equal(noBoost.score, 45);
});

test('educational signals are data-driven', () => {
  const withSignal = Engine.evaluate('Origami lesson', 'X', cfg({ focusGenre: 'Origami paper folding', educationalSignals: 'lesson' }));
  const without = Engine.evaluate('Origami lesson', 'X', cfg({ focusGenre: 'Origami paper folding', educationalSignals: '' }));
  assert.ok(withSignal.reason.includes('Educational'));
  assert.ok(!without.reason.includes('Educational'));
});

test('clickbait phrases come from config and can be disabled', () => {
  const title = 'What happens if you try this';
  const on = Engine.evaluate(title, 'X', cfg({ focusGenre: 'Cooking' }));
  const off = Engine.evaluate(title, 'X', cfg({ focusGenre: 'Cooking', blockClickbait: false }));
  const custom = Engine.evaluate('totally normal title', 'X', cfg({ focusGenre: 'Cooking', clickbaitPhrases: 'normal title' }));
  assert.ok(on.score < off.score);
  assert.ok(custom.reason.includes('Clickbait'));
});

test('empty config does not invent a topic', () => {
  const r = Engine.evaluate('Some video', 'Some channel', cfg({ negativeKeywords: '' }));
  assert.equal(r.allow, true);
});

test('empty metadata is allowed', () => {
  assert.equal(Engine.evaluate('', '', D).allow, true);
});

test('config hash tracks scoring settings only', () => {
  const base = focusifyConfigHash(D);
  assert.notEqual(base, focusifyConfigHash(cfg({ positiveKeywords: 'x' })));
  assert.notEqual(base, focusifyConfigHash(cfg({ educationalSignals: 'x' })));
  assert.equal(base, focusifyConfigHash(cfg({ showBadges: true, pausedUntil: 5 })));
});

test('schedule: weekday window, weekends and overnight', () => {
  const auto = cfg({ focusState: 'auto' });
  const at = (c, d, h, m = 0) => focusifyIsActive(c, new Date(2026, 8, d, h, m).getTime()); // Sep 21 2026 is a Monday
  assert.equal(at(auto, 21, 10), true);
  assert.equal(at(auto, 21, 19), false);
  assert.equal(at(auto, 20, 10), false);
  const night = cfg({ focusState: 'auto', scheduleStart: '22:00', scheduleEnd: '02:00' });
  assert.equal(at(night, 21, 23), true);
  assert.equal(at(night, 22, 1), true);
  assert.equal(at(night, 20, 1), false); // Saturday's window isn't in scheduleDays
});

test('activation: master switch, off, pause', () => {
  const now = Date.now();
  assert.equal(focusifyIsActive(cfg(), now), true);
  assert.equal(focusifyIsActive(cfg({ enabled: false }), now), false);
  assert.equal(focusifyIsActive(cfg({ focusState: 'off' }), now), false);
  assert.equal(focusifyIsActive(cfg({ pausedUntil: now + 1000 }), now), false);
  assert.equal(focusifyIsActive(cfg({ pausedUntil: now - 1000 }), now), true);
});

test('presets are well-formed data', () => {
  require('../scripts/presets.js');
  const ids = new Set();
  for (const p of globalThis.FOCUSIFY_PRESETS) {
    assert.ok(p.id && p.label && p.genre && p.positive && p.negative);
    assert.ok(!ids.has(p.id)); ids.add(p.id);
  }
});

test('package.json and manifest.json versions stay in sync', () => {
  const pkg = require('../package.json');
  const manifest = require('../manifest.json');
  assert.equal(pkg.version, manifest.version);
});
