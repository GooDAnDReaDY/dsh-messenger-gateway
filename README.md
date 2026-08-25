# @goodandready/dsh-messenger-gateway

Messenger transport for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

## 0.1.0 scope (Telegram)

- Long-poll Telegram bot
- Text, voice (`dsh-voice`), photos (`attachments` + `dsh-vision-bridge`), documents
- Outbound images from tool results
- `messenger` service: HTTP `/messenger/send`, `/ask`, `/progress` and `ctx.provide('messenger')`
- Forum topics = separate agent sessions (`message_thread_id`)
- Optional spoken replies (`dsh-tts`)
- Commands: `/start` `/help` `/new` `/whoami` `/stop`

Discord adapter is a stub; full Discord support comes after 0.1.0.

## Profile dependencies

Install these plugins in the same Harness profile (they are not npm dependencies):

- `dsh-voice` — inbound voice transcription
- `dsh-tts` — optional spoken replies
- `dsh-vision-bridge` — inbound photo understanding

## Install

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

Settings → **Messenger gateway** → enable Telegram, paste bot token, set allowed user IDs.

See `docs/deployment/0.1.0-install.md` for staging smoke and prod swap vs legacy hub-media.

MIT
