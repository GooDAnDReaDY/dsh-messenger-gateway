# DESIGN.md — dsh-messenger-gateway

## Product / Purpose
- Назначение: Telegram & multi-messenger gateway для DeepSeek Harness (сессии, steer, homes, inline asks, уведомления и голосовые ответы).
- Аудитория: пользователи DSH, взаимодействующие с агентом через Telegram и внешние мессенджеры.
- Статус: публичный npm-пакет `@goodandready/dsh-messenger-gateway`.

## User Surfaces
- Web/UI: нет отдельной страницы.
- DSH UI / settings / slots: карточка `settings.plugin.item` (ключ = пространство `dsh-messenger-gateway`, локаль = `dsh-messenger-gateway`). Резервный `settings.section` исключён по стандарту авторства DSH (Issue #45).
- API: host-маршруты `/dsh-messenger-gateway/status`, `/pairing`, `/events` и др.
- CLI: нет.
- Документация: README(.md/.ru.md/.zh.md), docs/architecture, docs/deployment, docs/testing.

## Visual Direction
- Нативная карточка настроек DSH: скругление 12px, префикс классов `msgw-`, использование CSS-переменных темы (`--dsw-alias-*`).
- Не копировать сторонние бренды; форма компактная, свёрнута по умолчанию с шевроном.

## Components And States
- Поля настроек: `enabled`, `telegram`, `agent`, `media`, `tts`.
- Источник значений: `ctx.settingsScope.bind({ namespace: NS })` + статус снимка `snapshot.status` (`loading` / `unavailable` / `ready`).
- При `loading` — отображение индикатора загрузки; при `unavailable` — предупреждение о недоступности пространства; форма отображается только при `ready`.
- Сохранение: `scope.set` по конфигурационным ключам, сбор всех ошибок сохранения поимённо без прерывания на первой ошибке.
- Операционные действия: запросы сопряжения (`/dsh-messenger-gateway/pairing`, approve/reject) остаются на HTTP-действиях.

## User Flows
1. Открыть Настройки → Плагины → Настройки плагинов → Messenger gateway.
2. Карточка разворачивается по клику на заголовок.
3. Дождаться `ready`, редактировать параметры Telegram, агента, медиа или TTS, нажать «Сохранить».
4. Операции сопряжения (pairing) обновляются и подтверждаются/отклоняются в отдельном блоке формы.

## Locked Design Decisions
- 2026-09-06 (#44): чтение и сохранение конфигурации выполняются строго через `settingsScope` со статусной валидацией снимка (`loading`/`unavailable`/`ready`). Прямой REST-байпас `/config` в UI настроек запрещён.
- 2026-09-06 (#45): плагин монтируется только в слот `settings.plugin.item`. Резервный монтаж в `settings.section` (боковое меню) удалён для предотвращения захламления навигации DSH.
- 2026-09-06: в записи слота обязательны `key: NS`, `locale: NS`, `inject: () => ({ ctx })`, а модуль экспортирует `inject: ['slots', 'locale', 'settingsScope']`.
- 2026-09-07 (#48): Персистентность локальных JSON-хранилищ (scheduler, pairing, voice-prefs) переведена на атомарную запись (write-rename) для исключения повреждения данных при внезапных рестартах и конкурентной записи.
- 2026-09-07 (#48): Планировщик стриминга сообщений (createEditScheduler) защищен от Flood Control (Telegram 429) с уважением retry_after и обязательной доставкой финального сообщения.
- 2026-09-07 (#48): Устранение утечек памяти: дефолтный 24-часовой reapIdle неактивных сессий и чатов в фоне.
- 2026-09-07 (#48): Структурированная справка /help по категориям (диалог, инструменты, настройки, доступ).
- 2026-09-08 (#51): Защитная нормализация content сообщений (ensureContentArray): исключает краш content.some is not a function при попадании строкового content в dsh-llm конвейер при /fork, steer и runTurn.
- 2026-09-08 (#54): Оптимизация стабильности и потребления памяти: экспоненциальный backoff polling при ошибках Telegram, атомарный срез сообщений при /rewind, очистка устаревших AbortController перед новым ходом, исключение избыточного кодирования Base64 при /export, атомарное снятие askToken до асинхронных операций.
- 2026-09-10 (#57): Защита клиентского жизненного цикла: регистрация словаря локализации обёрнута в try/catch с console.warn на отказ, чтобы повторная регистрация или ошибка словаря никогда не блокировали слот settings.plugin.item. Доступ к службам контекста переведён на безопасный вызов ctx.get('...') с fallback.
- 2026-09-10 (#59): Приведение оформления к единому стандарту dsh-clinebot и комплексная стабилизация:
  - Внедрён собственный защитный ErrorBoundary с кнопкой Retry вокруг формы настроек.
  - Добавлены статусные бейджи в шапке карточки (Telegram bot getMe username/id, Token status, Transport mode, Pairing count).
  - Реализован диагностический инструмент связи Telegram API (Smoke / Ping test) на клиенте и сервере (POST /dsh-messenger-gateway/smoke, probeHealth).
  - Секционная блочная структура (.msgw-section-card, .msgw-btn, .msgw-badge, .msgw-alert-*), типографика и токены --dsw-alias-*.
  - Очищен dsh.client.inject: [] в package.json по современному соглашению ядра DSH.
