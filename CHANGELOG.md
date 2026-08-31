# Changelog

## 0.3.2 (hotfix)

DSH alpha.2 migration: dropped removed `settingsNamespace` import from `@deepseek-ai/dsh-settings`.

- `lib/index.js`: `SETTINGS_NAMESPACE` is now a plain lowercase-hyphenated string `'dsh-messenger-gateway'`. alpha.2 `ctx.settings.register(ns, schema, opts)` accepts a string ns; `parseSettingsNamespace` validates `^[a-z][a-z0-9-]*$`.
- No other removed alpha.2 exports are used in this plugin (`installSettingsSection`, `deepEqualJson` — none imported).
- peerDependencies aligned to alpha.2: `@deepseek-ai/dsh-* ^0.1.2-alpha.2`, `schemastery ^3.18.2`, `cordis ^4.0.2`.
- No DSH-core changes, no cross-plugin dependency. Migration is local to this plugin.

### Verified on alpha.2 (isolated, nothing foreign touched)
- Module import on alpha.2 (dsh-settings 0.1.2-alpha.2, `settingsNamespace` removed): clean, no SyntaxError.
- Real alpha.2 `SettingsProvider` + cordis `Context`: `register('dsh-messenger-gateway', Config, {base})` accepted; `scope.get / watch / update / replace` resolve our `Config`.
- Tests: 100/100 (incl. `test/alpha2-migration.test.mjs` static smoke).
- Test server (MiniPC rc.2): install + `DSH_TEST_OK` + cleanup clean.
- Production profile updated to 0.3.2; plugin is NOT in the `failed to import` list on `dsh-web`.

### Blocked (separate issue)
Clean alpha.2 profile start is blocked by `goodandready/dsh-messenger-gateway#19`: 9 foreign plugins (better-sidebar, dsh-context, llm-ollama, etc.) still import removed alpha.2 exports. Out of scope here.

## 0.3.1

- Align `peerDependencies` to DSH `0.1.1-rc.2` (manifest accuracy, no behavior change)
- `/whoami` now also reports `chatId` / `threadId` in groups
- `/mute` / `/unmute`: suppress notify-bridge messages for a chat
- `/status` now shows delivery/error counters, polling-conflict flag, uptime
- `/tts on|off|status`: per-chat TTS override (takes precedence over global/user)

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
