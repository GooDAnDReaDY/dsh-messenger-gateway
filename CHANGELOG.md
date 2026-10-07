# Changelog

## 0.4.13

### Documentation & Standards
- **Mandatory Project Design Contract (`docs/design/DESIGN.md`, #130):** Created comprehensive design contract adhering to `project-design-contract` and `dsh-documentation-standard`, documenting user surfaces (Web UI, DSH slot `settings.plugin.item`, REST API), visual direction, design tokens, component states, user flows, route security policy (Loopback vs Webhook Secret), publishing boundaries, and locked architectural decisions.
- **DEV Project Structure & Deployment Runner (`index.md`, `deploy.sh`, `AGENTS.md`, `docs/index.md`, #131):** Created root project index `index.md`, internal documentation index `docs/index.md`, project-level developer contract `AGENTS.md`, and automated production deployment runner `deploy.sh` (`dsh plugin --profile web add`, restart `dsh-web.service`, verify `/status`). Adjusted `.gitignore` to track DEV documentation in Git/Gitea while isolating npm/GitHub packages.

## 0.4.12

### Configuration, Routing & Client Hardening
- **Add `defaultLocale` to Config Schema (`lib/config.js`, #124):** Added `defaultLocale: z.union([z.const('en'), z.const('zh')]).default('en')` to `PluginConfig`, ensuring the field is recognized, validated, and defaulted properly in schema declarations.
- **Support Direct & Wrapped Host Lifecycle/Skill Events (`lib/gateway.js`, `lib/index.js`, `lib/stream.js`, #125):** Added comprehensive listeners for `session/event`, `turn/end`, `turn/start`, `assistant/message`, `assistant/chunk`, and `skills/*` (`skills/change`, `skills/updated`, `skills/update`), with centralized lifecycle disposal and safe filtering of non-text chunk types (such as `reasoning-delta`).
- **Dynamic Webhook Route Re-registration (`lib/index.js`, #129):** Replaced static startup route registration with dynamic lifecycle-managed route synchronization (`syncWebhookRoute`), unregistering stale endpoints and registering new ones whenever `telegram.webhookPath` changes in runtime settings without requiring DSH restart.
- **Client Fetch Network Timeouts (`lib/client.js`, #132):** Added `AbortSignal` with explicit timeout (10s default) to all browser client HTTP `fetch` calls (`status`, `smoke`, `pairing`, `update`), preventing pending requests from hanging indefinitely on network degradation.

## 0.4.11

### Fixed & Robustness
- **Unwrap Volatile Boxes Before Persisting to Settings Service (`lib/settings-bridge.js`, #111):** Applied `resolveConfig(next)` in `persist` to unwrap Cordis `Volatile` boxes into plain JSON values before handing them to the host settings service, preventing `DataCloneError` or malformed config persistence.
- **Respect Ecosystem Quarantine in Updater (`lib/updater.js`, #112, #126):** Removed `--config.minimumReleaseAge=0` argument from `installExact` in the plugin auto-updater to adhere to ecosystem release quarantine standards.
- **Bounded Document Text Ingestion (`lib/documents.js`, #116):** Replaced unbounded full-file reads with bounded file descriptor reads (`Math.min(st.size, maxBytes)`) and safety caps on binary documents, preventing out-of-memory crashes on oversized files.
- **Validate Tasks Array Structure on Load (`lib/scheduler.js`, #117):** Added strict `Array.isArray` validation on loaded scheduler JSON with loud warnings and fallback to an empty task list, preventing tick loops from throwing or stalling silently.
- **Normalize and Validate File Bytes from JSON Payloads (`lib/messenger-api.js`, #118):** Ensured incoming `file.bytes` is properly validated and converted to a native `Buffer` (supporting byte arrays, Uint8Arrays, and base64), rejecting plain invalid objects with 400 Bad Request to prevent `Blob([file.bytes])` stringification to `"[object Object]"`.
- **Atomic Persona Cache Writes (`lib/storage-atomic.js`, `lib/personas.js`, #121):** Replaced direct `writeFileSync` with `writeJsonAtomicSync` (temporary file and atomic rename) to prevent file corruption during concurrent persona modifications.
- **Safe Options Array Flattening (`lib/ask.js`, #122):** Replaced unbounded argument spread `[].concat(...options)` with `options.flat()` and fallback `reduce`, preventing `RangeError: Maximum call stack size exceeded` on large caller arrays.
- **Fetch Timeout and Body Size Cap for Outbound Images (`lib/outbound.js`, #123):** Added `AbortSignal.timeout(15000)` and 20 MB size limits (via `content-length` check and streaming chunk reader) on internal image fetches in `fetchInternalImage`.

## 0.4.10

### Security
- **Enforce Loopback Address on Trusted Settings Requests (`lib/http.js`, `lib/index.js`, #128):** Prevented LAN clients with forged `Origin`/`Referer` matching `Host` from accessing administrative routes (`/config`, `/smoke`, `/pairing/*`, and messenger API). Remote connections now strictly require valid webhook bearer secret authentication or loopback interface.
- **HTML Injection Mitigation in Telegram Messages (`lib/locales/index.js`, #119):** Added automatic HTML entity escaping (`escapeHtml`) in `t()` parameter substitution so user/model-supplied dynamic strings (prompts, commands, paths, errors) cannot inject malicious tags or trigger Telegram API 400 Bad Request errors.
- **URL Scheme Allowlist for Markdown Links (`lib/telegram-format.js`, #120):** Restricted anchor `href` attributes to safe protocols (`https:`, `http:`, `tg:`). Disallowed URI schemes such as `javascript:`, `file:`, and `data:` are rendered as escaped text.
- **Symlink Traversal Prevention in Workspace File Manager (`lib/file-manager.js`, #115):** Enforced physical canonical path resolution (`realpathSync`) and ancestor verification in `resolveSafePath`, preventing symlinks created inside the workspace from escaping and accessing host files via `/files` and `/get`.

## 0.4.9

### Fixed
- **Normalize Volatile Fields and Prevent DataCloneError (`lib/index.js`, #106):** Unwrapped Cordis `Volatile` boxes using `plainConfig()` before calling `structuredClone(config)` during plugin activation in `apply()`. Normalized raw configuration in `resolveConfig()` before passing to schemastery to avoid `ValidationError` on live volatile box objects.
- **Settings and Volatile Update Subscriptions (`lib/settings-bridge.js`, #106):** Subscribed to Cordis `loader/volatile-update`, `internal/update`, `app-boot/config-reload`, and `settings/document-updated` in `setupSettings()`, ensuring that live settings updates applied via the UI or Loader take effect immediately without requiring a full harness restart.

## 0.4.7

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

## 0.4.6

### Security
- **Bounded Request Body Buffering (`lib/http.js`, `lib/index.js`, #103):** Enforced strict payload size limits on `readBody` (default 256 KB, max 10 MB) rejecting oversized requests with HTTP 413, and validated authentication headers before body buffering on webhook routes.
- **Fail-Closed Authorization on Internal Write Routes (`lib/http.js`, `lib/index.js`, #102):** Replaced spoofable IP header heuristics with true loopback socket checking, hardened same-origin validation against host spoofing, and added `isAuthorizedMessengerRequest` requiring local caller or bearer authentication on `/messenger/send`, `/messenger/progress`, and `/messenger/ask`.

### Fixed
- **DSH 0.1.7 Settings Service Contract Migration (`lib/settings-bridge.js`, `lib/index.js`, #101):** Migrated settings lifecycle to the current DSH 0.1.7 contract (`configure`, `describe`, `replace`, `update`, `mutate`) via a dedicated settings bridge, preserving fallback compatibility for legacy `settings.register`.
- **Telegram API Error Logging and Health Tracking (`lib/gateway.js`, `lib/gateway-turn.js`, `lib/stream.js`, `lib/scheduler.js`, #76):** Replaced empty catch handlers across gateway turns, stream schedulers, background alerts, and cron tasks with debug logging and `recordApiFailure` health metric tracking.
- **Package Files Allowlist Includes Localized README Trio (`package.json`, #104):** Added `README.ru.md` and `README.zh.md` to package files allowlist so published npm bundles contain all localized documentation.

## 0.4.5

### Fixed
- **Telegram reply markup resolution (`lib/adapters/telegram.js`, #89):** Resolved `ReferenceError` when sending formatted messages with `quickActions` enabled by importing `buildQuickActionsKeyboard` and `REMOVE_REPLY_KEYBOARD`.
- **Model picker selection callback (`lib/gateway-callbacks.js`, #90):** Resolved `ReferenceError: getStoredModelSelection is not defined` when applying model picker callbacks.
- **Forum mirror context references (`lib/forum-mirror.js`, #91):** Fixed undeclared `ctx` and `gw` references in dynamic skill sync and forum topic mirroring.
- **Gateway commands dependencies (`lib/gateway-commands.js`, #92):** Imported path helpers and `ensureContentArray` preventing `ReferenceError` in `/update` and `/fork` command handlers.
- **Settings API same-origin validation (`lib/http.js`, #93):** Supported `sec-fetch-site: same-origin` and matching `referer` in `isTrustedSettingsRequest` so legitimate browser settings GET requests succeed.
- **Web UI Icon and context fallback (`lib/client.js`, #94):** Safely resolved `PluginCard` context to avoid undeclared global references and dynamically queried host `IconChevronDownOutline14`.
- **Webhook event authentication (`lib/index.js`, #97):** Enforced fail-closed authentication on `POST /dsh-messenger-gateway/events` using `timingSafeCompare`, rejecting unauthenticated requests when webhook secret is unconfigured.

### Performance
- **Gateway thread mapping cleanup (`lib/gateway.js`, #95):** Pruned `sessionToThread` and `threadToSession` mapping entries in `reapIdle` alongside inactive chats to prevent gradual memory leak.
- **Model catalog caching (`lib/models.js`, #96):** Added in-memory TTL caching for provider and model listings to prevent Telegram inline keyboard pagination latency.

## 0.4.4

### Fixed
- **Core session/event listener and homes resolution (`lib/gateway.js`, #88):** Added missing imports for `assistantText`, `collectAssistantParts`, `extractTextDelta`, `extractToolName`, and `listHomes`. Cleaned up dead imports leftover after modular decomposition.
- **Turn lifecycle inbound and outbound helpers (`lib/gateway-turn.js`, #87):** Added missing imports for `attachInboundPhoto`, `photoOnlyHint`, `readFile`, `transcribeVoice`, `stripImageUrls`, and `buildOutboundFiles` preventing runtime `ReferenceError` during photo/voice handling and reply delivery.

## 0.4.3

### Fixed
- Settings no longer wait on the removed settingsScope service. The client uses configForms (#98).

## 0.4.2

### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item` — that is how `dsh-agentrouter` and
  `dsh-agent-orchestrator` show their settings. The view-aware card is now registered
  there too (`id: 'dsh-messenger-gateway'`, order 60, static label); the row seat and
  the legacy `settings.plugin.item` card stay as fallbacks.

## 0.4.1

### Added

- **Settings open on the plugin's own page.** The client registers the settings
  surface into the Plugins page row seat, `plugins.row.config`, keyed
  `@goodandready/dsh-messenger-gateway#dsh-messenger-gateway`: the plugin's row
  gains a configure control whose page is the settings form (`view: 'page'`,
  rendered bare — the host page draws the title, icon, crumb and padding), with a
  one-line description under the title (`view: 'summary'`). The legacy
  `settings.plugin.item` seat stays as a fallback, newest first: the current core
  no longer renders that slot at all (#82).

### Changed

- `test/settings-scope-authoring.test.mjs` guards the new seat: row key, seat
  order, bare page render (no card wrapper) and the absence of a duplicate
  `settings.section`.

## 0.4.0

Modular Architecture Decomposition, Webhook Security, Telegram API Health Diagnostics, and DSH Theme Parity (#69, #70, #71, #72, #73, #74, #75, #76, #77).

- **Modular Core Decomposition (`lib/gateway.js`, `lib/adapters/telegram.js`, #73):** Monolithic server modules decomposed to strictly comply with the project limit of < 600 lines per file:
  - `lib/adapters/telegram.js` reduced from 732 to 596 lines; inbound media extraction and API health probing extracted to `lib/adapters/telegram-inbound.js` (141 lines); keyboards and command structures centralized in `lib/commands.js`.
  - `lib/gateway.js` reduced from 1238 to 590 lines; command routing extracted to `lib/gateway-commands.js` (584 lines), callback queries to `lib/gateway-callbacks.js` (187 lines), turn lifecycle execution to `lib/gateway-turn.js` (285 lines), forum topic synchronization to `lib/forum-mirror.js` (105 lines), and interactive ask execution to `lib/ask.js` (203 lines).
  - Recorded browser module loader justification for `lib/client.js` in `docs/design/DESIGN.md`.
- **Telegram Webhook Security Hardening (`lib/adapters/telegram.js`, `lib/index.js`, `lib/client.js`, #69):** Mandatory secret token when `transport === 'webhook'`. Header `x-telegram-bot-api-secret-token` verified in constant time via `timingSafeCompare` (`crypto.timingSafeEqual`). Telegram adapter automatically passes `secret_token` to `setWebhook`. Added status indicator badge in WebUI (`Secret set` / `Secret required`).
- **Telegram API Failure Diagnostics & Health Tracking (`lib/api-health.js`, `lib/gateway.js`, `lib/client.js`, #76):** Introduced `ApiHealthTracker` recording consecutive API errors and last failure details. Replaced all 44 silent `catch` blocks with debug logging or explicit best-effort markers. Exposed `apiHealth` in `/dsh-messenger-gateway/status` and added a degraded API health badge in WebUI.
- **Full DSH Semantic Theme Styling (`lib/client.js`, #74):** Replaced all standalone `rgba(...)` and hex color literals in the WebUI with native DSH theme CSS variables (`--dsw-alias-state-*-bg`, `--dsw-alias-state-*-border`, `--dsw-alias-state-*-primary`). Added regression tests in `test/client-settings.test.mjs`.
- **Package Identity Synchronization (`lib/index.js`, `lib/client.js`, `cordis.patch.yml`, `package.json`, #70):** Synchronized package name strictly across all 4 canonical points (`@goodandready/dsh-messenger-gateway`). Added 4-way equality unit test `test/package-identity.test.mjs`.
- **Manifest Client Dependencies Declaration (`package.json`, #75):** Declared explicit host client injection dependencies (`@deepseek-ai/dsh-client-locale`, `@deepseek-ai/dsh-client-ui-slots`, `@deepseek-ai/dsh-client-ui-settings`) in `dsh.client.inject`.
- **Dead Code Cleanup & Document Limits (`lib/media.js`, `lib/adapters/telegram.js`, #77):** Removed dead `mediaKindOf` export; established `TELEGRAM_MAX_DOC_BYTES` (20 MB) as single source of truth across adapters and command handlers.
- **Repository Sanitization & Package Hygiene (#71, #72):** Untracked internal testing docs and index files from git tracking. Removed obsolete tarball artifacts. Verified clean npm package composition (98.3 kB tarball, 52 files, well below 256 KiB limit).
- **Test Suite Verification:** 209 unit and integration tests passing (`npm test`).


Plugin Self-Updater, Polling Backoff, Fetch Timeouts, Discord/Slack Settings Parity (#67).

- **Plugin Self-Updater (`lib/updater.js`):** In-app self-updater discovering DSH CLI (`@deepseek-ai/dsh`), comparing semver with 5-minute npmjs registry caching. Protected endpoint `/dsh-messenger-gateway/update` (GET status, POST update with loopback, same-origin, and `x-dsh-plugin-update: 1` validation).
- **Telegram Update Command (`lib/gateway.js`, `lib/commands.js`):** Interactive `/update` command (`/update check`, `/update now`) with `allowedUserIds` whitelist gating.
- **WebUI Updater & Messenger Settings Card (`lib/client.js`):** Dedicated Self-Updater section showing version status and one-click update button. Added full settings cards for Discord and Slack with `settingsScope` persistence.
- **Network Polling Backoff (`lib/adapters/telegram.js`):** Wired `computePollBackoffMs` on network errors and a 15-second backoff delay on HTTP 409 conflict to prevent spinning.
- **HTTP Fetch Timeouts & Keep-Alive (`lib/adapters/discord.js`, `lib/adapters/slack.js`):** Added `keepalive: true` and `AbortSignal.timeout(15000/30000)` to all Discord and Slack outbound API calls.
- **Memory Optimization (`lib/index.js`):** Prunes `turnStarts` Map entries older than 2 hours.
- **Unit Testing (`test/updater.test.mjs`):** Full test suite for semver parsing, comparison, request trust verification, and endpoint registration (199 total passing tests).

## 0.3.18

Unified dsh-clinebot visual style, Telegram diagnostics & comprehensive stabilization (#59).

- **Unified Visual Styling (lib/client.js):** Redesigned settings card following the dsh-clinebot / dsh-ui-design standard using native --dsw-alias-* tokens, section cards (.msgw-section-card), action buttons (.msgw-btn, .msgw-btn-primary), telemetry display, and responsive tables.
- **Client Error Boundary (lib/client.js):** Wrapped settings page and plugin card in a self-contained ErrorBoundary with a Retry action to prevent client host crashes.
- **Header Status Badges (lib/client.js):** Added live badges for Telegram bot status (@username and otId), token configuration state, active transport mode, and pending pairing requests.
- **Telegram Smoke & Latency Diagnostics (lib/adapters/telegram.js, lib/gateway.js, lib/index.js, lib/client.js):** Added server method probeHealth(), route POST /dsh-messenger-gateway/smoke, and interactive Smoke/Ping button in settings card measuring Telegram Bot API latency and connectivity.
- **Client Bundle Modernization (package.json):** Cleared legacy dsh.client.inject: [] per current DSH loader standard.
- **Expanded Test Coverage (	est/smoke-endpoint.test.mjs):** Added unit tests for Telegram probe health and smoke endpoint validation.

## 0.3.17

Client Locale Guard & Cordis Context Service Access Robustness (#57).

- **Client Locale Registration Guard (`lib/client.js`):** Wrapped dictionary registration in local `try/catch` with `console.warn` fallback, ensuring that duplicate registration (`already has locale`) on page reload never crashes `apply(ctx)` or unmounts the settings card (`settings.plugin.item`).
- **Context Service Access (`lib/index.js`, `lib/models.js`, `lib/gateway.js`, `lib/client.js`):** Replaced direct property reads on Cordis context with `ctx.get('...')` with fallback, ensuring reliable access across Cordis proxy boundaries for `llm`, `settings`, `tools`, `sessions`, `agents`, `webServer`, `attachments`, `locale`, and `settingsScope`.
- **Authoring Tests (`test/client-locale-guard.test.mjs`):** Added unit tests validating dictionary collision survival and `ctx.get()` proxy resolution.

## 0.3.16

Stability, polling backoff, safe rewind, abort cleanup and ask idempotency (#54).

- **Exponential Polling Backoff (`lib/telegram-errors.js`, `lib/adapters/telegram.js`):** Added capped exponential backoff on Telegram polling network errors.
- **Safe Session Rewind (`lib/session-ops.js`):** Atomic slice for session rewind.
- **Abort Controller Cleanup (`lib/gateway.js`):** Explicit abort of previous turn before new run.
- **Export Memory Optimization (`lib/session-ops.js`):** Raw buffer handling for exported history.
- **Ask Idempotency Guard (`lib/ask.js`):** Single-flight resolution for inline callback tokens.

## 0.3.15

Content Guard Normalization for DSH LLM Pipeline (#51).

- **Content Guard (`lib/content-guard.js`):** Safe array normalization `ensureContentArray` protecting `/fork`, steer, and `runTurn` from string content crash `content.some is not a function`.


Stability, Flood Control, Atomic Persistence and UX Polish (#48).

- **Atomic File Storage (`lib/storage-atomic.js`):** Implemented safe JSON atomic writes via temporary file and rename for `scheduler.js`, `pairing.js`, and `voice-prefs.js`, preventing state file corruption during host restarts or concurrent writes.
- **Telegram Flood Control & Guaranteed Final Delivery (`lib/stream.js`):** Enhanced `createEditScheduler` to parse and respect Telegram `429 Too Many Requests: retry after X` rate-limiting delays and guaranteed final turn message delivery on `flush()`.
- **Memory Leak Protection (`lib/gateway.js`):** Enabled a 24-hour default `idleTimeoutMs = 86400000` to periodically reap abandoned agent sessions and chat memory during long daemon uptimes.
- **Structured Help Command (`lib/gateway.js`):** Reorganized Telegram `/help` command output into clean functional groups (Dialog, Tools & Files, Settings, Access & Channels).
- **Design Contract Alignment (`docs/design/DESIGN.md`):** Updated design contract with locking decisions for atomic storage and stream resilience.

## 0.3.13

DSH Plugin Authoring Alignment: Settings via Reactive `settingsScope` and Dedicated Card Slot.

- **Reactive Settings (`lib/client.js`):** Migrated `MessengerSettingsForm` from HTTP REST bridge (`/dsh-messenger-gateway/config`) to native `ctx.settingsScope.bind({ namespace: NS })` with `useSyncExternalStore` snapshot lifecycle gating (`loading`, `unavailable`, `ready`).
- **Error Accumulation on Save:** Saves now persist all keys (`enabled`, `telegram`, `agent`, `media`, `tts`) via `scope.set()`, collecting and reporting any field-level failures rather than aborting prematurely.
- **Dedicated Plugin Settings Slot:** Removed legacy fallback registration into sidebar `settings.section`, mounting strictly in `settings.plugin.item` on the Plugins settings tab.
- **Design Contract (`docs/design/DESIGN.md`):** Added required project design contract documenting surfaces, states, and locked architectural decisions.

## 0.3.12

DSH 0.1.2-rc.1 Compatibility Fix.

- **Client Inject Cleanup (`package.json`):** Removed removed kernel client modules (`dsh-client-runtime`, `dsh-client-ui-slots`) from `dsh.client.inject` to prevent loader fiber failures on DSH 0.1.2-rc.1.

## 0.3.11

Security, Stability, Memory Leak Fixes & SVG Photo Handling.

- **Security (Callback Query Allowlist):** Enforced `isUserAllowed` on Telegram `callback_query` updates to prevent unauthorized users in group chats from triggering model switches or resolving tool ask prompts.
- **Security (Path Traversal Protection):** Hardened `resolveSafePath` against absolute and cross-drive path traversals on Windows and POSIX systems.
- **SVG Diagram Uploads:** Fixed Mermaid SVG diagrams to upload via `sendDocument` (`kind: 'document'`) instead of `sendPhoto`, preventing Telegram Bot API HTTP 400 rejection.
- **Gateway Polish:** Removed stale duplicate `/keyboard` handler; protected active turns (`chat.turnActive`) from premature idle reap in `reapIdle()`.
- **Link Formatting:** Fixed double HTML escaping of URL query parameters (`&` to `&amp;` instead of `&amp;amp;`).
- **Model Picker Robustness:** Supported provider IDs with colons during model pagination; deduplicated stored model tokens in memory.
- **Scheduler Pruning:** Added 7-day retention prune for completed and cancelled tasks in `scheduled.json`.
- **Network Timeouts:** Added explicit timeout signals to Telegram Bot API network requests to prevent hanging sockets.

## 0.3.10

Enforce Removal of Reply Keyboards When Quick Actions Is Disabled.

- **Explicit Keyboard Removal (`lib/adapters/telegram.js`):** Messages now default to sending `reply_markup: { remove_keyboard: true }` whenever `quickActions` is false and no inline keyboard is requested, ensuring stale reply keyboards are closed in client UI.
- **Commands Cleanup (`lib/gateway.js`):** Added explicit `remove_keyboard: true` to `/start` command response.
- **Webhook Events (`lib/index.js`):** Supported forwarding `replyMarkup` from request body in `POST /dsh-messenger-gateway/events`.

## 0.3.9

Interactive 2-Step Model Picker, Voice Summary, Forum Topics, System Resources & Keyboard Fix.

- **Interactive 2-Step Model Picker (`/model`):**
  - Step 1: Inline buttons list connected LLM providers (`ctx.llm.listProviders()`).
  - Step 2: Available models for chosen provider shown with 10 models per screen, pagination (`⬅️`, `➡️`), and `[ 🔙 Назад к провайдерам ]`.
  - One-click model switching saved to `agentDefaultModel` and gateway configuration.
- **Reply Keyboard Fix:**
  - `quickActions` now defaults to `false` (no unsolicited keyboard popups).
  - Removed `is_persistent: true` to prevent keyboard from locking open below input.
  - `/keyboard off` sends `remove_keyboard: true` to clear stale keyboards immediately.
- **Voice Summary Mode (`/voice summary` and `tts.voiceSummary`):**
  - When enabled, spoken audio provides a concise 1-2 sentence TL;DR summary, while full text, code, and markdown output are delivered to the chat.
- **Forum Topics Creation (`/topic <name>`):**
  - Dedicated command for supergroups to create new Telegram forum topics via Bot API and automatically initialize a clean isolated agent session for the task.
- **System Resource Dashboard (`/top`):**
  - Reports live Node.js memory (RSS, Heap), process uptime, active sessions, scheduled reminders, and current model.

## 0.3.8

Multi-transport Adapters: Discord and Slack.

- **Discord Adapter (`lib/adapters/discord.js`):** Multi-transport adapter for Discord via Incoming Webhook and Discord REST API v10 (`/channels/{channel_id}/messages`). Supports text chunking (2000-character Discord limit) and file attachment uploads (`multipart/form-data`).
- **Slack Adapter (`lib/adapters/slack.js`):** Multi-transport adapter for Slack via Incoming Webhook and Slack Web API (`chat.postMessage`). Supports message chunking and thread replies (`thread_ts`).
- **Configuration Schemas (`lib/config.js`):** Added complete `discord` and `slack` configuration blocks (`enabled`, `botToken`, `webhookUrl`).
- **Adapter Factory (`lib/adapters/index.js`):** Wired Discord and Slack adapters into the gateway adapter registry.

## 0.3.7

Scheduled Messages, Reminders & Inbound Webhook Events Dispatcher.

- **Reminders & Scheduler (`lib/scheduler.js`):** Persistent scheduler for timed messages and reminders (`scheduled.json`) with support for relative durations (`10s`, `15m`, `2h`, `1d`).
- **Command `/remind`:** Create reminders (`/remind 15m Call client`), list pending reminders (`/remind list`), and cancel by ID (`/remind cancel <id>`).
- **Inbound Webhook Events (`POST /dsh-messenger-gateway/events`):** HTTP endpoint for pushing messages and files into Telegram from external systems (CI/CD, GitHub/Gitea, cron jobs, alerts) with optional bearer/token authentication.

## 0.3.6

Admin Alert Channel for Errors, Pairing Requests and Gateway Status.

- **Alert Channel (`telegram.alerts`):** Dedicated Telegram channel/chat for immediate administrator alerts.
- **Pairing Alerts:** Instant alert upon unauthorized access attempts with user details and ready-to-run `/pair CODE` command.
- **Error Alerts:** Formatted alerts for agent turn errors, crashes, and background failures with session context.
- **Commands:** `/setalert` to configure the current chat as the alert channel; `/alert` to inspect status and `/alert test` to verify delivery.

## 0.3.5

File Manager in Telegram & Advanced Inbound Document Parsing.

- **/files [dir]:** Workspace file manager in Telegram with safe path resolution, file sizes, and directory tree navigation.
- **/get <path>:** Download and send files from the agent workspace directly to Telegram as documents.
- **Path Traversal Protection:** Strict sandboxing preventing directory traversal outside the configured agent workspace.
- **Advanced Document Parsing:** Inbound documents (PDF, DOCX, CSV/TSV, JSON, code & text files) are parsed and their content is cleanly injected into the agent context with truncation limits (`maxTextInjectBytes`).

## 0.3.4

Agent Superpowers: Roles & Personas, Tools Inspection, Fork, Markdown Export, Rewind.

- **/role / /persona:** Dynamic persona switching in chat (`coder`, `architect`, `reviewer`, `writer`, `translator`, `concise`) with persistent per-chat preference and `@role` tag dispatcher in group chats.
- **/skills / /tools:** Live inspection of active agent tools and descriptions.
- **/export:** Export full session dialogue history into a downloadable Markdown file (`.md`).
- **/rewind [N]:** Undo/rewind the last N conversation turns from the agent session context.
- **/fork:** Branch off the current chat context into a brand new independent DSH session while preserving message history.

## 0.3.3

Telegram UX, Multi-Select Ask Forms and Artifact Previews.

- **Reply Keyboard (Quick Actions):** Persistent/contextual quick actions menu in Telegram (`/new`, `/stop`, `/voice`, `/status`) with `/keyboard on|off` toggle command.
- **Multi-Select Ask Forms:** Support for interactive checkbox forms in `messenger_ask` with instant toggle callbacks without dropping wait state, pagination (`⬅️`, `1/N`, `➡️`), and `[ ✅ Готово ]` / `[ ❌ Отмена ]` actions.
- **Artifact & Diagram Previews:** Extraction and SVG card rendering of Mermaid diagrams (`graph`, `flowchart`, `sequenceDiagram`) as image attachments, and aligned monospace formatting for Markdown tables in Telegram HTML.
- **Web UI Settings:** Quick actions and artifact preview toggles in the plugin settings card.

## 0.3.2 (hotfix)

DSH alpha.2 migration: dropped removed `settingsNamespace` import from `@deepseek-ai/dsh-settings`.

- `lib/index.js`: `SETTINGS_NAMESPACE` is now a plain lowercase-hyphenated string `'dsh-messenger-gateway'`. alpha.2 `ctx.settings.register(ns, schema, opts)` accepts a string ns; `parseSettingsNamespace` validates `^[a-z][a-z0-9-]*$`.
- No other removed alpha.2 exports are used in this plugin (`installSettingsSection`, `deepEqualJson` — none imported).
- peerDependencies aligned to alpha.2: `@deepseek-ai/dsh-* ^0.1.2-alpha.2`, `schemastery ^3.18.2`, `cordis ^4.0.2`.
- No DSH-core changes, no cross-plugin dependency. Migration is local to this plugin.

### Verified on alpha.2 (isolated, nothing foreign touched)
- Module import on alpha.2 (dsh-settings 0.1.2-alpha.2, `settingsNamespace` removed): clean, no SyntaxError.
- Real alpha.2 `SettingsProvider` + cordis `Context`: `register('dsh-messenger-gateway', Config, {base})` accepted; `scope.get / watch / update / replace` resolve our `Config`.
- Tests: 100/100 (incl. `test/alpha2-migration.test.mjs` static smoke).
- Test server (MiniPC rc.2): install + `DSH_TEST_OK` + cleanup clean.
- Production profile updated to 0.3.2; plugin is NOT in the `failed to import` list on `dsh-web`.

### Blocked (separate issue)
Clean alpha.2 profile start is blocked by `goodandready/dsh-messenger-gateway#19`: 9 foreign plugins (better-sidebar, dsh-context, llm-ollama, etc.) still import removed alpha.2 exports. Out of scope here.

## 0.3.1

- Align `peerDependencies` to DSH `0.1.1-rc.2` (manifest accuracy, no behavior change)
- `/whoami` now also reports `chatId` / `threadId` in groups
- `/mute` / `/unmute`: suppress notify-bridge messages for a chat
- `/status` now shows delivery/error counters, polling-conflict flag, uptime
- `/tts on|off|status`: per-chat TTS override (takes precedence over global/user)

## 0.3.0

Telegram delivery hardening (learned from Hermes/OpenClaw/PicoClaw Telegram handling).

- Rich formatting: GFM tables → bullet groups, task lists (☑/☐), `<details>` → summary + body
- Smart network retry: resend-safe errors (connect/pool timeout, ECONNRESET, undici `not sent to telegram`) retried with backoff; ambiguous timeouts and 4xx/5xx not retried (no duplicate delivery)
- Polling conflict detection (409 from getUpdates) logged loudly
- Stale-topic recovery: `messenger_ask` aborts and releases callback keys on deleted thread/topic; progress sends skip silently
- Status indicator (opt-in): bot short description Online/Offline

## 0.2.0

First public feature release (npm / GitHub).

- Telegram long-poll and webhook
- Allowlist and pairing
- `sessionScope` user|chat, forum topics as sessions
- Steer / follow-ups while busy; `/stop` during turns
- Named homes (`/sethome`, `/home`)
- `messenger_ask` inline buttons
- Notify bridge to Telegram home
- Voice UX (`/voice`, `voiceMode`) + TTS path with ffmpeg → OGG/Opus voice notes
- Settings card on Plugins tab

Discord adapter remains unimplemented.

## 0.1.0

Initial npm placeholder / early package registration.
