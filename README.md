# 📦 @goodandready/dsh-messenger-gateway

<div align="center">

<h3>Telegram Messenger Bridge with Interactive Buttons, Forum Topics & Voice Notes for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-messenger-gateway"><img src="https://img.shields.io/npm/v/@goodandready/dsh-messenger-gateway.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/All_Author_Projects-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="All Author Projects"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

<table align="center">
  <tr>
    <td align="center">
      ⭐ <strong>If you like this plugin, please star it on GitHub</strong> — it shows me that the plugin is useful to you and motivates me to keep developing it.
      <br><br>
      🐛 <strong>If you find a bug or would like to request a feature</strong>, open a GitHub issue in any language — I will review your proposal and implement useful suggestions in a future plugin version.
    </td>
  </tr>
</table>

</div>

---

## ⚡ Overview

**`dsh-messenger-gateway`** provides an enterprise-grade, multi-transport messaging gateway for **DeepSeek Harness** agents.
Talk to your Harness agent directly from Telegram: interactive keyboard buttons, forum topic sessions, private user workspaces, pairing codes, and optional spoken voice replies.

Talk to your Harness agent from Telegram: text, voice, photos, documents, inline buttons, named homes, and optional spoken replies.

## Features

- Long-poll or webhook Telegram bot
- Configurable proxy support: HTTP, HTTPS, SOCKS5, and SOCKS5h (`telegram.proxyUrl`)
- Custom Bot API root URL (`telegram.apiRoot`) for reverse proxies and local Bot API servers
- Multi-transport support: Telegram, Discord (Webhooks & Bot API), and Slack (Webhooks & Bot API)
- Allowlist + pairing codes (fail-closed by default: a fresh install admits nobody until paired; `allowlistMode: open` is an explicit opt-in)
- Conversation switching directly from chat (`/sessions` and `/resume <n|id>`)
- Per-user or per-chat sessions (`sessionScope`)
- Forum topics as separate sessions
- Named sessions from chat metadata (`agent.sessionTitleFromChat`: `TG · @username` or `TG · Group › topic N`)
- Quick actions reply keyboard (`/keyboard on|off`)
- Multi-select interactive ask forms with checkboxes and pagination (`messenger_ask`)
- Artifact & Mermaid diagram rendering (SVG cards) and monospace table formatting
- Agent roles & personas (`/role coder`, `/role architect`, `@role` tags in group chats)
- Agent tools & skills inspection (`/skills`, `/tools`)
- Session management: dialogue history export to Markdown (`/export`), turn rewind (`/rewind`), session branching (`/fork`)
- Workspace file manager (`/files [dir]`) and file download (`/get <path>`) with directory traversal protection
- Admin alert channel for pairing requests, model errors and monitoring (`/setalert`, `/alert`)
- Persistent scheduled reminders (`/remind <time> <text>`, `/remind list`, `/remind cancel`)
- Inbound webhook event dispatcher (`POST /dsh-messenger-gateway/events`) for CI/CD and external alerts
- Steer: follow-up messages while the agent is busy (instead of aborting)
- `/stop`, `/new`, `/model`, `/status`, `/voice`, `/sethome`, `/home`
- Agent tool `messenger_ask` (inline keyboard answers return to the agent)
- Named homes for outbound notify / `messenger.send`
- Optional notify bridge: web session events → Telegram home (excludes messenger sessions)
- Inbound voice → STT (`dsh-voice`), photos → vision (`dsh-vision-bridge`)
- Optional TTS replies (`dsh-tts`); mp3 is converted to OGG/Opus via `ffmpeg` for Telegram voice notes

Discord and Slack adapters are available as outbound transports (Webhooks or Bot REST APIs).

## Install

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

Then open **Settings → Plugins → Messenger gateway**:

1. Enable Telegram
2. Paste the BotFather token (write-only; leave blank to keep the current token)
3. Set allowed Telegram user IDs (or use pairing)

### Optional companion plugins (same profile)

| Plugin | Role |
|--------|------|
| `@goodandready/dsh-voice` | Transcribe inbound voice messages |
| `@goodandready/dsh-tts` | Speak agent replies |
| `@goodandready/dsh-vision-bridge` | Describe inbound photos |

They are **not** npm dependencies of this package — install them separately if you want those features.

### Voice notes

Spoken replies use Telegram `sendVoice`. If TTS returns MP3 (or other non-Opus audio), the gateway runs `ffmpeg` (`libopus`) to produce OGG. If `ffmpeg` is missing or conversion fails, the audio is sent as a regular audio file instead of a voice note.

