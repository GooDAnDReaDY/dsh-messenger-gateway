# @goodandready/dsh-messenger-gateway

Telegram messenger bridge for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Talk to your Harness agent from Telegram: text, voice, photos, documents, inline buttons, named homes, and optional spoken replies.

## Features

- Long-poll or webhook Telegram bot
- Multi-transport support: Telegram, Discord (Webhooks & Bot API), and Slack (Webhooks & Bot API)
- Allowlist + pairing codes
- Per-user or per-chat sessions (`sessionScope`)
- Forum topics as separate sessions
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
| `/stop` | Abort the current turn |
| `/model` `/status` | Model / gateway status |
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
- `voiceMode`: `mirror` / `always` / `off` — when to speak replies (also `/voice`)
- `tts.enabled` / `tts.maxChars` — TTS gate and length cap
- `notifyBridge` — forward non-messenger web session events to a home
- Bot token is a DSH secret field — never commit it

## Requirements

- DeepSeek Harness web (or compatible) profile
- Node.js matching your Harness install
- For voice notes from non-Opus TTS: `ffmpeg` on the host `PATH`

## License

MIT
