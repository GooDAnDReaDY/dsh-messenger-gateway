# DESIGN.md — @goodandready/dsh-messenger-gateway

## 1. Product / Purpose
- **Назначение**: Полнофункциональный двусторонний мост-шлюз между средой DeepSeek Harness (DSH) и внешними мессенджерами (Telegram, Discord, Slack). Предоставляет удалённое управление интерактивными сессиями DSH, контекстными очередями диалога, рулежкой (steer/follow-up), выполнением инструментов, мультимодальной обработкой (изображения, документы, аудиосообщения), оповещениями о событиях системы (notifyBridge), форум-топиками и опциональным синтезом речи (TTS).
- **Аудитория**: Пользователи и администраторы DSH, взаимодействующие с агентами через мессенджеры без необходимости открывать браузерный веб-интерфейс.
- **Статус**: Production-ready (`v0.4.12+`).

---

## 2. User Surfaces
- **Web / UI (DSH Settings Card)**:
  - Слот расширения: `settings.plugin.item` (ID плагина: `dsh-messenger-gateway`).
  - Реактивная карточка настроек на клиенте (`lib/client.js`), подключаемая через DSH settings store.
  - Обеспечивает отображение интерактивного статуса адаптеров (Telegram/Discord/Slack), API Health, индикатора конфликтов long-polling, очереди сопряжения пользователей (Pairing Approvals), переключателей транспортов (long-polling vs webhook), настроек моделей агента, рабочей директории (agent.cwd) с валидацией каталога и индикатором эффективного пути, медиа-лимитов и синтеза голоса.
  - При отсутствии `configForms` или удалённом доступе использует защитный снимок (`SNAPSHOT_READY`), предотвращая циклические ререндеры `useSyncExternalStore` (React error #185).
- **API (HTTP REST Endpoints)**:
  - Шлюз монтирует эндпоинты в общее дерево DSH Web Server по базовому пути `/dsh-messenger-gateway/*`.
  - Внешний эндпоинт приёма вебхуков мессенджеров: `/dsh-messenger-gateway/telegram/webhook` (путь настраивается динамически).
  - Внутренние административные и интеграционные REST-эндпоинты: `/status`, `/config`, `/smoke`, `/pairing/*`, `/messenger/api/*`, `/files`, `/get`.
- **CLI**:
  - Управление жизненным циклом через CLI DSH: `dsh plugin --profile web add @goodandready/dsh-messenger-gateway@<version>`.
- **Документация**:
  - Публичная документация (3 языка): `README.md` (English), `README.ru.md` (Русский), `README.zh.md` (中文).
  - История изменений: `CHANGELOG.md`.
  - Внутренняя проектная документация: `docs/design/DESIGN.md`, `docs/index.md`, `AGENTS.md`.

---

## 3. Visual Direction
- **Атмосфера**: Минималистичный, плотный и строгий системный интерфейс, полностью наследующий визуальный язык и токены DeepSeek Harness.
- **Референсы**: Нативная дизайн-система DSH (`--dsw-alias-...`), компонентные паттерны карточек DSH Core.
- **Не копировать**: Сторонние CSS-фреймворки, внешние шрифты, хардкодные HEX-цвета без привязки к CSS-переменным, перегруженные декоративные анимации.

---

## 4. Foundations
- **Цвета и дизайн-токены**:
  - Фоны: `var(--dsw-alias-bg)`, `var(--dsw-alias-surface-1)`, `var(--dsw-alias-surface-2)`.
  - Текст: `var(--dsw-alias-text-primary)`, `var(--dsw-alias-text-secondary)`, `var(--dsw-alias-text-muted)`.
  - Границы: `var(--dsw-alias-border)`.
  - Статусы:
    - Успех / Активен: `var(--dsw-alias-success, #10b981)`.
    - Ошибка / Конфликт: `var(--dsw-alias-danger, #ef4444)`.
    - Предупреждение / Ожидание: `var(--dsw-alias-warning, #f59e0b)`.
    - Информационный / Акцент: `var(--dsw-alias-primary, #6366f1)`.
- **Типографика**: Системный DSH шрифт (`system-ui, -apple-system, sans-serif`), моноширинный (`ui-monospace, monospace`) для токенов, ID сессий, путей файлов и JSON.
- **Сетка и отступы**: 8pt-сетка (отступы 4px, 8px, 12px, 16px, 24px), карточная структура секций с группировкой настроек по смысловым блокам.
- **Accessibility**: Семантические HTML-теги, явные контрастные статусы бейджей, доступность интерактивных элементов с клавиатуры.

---

## 5. Components And States
- **Бейджи статуса (Status Badges)**:
  - `Bot Status`: `Online / Running` (зелёный), `Stopped` (серый), `Conflict` (красный — одновременный polling другим процессом).
  - `API Health`: `Healthy` (зелёный), `Degraded` (жёлтый/красный при последовательных сбоях сетевого адаптера).
  - `Active Transport`: `Polling (50s)` или `Webhook (/dsh-messenger-gateway/telegram/webhook)`.
  - `Pairing Requests`: Индикатор количества ожидающих заявок пользователей с бейджем счётчика.
- **Состояния интерфейса**:
  - `Loading`: Индикаторы загрузки при проверке smoke-теста и сохранении конфигурации.
  - `Empty`: Пустой список ожидающих заявок сопряжения (`No pending pairing requests`).
  - `Error`: Баннеры ошибок сетевых вызовов с отображением диагностического сообщения.
  - `Success`: Всплывающие уведомления об успешном сохранении настроек или одобрении сопряжения.
- **Формы и валидация**:
  - Поля защищённых токенов (Bot Token, Webhook Secret) скрыты маской и валидируются перед отправкой.
  - Числовые лимиты (таймауты, размеры файлов, лимиты символов) ограничены безопасными диапазонами.

---

## 6. User Flows
1. **Первичное сопряжение пользователя (Pairing Flow)**:
   - Новый пользователь отправляет `/start` боту в Telegram.
   - Бот отвечает сервисным сообщением с кодом сопряжения и ставит запрос в очередь.
   - Администратор видит запрос в карточке настроек DSH (с отображением User ID, Username и времени).
   - Администратор нажимает `Approve` или `Reject`.
   - При `Approve` ID добавляется в `allowedUserIds`, и бот открывает доступ к сессиям.
2. **Переключение транспорта Telegram (Polling <-> Webhook)**:
   - Администратор меняет тип транспорта в UI и указывает путь вебхука.
   - Плагин динамически дерегистрирует старый маршрут и регистрирует новый в роутере DSH без перезапуска сервера.
   - Бот автоматически устанавливает или удаляет вебхук на серверах Telegram API.
3. **Обработка входящих сообщений и контекста**:
   - Текст/фото/документ преобразуется шлюзом в структурированный `turn` для DSH Agent.
   - Поддерживаются команды сессии: `/model` (смена модели), `/persona` (переключение системного промпта), `/fork` (ответвление диалога), `/reset` (очистка истории).
4. **Асинхронные оповещения (Notify Bridge)**:
   - События DSH (`task_done`, `error`) транслируются шлюзом в настроенный домашний чат/топик.

---

## 7. Политика маршрутов (Route Security Policy)

Все маршруты плагина строго разграничены по уровню доверия и методам проверки источника:

| Путь | Метод | Проверка источника / Аутентификация | Назначение |
|---|---|---|---|
| `/dsh-messenger-gateway/status` | `GET` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Диагностический снимок состояния, адаптеров и здоровья API |
| `/dsh-messenger-gateway/config` | `GET` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Получение текущей конфигурации плагина |
| `/dsh-messenger-gateway/config` | `PUT` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Сохранение и реактивное применение настроек |
| `/dsh-messenger-gateway/smoke` | `POST` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Тестовый запуск проверки доступности сетевых адаптеров |
| `/dsh-messenger-gateway/pairing/pending` | `GET` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Список нерассмотренных запросов на сопряжение |
| `/dsh-messenger-gateway/pairing/approve` | `POST` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Одобрение запроса сопряжения по User ID |
| `/dsh-messenger-gateway/pairing/reject` | `POST` | Loopback, либо Webhook/Bearer Secret, либо DSH `connection.requestRejection` | Отклонение запроса сопряжения по User ID |
| `/dsh-messenger-gateway/events` | `POST` | Обязательный `webhooks.secret` (Bearer/Header/Body) | Приём событий от внешних систем/CI/CD |
| `/dsh-messenger-gateway/telegram/webhook` | `POST` | Проверка `X-Telegram-Bot-Api-Secret-Token` | Приём внешних вебхуков от Telegram Cloud API |
| `/dsh-messenger-gateway/messenger/send` | `POST` | Loopback (`127.0.0.1` / `::1`), либо Webhook/Bearer Secret, либо DSH `connection` | Внутренний API отправки текстовых сообщений |
| `/dsh-messenger-gateway/messenger/progress` | `POST` | Loopback (`127.0.0.1` / `::1`), либо Webhook/Bearer Secret, либо DSH `connection` | Внутренний API отправки промежуточного прогресса |
| `/dsh-messenger-gateway/messenger/ask` | `POST` | Loopback (`127.0.0.1` / `::1`), либо Webhook/Bearer Secret, либо DSH `connection` | Внутренний API интерактивных вопросов с кнопками |

> **Правило изоляции (Fail-Closed, #157)**: Доступ к административным маршрутам (настройки, статус, сопряжение, smoke-тесты) разрешён исключительно:
> 1. С локального хоста (Loopback `127.0.0.1` / `::1`);
> 2. При наличии валидного секретного токена `webhooks.secret` (`Authorization: Bearer <secret>` или `x-webhook-secret: <secret>`);
> 3. От авторизованной браузерной сессии DSH Web UI (валидация через сервис ядра `connection.requestRejection(req) === undefined` с проверкой `same-origin`).
>
> Нахождение клиента в локальной подсети (RFC 1918) само по себе **НЕ** является аутентификацией. Любые неаутентифицированные сетевые запросы (как из WAN, так и из LAN) без секрета или сессии DSH блокируются с кодом `403 Forbidden` (`401 Unauthorized`). Маршруты отправки сообщений (`/messenger/*`) и приёма внешних событий (`/events`) строго защищены и недоступны анонимным клиентам.

---

## 8. Что публикуется (Publishing Boundaries)

- **npm Package (`@goodandready/dsh-messenger-gateway`)**:
  - Включается строго по списку `package.json#files`:
    - `lib/` (скомпилированный и исходный JavaScript-код шлюза и адаптеров);
    - `cordis.patch.yml` (манифест инъекций зависимостей Cordis);
    - `README.md`, `README.ru.md`, `README.zh.md` (каноническая публичная документация);
    - `LICENSE` (MIT лицензия).
  - Исключено: `docs/**`, `test/**`, `scripts/**`, `AGENTS.md`, `index.md`, `.worktrees/**`, временные файлы.
- **GitHub Repository (`GooDAnDReaDY/dsh-messenger-gateway`)**:
  - Публичное зеркало синхронизируется через `scripts/publish-github.sh`.
  - Включает публичные файлы, манифесты и `CHANGELOG.md`.
  - Исключено: внутренняя проектная документация `docs/**`, служебные скрипты разработки, артефакты среды агентов.
- **Gitea Repository (Source of Truth)**:
  - Полное дерево проекта: включая `docs/design/DESIGN.md`, `docs/index.md`, `AGENTS.md`, тесты, историю веток и worktrees.

---

## 9. Do / Don't
- **Do**:
  - Использовать нативные дизайн-токены DSH `--dsw-alias-*`.
  - Поддерживать бесшовную работу как в Dark, так и в Light теме.
  - Проверять валидность и каноничность путей перед чтением/записью файлов воркспейса.
  - Обеспечивать таймауты (`AbortSignal.timeout`) для всех сетевых вызовов `fetch`.
  - Использовать атомарную запись файлов кэша и конфигурации.
- **Don't**:
  - Доверять заголовкам `Host`, `Origin` или `Referer` для авторизации запросов вне loopback.
  - Блокировать Event Loop длительными синхронными операциями чтения больших документов.
  - Встраивать русские строки непосредственно в код ядра (переводы DSH интерфейса поставляются плагином `dsh-russian-lang`).
  - Публиковать внутренние документы `docs/**` в открытый npm-пакет.

---

## 10. Locked Design Decisions
- **2026-10-26**: Сквозная передача слэш-команд агенту и асинхронная регистрация динамических навыков (#161, #162, GitHub #7, #8):
  - Метод `collectDynamicSkills(ctx)` сделан асинхронным и ожидает Promise от `skillsService.list()`, устраняя silent TypeError и гарантируя регистрацию установленных навыков в Telegram autocomplete.
  - Фильтрация навыков проверяет `s.invocation?.userInvocable === false` в соответствии с контрактом `@deepseek-ai/dsh-skill`.
  - Введена утилита `truncateSafe(str, maxLen)` с лимитом 80 символов на описание навыка: предотвращает расщепление суррогатных пар UTF-16 (`!str.isWellFormed()`) и исчерпание суммарного лимита символов Telegram Bot API `setMyCommands` (~5,000 символов, ошибка `BOT_COMMANDS_TOO_MUCH`).
  - Нераспознанные встроенным шлюзом слэш-команды больше не блокируются ошибкой `msg.unknown_command`, а возвращают `{ forwardToAgent: true }`. Шлюз нормализует групповой тег бота (например, `/compact@BotName` -> `/compact`) и передаёт команду в рабочий цикл агента (`runTurn`), позволяя пользователям напрямую запускать DSH runtime-команды (`/compact`, `/goal`) и зарегистрированные навыки через мессенджер.
- **2026-10-23**: Реализована настройка рабочей директории `agent.cwd` в UI карточке настроек и автоматическая привязка сессий шлюза к workspace DSH (#159, GitHub #6):
  - Поле `agent.cwd` доступно в секции «Agent & reasoning behaviour» с подсказкой эффективного пути (`process.cwd()`), переводами (EN/RU/ZH) и предупреждением об ошибках при указании несуществующего пути.
  - При создании сессии шлюза (`createChat`) она автоматически регистрируется в соответствующем Workspace DSH (через сервис `ctx.workspaceRegistry` либо через атомарную запись в `~/.dsh/storages/workspace.json`), предотвращая попадание диалогов в категорию «未分组» (Без группы / Ungrouped).
  - Добавлена чат-команда `/cwd` для просмотра текущей рабочей директории диалога и источника её настройки.
- **2026-10-21**: Устранена уязвимость неавторизованного доступа из локальной сети (#157): LAN RFC 1918 remote адрес больше не является достаточным условием доверия. Все административные и управляющие маршруты требуют валидный webhook/bearer secret, локальный loopback либо подтверждённую сессию DSH ядра `connection.requestRejection`. Неаутентифицированные LAN/WAN запросы блокируются (fail-closed 403).
- **2026-10-15**: Добавлена поддержка браузеров из локальной сети (RFC 1918 / ULA) для карточки настроек, сопряжения и smoke-тестов с защитой от CSRF и спуфинга. Закрыта утечка метаданных на GET /status и GET /config для неавторизованных WAN-клиентов (#143).
- **2026-10-13**: Внедрена поддержка прокси (HTTP, HTTPS, SOCKS5) через dynamic `undici.ProxyAgent` dispatcher и кастомного `apiRoot` базового URL для Telegram адаптера (#142).
- **2026-10-09**: Реализовано динамическое определение `internalBaseURL` из `ctx.webServer.port` хоста (поддержка динамических OS-assigned портов DSH Desktop) с fallback на `http://127.0.0.1:3080` (#137).
- **2026-10-07**: Закрыта уязвимость LAN-обхода настроек: строгая проверка `isTrustedSettingsRequest` по `remoteAddress` loopback (`127.0.0.1` / `::1`) без доверия заголовкам хоста (#128).
- **2026-10-07**: Реализована динамическая перерегистрация маршрута `/dsh-messenger-gateway/telegram/webhook` на лету при изменении `telegram.webhookPath` без перезапуска ядра DSH (#129).
- **2026-10-07**: Внедрена распаковка Cordis `Volatile` боксов перед сохранением конфигурации в `settings-bridge`, исключающая ошибки `DataCloneError` (#111).
- **2026-10-07**: Добавлена атомарная запись кэша персон через временные файлы и `renameSync` во избежание повреждения файлов (#121).
- **2026-10-07**: Внедрены строгие таймауты `AbortSignal` для всех исходящих сетевых вызовов в UI-клиенте (`lib/client.js`) и для загрузки изображений (#132, #123).
- **2026-09-02**: Интегрирована поддержка Forum Topics 2.0 с автоматической маршрутизацией сессий по топикам супергрупп Telegram.
