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
- 2026-09-12 (#61): Оптимизация скорости отклика, адаптивный стриминг, keepalive и topic fallback:
  - Стриминг сообщений: адаптивный дебаунс createEditScheduler — первый чанк отправляется быстро (через ~250 мс), последующие дросселируются с интервалом 1200–1400 мс для защиты от Telegram 429 flood control.
  - HTTP Keep-Alive: все сетевые запросы к Telegram API используют keepalive: true для устранения избыточных TCP/TLS handshake.
  - Непрерывный Typing Heartbeat: индикатор "печатает..." в Telegram запускается на время инференса и работы тулов каждые 4.5 с и снимается сразу при старте стриминга текста.
  - Topic Gone Fallback: при ошибке isTopicGoneError в ветках супергрупп отправка ответа автоматически перенаправляется в основной чат (threadId: 0), исключая потерю ответа агента.
  - Live Telemetry Polling: карточка настроек автоматически опрашивает /status каждые 10 секунд при монтировании, поддерживая актуальность бейджей онлайна и очередей без перезагрузки.
- 2026-09-12 (#63): Решение GitHub Issues #1, #2, #3:
  - GitHub #1: Входящие сообщения пользователя переведены на `source: { kind: 'user', plugin: PLUGIN, form: 'relay'|'steer', origin: 'telegram' }`. Реплики отображаются полноценными пузырями пользователя в WebUI DSH, ядро DSH активирует обработку слэш-скиллов (`/имя_скилла`).
  - GitHub #2: Динамическое обнаружение и объединение активных скиллов/инструментов DSH с базовыми командами шлюза для подсказок Telegram (`setMyCommands`) с соблюдением лимита в 100 команд и валидацией формата.
  - GitHub #3: Обратное зеркалирование сессий DSH в форум-топики Telegram: параметр `telegram.forumMirrorChatId` автоматически создаёт топик в супергруппе под сессии из веб-GUI DSH и привязывает входящие сообщения топика к этой сессии.
- 2026-09-13 (#65): Интернационализация EN/ZH, Forum Topics 2.0, Safety Gate 2.0, Multi-Messenger паритет, Cron-отчеты:
  - Канонический язык ядра: английский (en) канонический/fallback, китайский (zh) встроенный пользовательский. Устранены захардкоженные русские строки из `lib/`. Вынос всех текстов в `lib/locales/{en,zh}.js`. Русская локализация передается через issue в `goodandready/dsh-russian-lang`.
  - Forum Topics 2.0: хранение персон и пресетов на уровне веток `chatId:threadId`. Команды `/bind` и `/preset` внутри топиков форума Telegram.
  - Safety Gate & Tool Approval 2.0: расширенная карточка согласования с синтаксическим превью параметров/команд и трёхуровневым решением (`Allow Once`, `Allow for Session`, `Deny`).
  - Multi-Messenger Parity: интерактивные кнопки `messenger_ask` для Discord (Action Rows/Buttons) и Slack (Block Kit Actions) со стриминговым редактированием сообщений.
  - Cron & Autonomous Heartbeat: периодические расписания в `lib/scheduler.js`, команды `/cron` для автономного запуска задач агентом и регулярных отчетов в чат.
  - Чистота пакета: строгое исключение временных и вспомогательных файлов из npm tarball, контроль размера < 256 KiB.
- 2026-09-15 (#67): Встроенный автообновлятор (Self-Updater), стабилизация сетевого контура, таймауты и паритет настроек мессенджеров:
  - Plugin Self-Updater (`lib/updater.js`): обнаружение бинарника CLI DSH (`@deepseek-ai/dsh`), проверка semver и реестра npmjs (кэш 5 минут), эндпоинт `/dsh-messenger-gateway/update` с защитой loopback + same-origin + `x-dsh-plugin-update: 1`.
  - Telegram команда `/update` (`/update check`, `/update now`) с проверкой прав доступа пользователя (`allowedUserIds`).
  - Карточка автообновления в WebUI (`lib/client.js`) со статусом версий и кнопкой обновления в один клик.
  - Сетевая надежность: подключение экспоненциального backoff polling в Telegram при ошибках (`computePollBackoffMs`, задержка 15 с при HTTP 409 conflict).
  - Стойкость сетевых вызовов: `keepalive: true` и таймаут `AbortSignal.timeout(15000/30000)` на всех вызовах `fetch` в адаптерах Discord и Slack.
  - Управление памятью: TTL-очистка `turnStarts` Map (удаление записей старше 2 часов) для защиты от утечек памяти при длительной работе шлюза.
  - Паритет настроек в WebUI: секции настроек для Discord и Slack (токены бота, вебхуки, каналы) со связыванием через `settingsScope` и сохранением существующих секретов. Бейдж количества активных cron-задач в шапке карточки.
- 2026-09-18 (#70): Синхронизация имени пакета в 4 канонических точках: серверный экспорт name в lib/index.js приведен к @goodandready/dsh-messenger-gateway для строгого паритета с package.json, cordis.patch.yml и загрузчиком lib/client.js. Добавлен тест целостности идентичности test/package-identity.test.mjs.
- 2026-09-18 (#69): Усиление безопасности вебхука Telegram: при transport === 'webhook' наличие webhookSecret строго обязательно (отказ 403 при отсутствии секрета), заголовок x-telegram-bot-api-secret-token сравнивается в постоянном времени через timingSafeCompare (crypto.timingSafeEqual), адаптер Telegram гарантированно отправляет secret_token при setWebhook, а карточка WebUI отображает бейдж статуса секрета (Secret set / Secret required).
- 2026-09-18 (#72): Очистка рабочего дерева от устаревших релизных артефактов (*.tgz) и временных файлов (temp_check.js). Проверена независимость скриптов smoke:http и verify-dsh-load от локальных архивов.
- 2026-09-18 (#71): Санитизация публикуемого репозитория: index.md и внутренние регламенты docs/testing/ сняты с отслеживания git без удаления с диска и внесены в .gitignore. Документы docs/deployment/install.md и docs/architecture/overview.md зафиксированы как публичные руководства для пользователей и администраторов. Проведен секрет-скан истории: боевые токены и приватные чаты отсутствуют.
- 2026-09-18 (#77): Очистка мёртвых экспортов в lib/media.js: удалена неиспользуемая функция mediaKindOf, константа TELEGRAM_MAX_DOC_BYTES импортирована в lib/adapters/telegram.js как единый источник лимита по умолчанию (20 МБ), для parseChatKey и voiceReplyFile зафиксировано явное назначение (экспорт для unit-тестов).
- 2026-09-18 (#75): Декларация зависимостей клиентской половины в package.json: в dsh.client.inject явно задекларированы @deepseek-ai/dsh-client-locale, @deepseek-ai/dsh-client-ui-slots и @deepseek-ai/dsh-client-ui-settings, строго соответствующие декларации модуля client.js (inject: ['slots', 'locale', 'settingsScope']).
- 2026-09-18 (#74): Полный перевод CSS-оформления WebUI на переменные темы DSH: устранены все 8 standalone rgba(...) и 3 hex-цвета, стили бейджей, алертов, опасных кнопок и баннеров переведены строго на токены --dsw-alias-state-*-bg, --dsw-alias-state-*-border и --dsw-alias-state-*-primary с fallback на слои темы. Добавлен регрессионный тест test/client-settings.test.mjs.
- 2026-09-18 (#76): Устранение немых catch и диагностика отказов Telegram API:
  - Выделен модуль lib/api-health.js (ApiHealthTracker) с подсчётом последовательных ошибок API, сохранением последнего сбоя (lastError), debug-логированием каждой ошибки и эскалацией до logger.warn при повторных сбоях (каждые 5 ошибок подряд).
  - Сброс счётчика при успешной отправке (recordApiSuccess()).
  - Все 44 пустых блока catch в gateway.js, telegram.js, stream.js, scheduler.js, models.js, pairing.js, voice-prefs.js, personas.js и client.js снабжены либо логированием ошибок, либо явными комментариями о безопасных best-effort операциях (abort, temporary file cleanup, fallback catalog).
  - Маршрут /dsh-messenger-gateway/status возвращает объект apiHealth (degraded, consecutiveFailures, lastError), а WebUI отображает бейдж Telegram API degraded при 3+ сбоях подряд.
  - Добавлены unit-тесты test/api-failure-tracking.test.mjs.
- 2026-09-18 (#73): Декомпозиция серверных монолитов и архитектурное обоснование клиентского бандла:
  - Серверная половина: монолитные модули декомпозированы со строгим соблюдением проектного ориентира (не более 600 строк на файл):
    - `lib/adapters/telegram.js` сокращен с 732 до 596 строк (выделен `lib/adapters/telegram-inbound.js` для разбора входящих медиа и probeHealth; клавиатуры и команды консолидированы в `lib/commands.js`).
    - `lib/gateway.js` сокращен с 1238 до 590 строк (выделены специализированные модули `lib/gateway-commands.js`, `lib/gateway-callbacks.js`, `lib/gateway-turn.js`, `lib/forum-mirror.js`, логика интерактивных опросов вынесена в `lib/ask.js`).
    - Все сопутствующие серверные модули (`lib/gateway-commands.js` — 584 строки, `lib/index.js` — 540 строк, `lib/file-manager.js` — 189 строк, `lib/alerts.js` — 105 строк) строго укладываются в лимит < 600 строк.
  - Клиентская половина (`lib/client.js`): согласно архитектуре загрузчика модулей ядра DSH (`window.__ModuleLoader__.load`), клиентский UI плагина поставляется как единый автономный JavaScript-бандл (React UI), загружаемый браузером без механизма относительных импортов с диска в браузере. Данное архитектурное решение является осознанным проектным исключением из критерия 600 строк.









