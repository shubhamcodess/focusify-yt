# Changelog

## 1.2.1

- Automatic fallback when Ollama is down: 60-second circuit breaker, popup notice, and stem-based topic matching in the built-in engine.
- The off-topic prompt on a video page only appears for clear signals, not weak AI-less guesses.
- New Filter style setting: Strict (default) or Discover (threshold applies, AI accepts related and adjacent topics).
- Takeaways chip moved to the thumbnail's top-right corner; duplicate chips fixed.
- Popup shows the installed version.
- Channel names are read from more card layouts.

## 1.2.0

- Streaming-site blocker: one switch blocks Netflix, Prime Video, JioHotstar, Disney+, Hulu, Max and more, with per-site toggles and custom domains.
- Follows the same Always / Schedule / Off, pause and Pomodoro-break logic as the YouTube filter.
- Friendly blocked page with a short wait before the 15-minute pause. Works without extra permission (plain block) and upgrades to the friendly page when the optional access is granted.
- New `alarms` permission (schedule boundaries) and optional site access requested only when the feature is turned on.

## 1.1.0

- Zero-flash filtering: videos stay hidden until they are scored.
- Filter modes: Always, Schedule (with overnight windows) or Off, plus "Pause 15 min".
- Structural Shorts blocking for search, home and sidebar, and `/shorts/` links open in the normal player.
- Guard for the video you're watching (Go back / Watch anyway / Always allow this channel).
- Feed patience: pauses endless scrolling when a feed only returns off-topic videos.
- Faster classification: local logic first, parallel scoring, persistent AI decision cache, batched stats.
- Topic-neutral engine: word lists moved to editable data; presets are generated from `scripts/presets.js`.
- Redesigned popup with light and dark themes.
- Removed Gemini Nano support (the Prompt API isn't available in extension service workers). Ollama is the only AI option.
- Added tests, CI and release workflows.
