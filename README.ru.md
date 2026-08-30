# 📦 @goodandready/dsh-messenger-gateway

<div align="center">

<h3>Шлюз Telegram с изоляцией сессий, управлением агентом и голосовыми ответами</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-messenger-gateway"><img src="https://img.shields.io/npm/v/@goodandready/dsh-messenger-gateway.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/GooDAnDReaDY/dsh-messenger-gateway.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Обзор

**`dsh-messenger-gateway`** связывает чаты Telegram с изолированными сессиями DeepSeek Harness, поддерживает кнопки управления, изоляцию рабочих папок и голосовые ответы через TTS.

```mermaid
graph LR
    TG[Чат Telegram] --> LongPoll[Шлюз Long-poll / Webhook]
    LongPoll --> SessionRouter[Изоляция сессий и папок]
    SessionRouter --> Agent[Цикл работы агента DSH]
    Agent --> TTS[TTS: Синтез голосового ответа]
    TTS --> TG
```

---

## 📦 Быстрая установка

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

---

## 📄 Лицензия

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
