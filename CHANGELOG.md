# Changelog

## 0.3.9

Interactive 2-Step Model Picker, Voice Summary, Forum Topics, System Resources & Keyboard Fix.

- **Interactive 2-Step Model Picker (`/model`):**
  - Step 1: Inline buttons list connected LLM providers (`ctx.llm.listProviders()`).
  - Step 2: Available models for chosen provider shown with 10 models per screen, pagination (`⬅️`, `➡️`), and `[ 🔙 Назад к провайдерам ]`.
  - One-click model switching saved to `agentDefaultModel` and gateway configuration.
- **Reply Keyboard Fix:**
  - `quickActions` now defaults to `false` (no unsolicited keyboard popups).
  - Removed `is_persistent: true` to prevent keyboard from locking open below input.
  - `/keyboard off` sends `remove_keyboard: true` to clear stale keyboards immediately.
- **Voice Summary Mode (`/voice summary` and `tts.voiceSummary`):**
  - When enabled, spoken audio provides a concise 1-2 sentence TL;DR summary, while full text, code, and markdown output are delivered to the chat.
- **Forum Topics Creation (`/topic <name>`):**
  - Dedicated command for supergroups to create new Telegram forum topics via Bot API and automatically initialize a clean isolated agent session for the task.
- **System Resource Dashboard (`/top`):**
  - Reports live Node.js memory (RSS, Heap), process uptime, active sessions, scheduled reminders, and current model.

## 0.3.8

Multi-transport Adapters: Discord and Slack.

- **Discord Adapter (`lib/adapters/discord.js`):** Multi-transport adapter for Discord via Incoming Webhook and Discord REST API v10 (`/channels/{channel_id}/messages`). Supports text chunking (2000-character Discord limit) and file attachment uploads (`multipart/form-data`).
- **Slack Adapter (`lib/adapters/slack.js`):** Multi-transport adapter for Slack via Incoming Webhook and Slack Web API (`chat.postMessage`). Supports message chunking and thread replies (`thread_ts`).
- **Configuration Schemas (`lib/config.js`):** Added complete `discord` and `slack` configuration blocks (`enabled`, `botToken`, `webhookUrl`).
- **Adapter Factory (`lib/adapters/index.js`):** Wired Discord and Slack adapters into the gateway adapter registry.

## 0.3.7

Scheduled Messages, Reminders & Inbound Webhook Events Dispatcher.

- **Reminders & Scheduler (`lib/scheduler.js`):** Persistent scheduler for timed messages and reminders (`scheduled.json`) with support for relative durations (`10s`, `15m`, `2h`, `1d`).
- **Command `/remind`:** Create reminders (`/remind 15m Call client`), list pending reminders (`/remind list`), and cancel by ID (`/remind cancel <id>`).
- **Inbound Webhook Events (`POST /dsh-messenger-gateway/events`):** HTTP endpoint for pushing messages and files into Telegram from external systems (CI/CD, GitHub/Gitea, cron jobs, alerts) with optional bearer/token authentication.

## 0.3.6

Admin Alert Channel for Errors, Pairing Requests and Gateway Status.

- **Alert Channel (`telegram.alerts`):** Dedicated Telegram channel/chat for immediate administrator alerts.
- **Pairing Alerts:** Instant alert upon unauthorized access attempts with user details and ready-to-run `/pair CODE` command.
- **Error Alerts:** Formatted alerts for agent turn errors, crashes, and background failures with session context.
- **Commands:** `/setalert` to configure the current chat as the alert channel; `/alert` to inspect status and `/alert test` to verify delivery.

## 0.3.5

File Manager in Telegram & Advanced Inbound Document Parsing.

- **/files [dir]:** Workspace file manager in Telegram with safe path resolution, file sizes, and directory tree navigation.
- **/get <path>:** Download and send files from the agent workspace directly to Telegram as documents.
- **Path Traversal Protection:** Strict sandboxing preventing directory traversal outside the configured agent workspace.
- **Advanced Document Parsing:** Inbound documents (PDF, DOCX, CSV/TSV, JSON, code & text files) are parsed and their content is cleanly injected into the agent context with truncation limits (`maxTextInjectBytes`).

## 0.3.4

Agent Superpowers: Roles & Personas, Tools Inspection, Fork, Markdown Export, Rewind.

- **/role / /persona:** Dynamic persona switching in chat (`coder`, `architect`, `reviewer`, `writer`, `translator`, `concise`) with persistent per-chat preference and `@role` tag dispatcher in group chats.
- **/skills / /tools:** Live inspection of active agent tools and descriptions.
- **/export:** Export full session dialogue history into a downloadable Markdown file (`.md`).
- **/rewind [N]:** Undo/rewind the last N conversation turns from the agent session context.
- **/fork:** Branch off the current chat context into a brand new independent DSH session while preserving message history.

## 0.3.3

Telegram UX, Multi-Select Ask Forms and Artifact Previews.

- **Reply Keyboard (Quick Actions):** Persistent/contextual quick actions menu in Telegram (`/new`, `/stop`, `/voice`, `/status`) with `/keyboard on|off` toggle command.
- **Multi-Select Ask Forms:** Support for interactive checkbox forms in `messenger_ask` with instant toggle callbacks without dropping wait state, pagination (`⬅️`, `1/N`, `➡️`), and `[ ✅ Готово ]` / `[ ❌ Отмена ]` actions.
- **Artifact & Diagram Previews:** Extraction and SVG card rendering of Mermaid diagrams (`graph`, `flowchart`, `sequenceDiagram`) as image attachments, and aligned monospace formatting for Markdown tables in Telegram HTML.
- **Web UI Settings:** Quick actions and artifact preview toggles in the plugin settings card.

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