## Commands (Telegram)

| Command | Description |
|---------|-------------|
| `/start` `/help` | Help |
| `/whoami` | Your Telegram user id |
| `/new` | New agent session |
| `/sessions` | List recent messenger conversations |
| `/resume <n|id>` | Switch chat to previous session |
| `/stop` | Abort the current turn |
| `/model` | Interactive 2-step model picker (providers → models) or `/model <prov> <mod>` |
| `/status` | Gateway status and session counters |
| `/top` | Live server resources: RSS/Heap memory, uptime, active chats, reminders |
| `/topic <name>` | Create a new Telegram forum topic in supergroups and start an isolated session |
| `/role [name]` | Switch agent persona (`coder`, `architect`, `reviewer`, `writer`, `translator`, `concise`) |
| `/skills` `/tools` | List active agent tools and capabilities |
| `/fork` | Fork current session into a new independent session |
| `/export` | Export session dialogue history to Markdown |
| `/rewind [N]` | Rewind last N conversation turns |
| `/files [dir]` | Workspace file manager |
| `/get <path>` | Download file from workspace |
| `/remind <time> <text>` | Set a reminder (e.g. `/remind 15m Call client`) |
| `/setalert` `/alert` | Configure admin alert channel and send test alert |
| `/keyboard on\|off` | Toggle quick actions reply keyboard |
| `/voice on\|off` | Per-user spoken replies |
| `/tts on\|off\|status` | Per-chat spoken replies |
| `/sethome [name]` | Bind current chat/topic as a named home |
| `/home` | List homes |

## Multi-Transport Support (Discord & Slack)

In addition to Telegram, outbound messages can be dispatched to Discord and Slack via Webhooks or Bot APIs:
- **Discord:** set `discord.enabled: true`, provide either `webhookUrl` or `botToken`. Target channels via `chatId: "<channel_id>"`.
- **Slack:** set `slack.enabled: true`, provide either `webhookUrl` or `botToken`. Target channels via `chatId: "<channel_id>"` or threads via `threadId: "<thread_ts>"`.

## Agent tools & HTTP

- Tool: `messenger_ask` — ask the user with inline buttons; choice is fed back into the turn
- HTTP (when enabled): `/messenger/send`, `/messenger/ask`, `/messenger/progress`
- Cordis service: `ctx.messenger` for other plugins

## Configuration notes

