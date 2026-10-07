# Project Instructions — dsh-messenger-gateway

This file supplements the shared `/mnt/external/Project/DEV/AGENTS.md`.

## Product

- **Project**: dsh-messenger-gateway
- **Package**: `@goodandready/dsh-messenger-gateway`
- **DEV Root**: `/mnt/external/Project/DEV/dhsplugins/dsh-messenger-gateway`
- **Gitea Forge**: `http://192.168.1.111:3005/goodandready/dsh-messenger-gateway`
- **GitHub Mirror**: `https://github.com/GooDAnDReaDY/dsh-messenger-gateway`
- **Production Profile**: `web` (port 3080, systemd unit `dsh-web.service`)
- **Purpose**: Full-featured bidirectional bridge between DeepSeek Harness and external messengers (Telegram, Discord, Slack) with session management, streaming, steer/follow-up, tools, multimodal inputs, notify bridge, and voice notes.
- **Publication**: Public package on npm (`@goodandready/dsh-messenger-gateway`) and GitHub. Release process requires user approval before merge and release.

## Architecture

- **Cordis Core (`lib/index.js`)**: Registers DSH services, manages dynamic routing (`syncWebhookRoute`), reactive config synchronization via `ctx.configForms`.
- **Gateway Engine (`lib/gateway.js`)**: Manages session state, handles host lifecycle events (`session/event`, `turn/end`, `turn/start`, `assistant/message`), orchestrates dialog turns and tool calls.
- **Adapters (`lib/adapters/`)**: Modular transport layers for Telegram (poll and webhook), Discord, and Slack.
- **Client Settings Card (`lib/client.js`)**: Web UI component injected into DSH settings slot `settings.plugin.item`.
- **Security & Boundaries (`lib/http.js`)**: Administrative endpoints (`/status`, `/config`, `/smoke`, `/pairing/*`) strictly require loopback (`127.0.0.1` / `::1`). Public Telegram webhook validates `X-Telegram-Bot-Api-Secret-Token`.
- **Atomic Operations (`lib/storage-atomic.js`)**: All state persistence uses atomic temp files and renames to prevent corruption.

## Development & Git Workflow Constraints

1. **Remote Execution Only**:
   - All commands must run on MiniAI via SSH as user `vadim`. Windows PC is strictly an interface.
   - Use Git wrapper `/home/vadim/.local/bin/git-antigravity`.
2. **Atomic Commits & PRs**:
   - **1 issue = 1 commit**. No mixed commits in feature branches.
   - Combine group issues into a single PR targeting `main`.
   - Never merge into `main` without explicit user confirmation.
3. **Strict Versioning & Release Flow**:
   - Patch version bumps (`0.4.x -> 0.4.(x+1)`) in `package.json` and `CHANGELOG.md`.
   - Commit `chore(release): bump version to x.y.z`, tag `vx.y.z`, push to Gitea.
   - Create Gitea Release and GitHub Release.
   - Sync GitHub via `bash scripts/publish-github.sh --push main`.
   - Publish to npm: `npm publish --access public`.
   - Wait for npm replication, then deploy to production profile:
     ```bash
     ./deploy.sh web <version>
     ```
   - Verify health: `curl -fsS http://127.0.0.1:3080/dsh-messenger-gateway/status`.
   - Close issues in Gitea with structured comments.

## Essential Files

- `index.md` — Root project navigation, facts, and verified commands.
- `deploy.sh` — Production deployment runner script.
- `docs/design/DESIGN.md` — Mandatory UX/UI, surface, and security contract.
- `docs/index.md` — Internal technical documentation index.
- `README.md`, `README.ru.md`, `README.zh.md` — Public 3-language documentation.
- `CHANGELOG.md` — Structured changelog.

## Definition of Done

- All changes committed with clear conventional commit messages referencing issue numbers.
- Full test suite passes: `pnpm test` (0 failures).
- Preflight checks pass, package size within limits (<256 KiB per file).
- PR reviewed, approved, merged into `main`.
- Package tagged, mirrored to GitHub, published to npm, deployed to production `dsh-web.service`.
- Healthcheck verified on port 3080.
- Gitea issues closed with commit references.
