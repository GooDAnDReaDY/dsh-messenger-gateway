# AGENTS.md

Дополняет `/mnt/external/Project/DEV/AGENTS.md`. Проект: **dsh-messenger-gateway**.

## Product / Purpose

- Пакет: `@goodandready/dsh-messenger-gateway`
- DEV: `/mnt/external/Project/DEV/dhsplugins/dsh-messenger-gateway`
- RELEASE: `/mnt/external/Project/RELEASE/dhsplugins/dsh-messenger-gateway`
- Назначение: транспорт мессенджеров для DSH (Telegram в 0.1.0)
- Статус: `active` (0.1.0)
- Статус проверен: 25.08.2026, unit tests 36/36

## Identity (три места)

- `package.json` → `name`: `@goodandready/dsh-messenger-gateway`
- `cordis.patch.yml` → `name`: `@goodandready/dsh-messenger-gateway`
- `lib/client.js` loader `id`: `@goodandready/dsh-messenger-gateway`
- Plugin id в patch: `dsh-messenger-gateway`

## Runtime integrations (profile-level)

- `dsh-voice` — POST `/dsh-voice/transcribe`
- `dsh-tts` — POST `/dsh-tts/speak` (optional)
- `dsh-vision-bridge` — harness intercept on image attachments

## Git

- Gitea: `goodandready/dsh-messenger-gateway`
- Git wrapper: `git-cursor` (user `cursor`)
- Правки только в worktree `.worktrees/<branch>`

## Docs

- `@docs/architecture/2026-08-23-messenger-gateway-design.md`
- `@docs/deployment/0.1.0-install.md`
- `@docs/testing/0.1.0-smoke.md`

## Release gate

Перед merge/deploy: `npm run test:all` + `/dsh-messenger-gateway/status`. Код, роняющий load или prod, **не релизится**. См. `docs/testing/release-gate.md`.
