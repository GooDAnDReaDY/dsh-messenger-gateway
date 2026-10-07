# dsh-messenger-gateway Documentation Index

Welcome to the internal technical documentation for `@goodandready/dsh-messenger-gateway`.

## Documents
- [Design Contract](design/DESIGN.md) — UI/UX specifications, palette, typography, components, route security policy, and locked design decisions.
- [Project Agents Contract](../AGENTS.md) — Developer and agent workflow contract for MiniAI and Gitea.
- [English README](../README.md) — Public package overview, setup, and configuration.
- [Русская документация](../README.ru.md) — Полное руководство пользователя и администратора.
- [中文文档](../README.zh.md) — 完整的使用和配置说明.
- [Project Navigation Index](../index.md) — Root project index and verified commands.

## Architecture Highlights
- **Cordis Entry (`lib/index.js`)**: Lifecycle management, dynamic webhook route binding, config synchronization.
- **Gateway Core (`lib/gateway.js`)**: Session management, turn coordination, steer mechanics, streaming.
- **Multi-Transport (`lib/adapters/`)**: Telegram Long-polling / Webhook, Discord bot, Slack bot.
- **UI Settings Card (`lib/client.js`)**: DSH Web interface settings integration via `settings.plugin.item`.
- **Security & Safety (`lib/http.js`, `lib/file-manager.js`)**: Loopback enforcement, canonical path verification.
