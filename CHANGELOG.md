# Changelog

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
