# Chrome Web Store listing

**Name**: Focusify: Distraction-Free YouTube
**Tagline**: Study topic in. Distractions out.
**Category**: Productivity

## Description

Focusify keeps YouTube on your topic. Tell it what you're studying or working on, and it hides recommendations that don't fit, so you can open YouTube without losing an hour.

- **Topic-driven.** Set your focus topic, boost keywords and block words. Nothing is preset for you.
- **Invisible.** Videos stay hidden until they're checked, so distractions never flash on screen.
- **Always, scheduled or off.** Run it all the time, only during work hours, or pause for 15 minutes with one click.
- **No Shorts.** Hides Shorts shelves and sends Shorts links to the normal player.
- **Streaming-site blocker.** One switch blocks Netflix, Prime Video, JioHotstar, Disney+ and more (or any site you add) while you focus.
- **Optional local AI.** Borderline videos can be double-checked by a model running on your own computer with Ollama. It works fine without it.
- **In your control.** Channel allow and block lists, hide or blur, a Pomodoro timer that relaxes filters on breaks, and a log of what was blocked and why.
- **Private.** No account, no analytics, no servers.

## Permission justifications

| Permission | Why |
|---|---|
| `storage` | Saves your settings, statistics and cached decisions on your device. |
| `declarativeNetRequest` | (1) Removes the `Origin` header from the extension's own requests to your local Ollama server. (2) Blocks or redirects navigation to the streaming sites the user chose, when the site blocker is enabled. |
| `alarms` | Re-checks once a minute whether the user's focus schedule or pause has started or ended, so site blocking turns on and off on time. |
| Optional host access (`*://*/*`) | **Not granted at install.** Requested only when the user turns on site blocking, for the specific sites listed, so Focusify can redirect them to its own page instead of a browser error. The user can decline and blocking still works. Never used to read page content. |
| `web_accessible_resources` (`blocked/*`) | Lets the browser open Focusify's "blocked" page when a chosen site is redirected. The page contains no user data. |
| `https://www.youtube.com/*` | Reads video titles and channel names on YouTube pages and hides the ones that don't match your topic. |
| `http://localhost:11434/*`, `http://127.0.0.1:11434/*` | Talks to your local Ollama server, only when you use an AI mode. |

## Privacy

- Focusify collects no personal data and sends nothing to any server operated by the developer or a third party.
- Settings and statistics are stored locally in Chrome storage.
- If you enable an AI mode, video titles and channel names are sent only to the Ollama endpoint you configure (default: your own computer).

## Publishing

```bash
npm test
npm run build   # dist/focusify-yt-v<version>.zip
```

The same zip is attached to each GitHub Release. Upload it in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), add at least one 1280×800 screenshot, link the hosted privacy policy (`docs/privacy-policy.md` on GitHub, or GitHub Pages), and submit.
