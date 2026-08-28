# Changelog

## 0.3.0

Telegram delivery hardening (learned from Hermes/OpenClaw/PicoClaw Telegram handling).

- Rich formatting: GFM tables → bullet groups, task lists (☑/☐), `<details>` → summary + body
- Smart network retry: resend-safe errors (connect/pool timeout, ECONNRESET, undici `not sent to telegram`) retried with backoff; ambiguous timeouts and 4xx/5xx not retried (no duplicate delivery)
- Polling conflict detection (409 from getUpdates) logged loudly
- Stale-topic recovery: `messenger_ask` aborts and releases callback keys on deleted thread/topic; progress sends skip silently
- Status indicator (opt-in): bot short description Online/Offline

## 0.2.0

First public feature release (npm / GitHub).

- Telegram long-poll and webhook
- Allowlist and pairing
- `sessionScope` user|chat, forum topics as sessions
- Steer / follow-ups while busy; `/stop` during turns
- Named homes (`/sethome`, `/home`)
- `messenger_ask` inline buttons
- Notify bridge to Telegram home
- Voice UX (`/voice`, `voiceMode`) + TTS path with ffmpeg → OGG/Opus voice notes
- Settings card on Plugins tab

Discord adapter remains unimplemented.

## 0.1.0

Initial npm placeholder / early package registration.
