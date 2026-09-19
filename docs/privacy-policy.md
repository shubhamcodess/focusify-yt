# Privacy Policy: Focusify

_Last updated: 2026-09-20_

Focusify is a browser extension that filters YouTube based on a focus topic you choose. It is designed to work entirely on your device.

## What Focusify stores

Settings (topic, keywords, channel lists, schedule), statistics (counts of videos scanned and blocked, a short list of recently blocked titles) and cached filtering decisions. This data is stored in your browser using Chrome's extension storage (`chrome.storage`). Settings may sync across your own Chrome profile if you have Chrome sync enabled.

## What Focusify does not do

- It does not collect, transmit, sell or share personal information, browsing history or analytics.
- It has no accounts, servers or tracking.
- It does not read any site other than youtube.com.

## Optional AI (Ollama)

If you enable the AI or Hybrid mode, the titles and channel names of YouTube videos are sent to the Ollama endpoint you configure. By default this is `http://localhost:11434`, a program running on your own computer. If you point the endpoint at another machine, that machine receives this data. Focusify never sends it anywhere else.

## Permissions

- `storage`: save your settings and statistics locally.
- `declarativeNetRequest`: adjust request headers on the extension's own requests to your local Ollama server.
- Access to `youtube.com` and `localhost:11434`: read video titles on YouTube and talk to your local Ollama.

## Changes and contact

Changes to this policy will be published in this repository. Questions: open an issue in the repository.
