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
- **Optional local AI.** Borderline videos can be double-checked by a model running on your own computer with Ollama. It works fine without it.
- **In your control.** Channel allow and block lists, hide or blur, a Pomodoro timer that relaxes filters on breaks, and a log of what was blocked and why.
- **Private.** No account, no analytics, no servers.

## Permission justifications

| Permission | Why |
|---|---|
| `storage` | Saves your settings, statistics and cached decisions on your device. |
| `declarativeNetRequest` | Removes the `Origin` header from the extension's own requests to your local Ollama server, so the local server accepts them. Scoped to requests made by the extension itself. |
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
