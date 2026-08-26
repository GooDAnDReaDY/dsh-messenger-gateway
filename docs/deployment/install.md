# Install

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

Optional companions in the same profile: `@goodandready/dsh-voice`, `@goodandready/dsh-tts`, `@goodandready/dsh-vision-bridge`.

Verify after restart:

- Settings card **Messenger gateway** loads
- `GET /dsh-messenger-gateway/status` (or your Harness base URL + that path) returns ok
- Bot responds to `/whoami` for an allowlisted user
