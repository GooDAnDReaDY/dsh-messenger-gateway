# dsh-messenger-gateway

Messenger transport for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## Features (building toward 1.0)

- Telegram long-poll
- Text, voice (`dsh-voice`), photos (`attachments` + `dsh-vision-bridge`), documents
- Outbound images from tool results
- `messenger` HTTP API: `/messenger/send`, `/ask`, `/progress`
- Forum topics = separate agent sessions
- Optional spoken replies (`dsh-tts`)
- Discord — planned

## Install

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

Settings → **Messenger gateway** → enable Telegram, paste bot token.

## Commands

`/start` `/help` `/new` `/whoami` `/stop`

MIT
