# dsh-messenger-gateway — versioning

## Правило версий

| Версия | Когда |
|--------|--------|
| **0.0.1, 0.0.2, 0.0.3…** | Каждая отдельная фича (один bump = одна фича) |
| **0.1.0** | Финальный релиз согласованного scope (замена hub на prod) |
| **1.0.0** | Когда-нибудь потом, не планируем сейчас |

## Журнал 0.0.x

| Ver | Фича | Статус |
|-----|------|--------|
| 0.0.1 | Скелет: Telegram text, Settings, команды | done |
| 0.0.2 | Черновик: media, outbound, messenger HTTP, topics, TTS toggle, /stop | done (unit tests) |
| 0.0.3 | Voice inbound via dsh-voice (signal, errors, unit test) | done (E2E smoke — с ботом) |
| 0.0.4 | Photo inbound + vision-bridge (attachInboundPhoto, maxImageBytes, photoOnlyHint) | done |
| 0.0.5 | Documents inbound (formatInboundDocument, documentOnlyHint) | done |
| 0.0.6 | Outbound tool attachments (nested images, URL fetch, stripImageUrls) | done |
| 0.0.7 | messenger API проверен | next |
| 0.0.8 | Inline keyboards (ask) | planned |
| … | Discord, prod swap | → 0.1.0 |

## Scope 0.1.0 (финал этой линии)

Всё из roadmap п.4 для Telegram, без Discord (Discord — после 0.1.0 или отдельной веткой 0.0.x).
