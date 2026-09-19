/**
 * FocusifyLogicEngine - Pure Logic Video Classification Engine
 * Contains no topic- or domain-specific vocabulary: every word list (focus topic, keywords,
 * educational signals, clickbait phrases, channel lists) comes from the config.
 */
class FocusifyLogicEngine {
  /**
   * Evaluates a video title & channel name against user settings.
   * @param {string} title 
   * @param {string} channel 
   * @param {Object} config 
   * @returns {Object} { score: number, allow: boolean, reason: string, engine: 'logic', positiveMatches: string[], negativeMatches: string[] }
   */
  static evaluate(title = '', channel = '', config = {}) {
    const focusGenre = (config.focusGenre || '').trim();
    const positiveKeywords = this.normalizeList(config.positiveKeywords);
    const negativeKeywords = this.normalizeList(config.negativeKeywords);
    const whitelistedChannels = this.normalizeList(config.whitelistedChannels);
    const blacklistedChannels = this.normalizeList(config.blacklistedChannels);
    const threshold = Number(config.threshold ?? 40); // Balanced default threshold (40%)
    const blockClickbait = Boolean(config.blockClickbait ?? true);
    const educationalSignals = this.normalizeList(config.educationalSignals);
    const clickbaitPhrases = this.normalizeList(config.clickbaitPhrases);

    const cleanTitle = title.toLowerCase().trim();
    const cleanChannel = channel.toLowerCase().trim();

    if (!cleanTitle && !cleanChannel) {
      return { score: 50, allow: true, reason: 'Empty video metadata', engine: 'logic', positiveMatches: [], negativeMatches: [] };
    }

    // 0. User Channel Whitelist & Blacklist Priority Checks
    if (cleanChannel) {
      for (const wChan of whitelistedChannels) {
        if (wChan && (cleanChannel.includes(wChan) || wChan.includes(cleanChannel))) {
          return {
            score: 100,
            allow: true,
            reason: `Channel "${channel}" is on your Whitelist ⭐`,
            engine: 'whitelist',
            positiveMatches: [wChan],
            negativeMatches: []
          };
        }
      }

      for (const bChan of blacklistedChannels) {
        if (bChan && (cleanChannel.includes(bChan) || bChan.includes(cleanChannel))) {
          return {
            score: 0,
            allow: false,
            reason: `Channel "${channel}" is on your Blacklist 🚫`,
            engine: 'blacklist',
            positiveMatches: [],
            negativeMatches: [bChan]
          };
        }
      }
    }

    const positiveMatches = [];
    const negativeMatches = [];
    const reasonParts = [];

    // 1. User Negative Keyword Match (Immediate Penalty)
    for (const neg of negativeKeywords) {
      if (!neg) continue;
      if (this.containsKeyword(cleanTitle, neg) || this.containsKeyword(cleanChannel, neg)) {
        negativeMatches.push(neg);
      }
    }

    if (negativeMatches.length > 0) {
      const penalty = Math.min(100, negativeMatches.length * 45);
      reasonParts.push(`Blocked by distraction tag "${negativeMatches.join(', ')}" (-${penalty})`);
      return {
        score: Math.max(0, 50 - penalty),
        allow: false,
        reason: reasonParts.join('. '),
        engine: 'logic',
        positiveMatches: [],
        negativeMatches
      };
    }

    // 2. User Focus Genre & Positive Keyword Matching
    let genreHits = 0;
    let exactGenreMatch = false;

    if (focusGenre) {
      if (cleanTitle.includes(focusGenre.toLowerCase())) {
        exactGenreMatch = true;
      } else {
        const genreTokens = this.tokenize(focusGenre);
        for (const token of genreTokens) {
          if (token.length > 2 && this.containsKeyword(cleanTitle, token)) {
            genreHits++;
          }
        }
      }
    }

    for (const pos of positiveKeywords) {
      if (!pos) continue;
      if (this.containsKeyword(cleanTitle, pos) || this.containsKeyword(cleanChannel, pos)) {
        positiveMatches.push(pos);
      }
    }

    // Domain-neutral "this looks like learning content" signals (configurable).
    let generalTechHits = 0;
    for (const tok of educationalSignals) {
      if (this.containsKeyword(cleanTitle, tok)) {
        generalTechHits++;
      }
    }

    const hasUserFocusConfig = Boolean(focusGenre || positiveKeywords.length > 0);
    const totalPositiveHits = (exactGenreMatch ? 3 : genreHits) + positiveMatches.length;

    // 3. Balanced Baseline Scoring:
    // If no direct distraction/negative keyword matched, default baseline is 50.
    // General tech/educational content gets a boost to ensure relevance.
    let score = 50;
    if (hasUserFocusConfig && totalPositiveHits === 0 && generalTechHits === 0) {
      score = 45; // Clean general content baseline
      reasonParts.push(`General content`);
    } else if (generalTechHits > 0) {
      score = 60; // Educational signal present
      reasonParts.push(`Educational content detected (+10)`);
    }

    // Apply User Boosts
    if (exactGenreMatch) {
      score += 40;
      reasonParts.push(`Exact focus topic match: "${focusGenre}" (+40)`);
    } else if (genreHits > 0) {
      const boost = Math.min(35, genreHits * 15);
      score += boost;
      reasonParts.push(`Matched ${genreHits} focus topic word(s) (+${boost})`);
    }

    if (positiveMatches.length > 0) {
      const boost = Math.min(35, positiveMatches.length * 12);
      score += boost;
      reasonParts.push(`Matched positive tag(s): "${positiveMatches.join(', ')}" (+${boost})`);
    }

    // 4. Clickbait Pattern Penalty (if enabled and NOT tech/educational)
    if (blockClickbait && generalTechHits === 0) {
      let clickbaitScore = 0;
      const letters = title.replace(/[^a-zA-Z]/g, '');
      if (letters.length > 8) {
        const caps = title.replace(/[^A-Z]/g, '').length;
        if (caps / letters.length > 0.6) {
          clickbaitScore += 15;
        }
      }
      if (/!{3,}|\?{3,}/.test(title)) {
        clickbaitScore += 15;
      }
      for (const phrase of clickbaitPhrases) {
        if (cleanTitle.includes(phrase)) {
          clickbaitScore += 20;
        }
      }

      if (clickbaitScore > 0) {
        score -= clickbaitScore;
        reasonParts.push(`Clickbait / hype pattern penalized (-${clickbaitScore})`);
      }
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    const allow = finalScore >= threshold;

    return {
      score: finalScore,
      allow,
      reason: reasonParts.join('. ') || (allow ? 'Sufficient relevance score' : 'Low relevance score'),
      engine: 'logic',
      positiveMatches,
      negativeMatches
    };
  }

  static normalizeList(input) {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.map(s => String(s).toLowerCase().trim()).filter(Boolean);
    }
    if (typeof input === 'string') {
      return input.split(',').map(s => s.toLowerCase().trim()).filter(Boolean);
    }
    return [];
  }

  static containsKeyword(text, keyword) {
    if (!text || !keyword) return false;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9])${escaped}(?:$|\\s|[^a-zA-Z0-9])`, 'i');
    return regex.test(text);
  }

  static tokenize(text) {
    return text.toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length > 2);
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.FocusifyLogicEngine = FocusifyLogicEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FocusifyLogicEngine;
}
