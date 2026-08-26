# @goodandready/dsh-messenger-gateway

Telegram messenger bridge for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Talk to your Harness agent from Telegram: text, voice, photos, documents, inline buttons, named homes, and optional spoken replies.

## Features

- Long-poll or webhook Telegram bot
- Allowlist + pairing codes
- Per-user or per-chat sessions (`sessionScope`)
- Forum topics as separate sessions
- Steer: follow-up messages while the agent is busy (instead of aborting)
- `/stop`, `/new`, `/model`, `/status`, `/voice`, `/sethome`, `/home`
- Agent tool `messenger_ask` (inline keyboard answers return to the agent)
- Named homes for outbound notify / `messenger.send`
- Optional notify bridge: web session events → Telegram home (excludes messenger sessions)
- Inbound voice → STT (`dsh-voice`), photos → vision (`dsh-vision-bridge`)
- Optional TTS replies (`dsh-tts`); mp3 is converted to OGG/Opus via `ffmpeg` for Telegram voice notes

Discord is listed in settings as a placeholder only — the Discord adapter is not implemented yet.

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
| `/voice on\|off` | Per-user spoken replies |
| `/sethome [name]` | Bind current chat/topic as a named home |
| `/home` | List homes |

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
