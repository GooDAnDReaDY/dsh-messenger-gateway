# dsh-messenger-gateway design

## Сейчас: 0.1.x (ранний MVP)

Цель ближайших коммитов — рабочий Telegram-транспорт, без претензии на релиз 1.0.

### Уже в коде (0.1.0 → 0.1.1)
- Telegram long-poll, текст, команды
- Settings UI
- Черновик: голос/фото/документы, outbound, messenger HTTP, topics, TTS toggle

### Дальше по порядку (всё ещё 0.1.x)
1. Довести и smoke-тестить медиа (voice, photo, docs)
2. Исходящие вложения из tool results
3. messenger API (send/ask/progress) — проверить вживую
4. Инлайн-кнопки, топики, /stop

## 1.0 (далеко)
Полный roadmap п.4: Discord, очередь, прерывание, home channel, замена dsh-im-hub-media на prod.
Версию 1.0.0 не трогаем, пока не закрыт весь согласованный scope.
