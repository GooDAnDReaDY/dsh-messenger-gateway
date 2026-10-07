# @goodandready/dsh-messenger-gateway — Project Navigation & Facts

Двусторонний шлюз связи между DeepSeek Harness (DSH) и внешними мессенджерами (Telegram, Discord, Slack): управление сессиями, контекстом, рулежкой (steer/follow-up), выполнением хостовых команд, мультимодальной обработкой (фото, документы, аудио), асинхронными оповещениями (notifyBridge), форум-топиками и опциональным синтезом речи (TTS).

## Project Metadata
- **Package**: `@goodandready/dsh-messenger-gateway`
- **DEV Root**: `/mnt/external/Project/DEV/dhsplugins/dsh-messenger-gateway`
- **Gitea Forge**: `http://192.168.1.111:3005/goodandready/dsh-messenger-gateway`
- **GitHub Mirror**: `https://github.com/GooDAnDReaDY/dsh-messenger-gateway`
- **Production Profile**: `web` (порт 3080, systemd unit `dsh-web.service`)
- **License**: MIT © GooDAnDReaDY

## Documentation Index
- [DESIGN.md](docs/design/DESIGN.md) — Обязательный дизайн-контракт: поверхности (Web UI, DSH слот `settings.plugin.item`, REST API), состояния, visual tokens, политика безопасности маршрутов и locked decisions.
- [AGENTS.md](AGENTS.md) — Проектные инструкции и правила независимой работы агентов: DEV-контур, Git workflow (1 issue = 1 commit, PR), запуск тестов, деплой.
- [README.md](README.md) — Каноническая документация пакета на английском языке.
- [README.ru.md](README.ru.md) — Полная русскоязычная документация.
- [README.zh.md](README.zh.md) — Китайская документация (中文说明).
- [CHANGELOG.md](CHANGELOG.md) — История релизов и изменений по версиям.
- [docs/index.md](docs/index.md) — Внутренний индекс проектной документации.

## Architecture Highlights
- **Cordis Plugin Entry (`lib/index.js`)**: Регистрация сервисов, динамический роутинг (`syncWebhookRoute`), реактивная привязка настроек.
- **Gateway Core (`lib/gateway.js`)**: Управление жизненным циклом сессий, событиями хоста, очередями диалога, рулежкой (steer) и командами.
- **Adapters (`lib/adapters/`)**: Транспортные адаптеры для Telegram (`lib/adapters/telegram.js`, `lib/adapters/telegram-inbound.js`), Discord (`lib/adapters/discord.js`), Slack (`lib/adapters/slack.js`).
- **Client Settings Card (`lib/client.js`)**: Реактивная карточка настроек в UI DSH (`settings.plugin.item`).
- **Security & Media Guard (`lib/http.js`, `lib/documents.js`, `lib/content-guard.js`)**: Строгая loopback-изоляция, проверка mime-типов, защита от symlink escape и ограничение памяти.

## Essential Scripts
- `deploy.sh` — Развёртывание точной версии плагина из npm registry в production-профиль (`web`) и рестарт службы:
  ```bash
  ./deploy.sh [profile] [version]
  # Пример: ./deploy.sh web 0.4.12
  ```
- `scripts/publish-github.sh` — Синхронизация публичного дерева в GitHub-зеркало.
- `scripts/verify-dsh-load.mjs` — Тестовая проверка загрузки манифеста и инъекций плагина ядром DSH.

## Verified Verification Commands
```bash
pnpm test          # Запуск полного набора unit-тестов
npm run test:all   # Unit-тесты + проверка загрузки в DSH
npm run smoke:http # HTTP smoke test маршрутов
```
