# Architecture overview

The gateway owns Telegram I/O and maps chats/topics to Harness agent sessions.

- **Adapters** (`lib/adapters/`) — transport (Telegram implemented; Discord stub)
- **Gateway** (`lib/gateway.js`) — turns, commands, steer, TTS decision
- **Homes / groups / voice prefs** — small JSON-backed helpers under the plugin data dir
- **Integrations** — optional notify bridge into a named home

Companion plugins (voice/tts/vision) are separate packages loaded in the same Harness profile.