- `sessionScope`: `user` (default) or `chat` — how group chats isolate sessions
- `allowlistMode`: `closed` (default) or `open` — **closed** refuses every unknown user (fail-closed): a fresh install admits nobody until the admin approves a pairing code (`/start` → approve in the settings card); **open** admits all users when the allowlist is empty — enable it explicitly only for public assistant bots, the settings card and `/status` surface the exposure
- `security.trustProxy`: `false` (default) — loopback-trusted requests must carry a pinned `localhost` / `127.0.0.1` / `[::1]` Host (DNS rebinding defense). Enable only behind a trusted local reverse proxy that rewrites the Host header
- `/get` and `/files` require allowlisted users and never serve hidden (dot) files
- `telegram.proxyUrl` is a secret: the settings API returns only a masked value and an empty field keeps the configured proxy
- Inbound archives are extraction-capped (per-entry and per-archive budget verified against actual bytes — a lying ZIP header cannot balloon the heap)
- Mini App artifacts are chat-scoped: a Telegram user sees only artifacts produced in their own chat; allowlisted admins see all
- Mini App sign-in is hardened: `auth_date` required, 1h acceptance window, one-time `query_id` (replays rejected); `initData` in URL query is not accepted — the Mini App must send it via the `Authorization: tma` header
- HITL approvals are fail-closed by default: in `mutations` sensitivity every tool that is not recognizably read-only (including network, send and MCP tools) asks for confirmation; a chat without a target refuses unconfirmed actions
- Delivered updates are deduplicated across polling and webhook transports and the poll offset survives restarts — commands never execute twice
- Artifact SVG entering the dashboard store is sanitized (script blocks, event handlers and `javascript:` URLs stripped)
- Pending interactive asks are bounded (200 concurrent) and the ask timeout is clamped to 10 minutes
- Long replies are chunked by raw markdown (fence-aware) so no HTML tag is ever cut at a message boundary; `/voice summary` and `/keyboard` persist through the settings writer
- `telegram.apiRoot` with plain `http` is only accepted for loopback hosts (a local Bot API server); the webhook URL is logged without its secret path
- `webhooks.enabled: false` removes the messenger write routes entirely; GET `/update` and `/messenger` require trusted callers
- `webAppEnabled: false` takes the whole Mini App surface down (dashboard and every `/api/*` answer 404) and clears the menu button
- The outbox queue (alerts, cron, autonomous messages) is multi-writer safe: all mutations take an exclusive lock and reload on-disk state, so two gateway processes sharing a home neither lose nor duplicate jobs; DLQ alerts bypass the queue and are rate-limited per chat
- Note: turn replies to the user are streamed directly and are not covered by the outbox retry guarantee (by design — streaming edits cannot be replayed)
- Inline keyboard `replyMarkup` sent via `/messenger/send` is schema-validated (button text/actions, sizes) before delivery
- All state files (pairing, outbox, voice prefs) are written with `0600` permissions inside `0700` directories
- State persistence is durable and versioned: every write is fsynced before the rename (directory fsynced after), each save keeps a `.bak` of the previous good version, files carry a `schemaVersion` with migrations from legacy formats, and a corrupted file is preserved as `.corrupt-<ts>` and recovered from `.bak` — pairing never silently wipes access (fail-closed with an explicit error)
- Config sync is granular: changes that do not touch the transport slice (tokens, proxy, Bot API root, poll/webhook mode, adapter enablement, session scope) are applied live on the running gateway — active dialogs, streaming replies, pending asks and the Telegram polling offset survive a settings save; only transport changes recreate the gateway, and recreation is serialized (single-flight)
- Hot path stays async: cwd resolution is cached (10 s TTL) so inbound messages never run synchronous `stat`/`realpath` (matters on network filesystems), outbox persistence batches enqueue bursts into one debounced write and is forced out on `stop()`; the plugin also loads cleanly into profiles without a webServer service (routes are skipped with a warning), and a reload/dispose never leaves a stopped gateway reachable
- `/mute` (per chat) stops ALL outbound delivery to that chat — notify bridge, `messenger.send`, HTTP sends, cron prompts and forum mirroring report `{ok, muted}` and skip delivery; the interactive turn conversation is unaffected, and the dashboard shows real outbox/DLQ counters
- The settings card is generated from the config schema: every setting is visible and editable (the advanced section covers allowlist mode, bot language, approval sensitivity, streaming, Mini App, cost footer, budget alerts, forum mirror and memory injection), secrets are only reported as configured-flags and never returned to the browser
- `sessionList`: `true` (default) — enables `/sessions` and `/resume` commands in chat
- `sessionTitleFromChat`: `false` (default) — name each new session after its originating chat (`TG · @user`, `TG · Group › topic N`) instead of generic generated titles
- `voiceMode`: `mirror` / `always` / `off` — when to speak replies (also `/voice`)
- `tts.enabled` / `tts.maxChars` — TTS gate and length cap
- `notifyBridge` — forward non-messenger web session events to a home
- `telegram.proxyUrl`: optional HTTP, HTTPS or SOCKS5 proxy URL (`socks5://user:pass@127.0.0.1:1080`, `http://127.0.0.1:8080`); `socks://` and `socks5h://` are aliases. Leave it empty to use `TELEGRAM_PROXY` / `DSH_MESSENGER_TELEGRAM_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` from the environment, use `off`/`none`/`direct` to disable proxying entirely, and `NO_PROXY`/`no_proxy` rules are honoured. The tunnel is implemented with `node:net`/`node:tls` (no extra dependencies) and keeps normal TLS certificate verification for `api.telegram.org`
- `telegram.apiRoot`: optional custom Telegram Bot API base URL (default: `https://api.telegram.org`), for local Bot API servers or reverse proxies
- Bot token is a DSH secret field — never commit it

## Client UI & Settings Card

- Mounted into `settings.plugin.item` on the Plugins tab (`key: dsh-messenger-gateway`).
- Configuration is managed reactively via `settingsScope.bind({ namespace: 'dsh-messenger-gateway' })` with snapshot status checking (`loading`, `unavailable`, `ready`).
- Protected dictionary registration: duplicate registration attempts on page reload are safely caught with non-fatal warnings, ensuring the settings card never fails to mount.

## Requirements

- DeepSeek Harness web (or compatible) profile
- Node.js matching your Harness install
- For voice notes from non-Opus TTS: `ffmpeg` on the host `PATH`

## License

MIT
