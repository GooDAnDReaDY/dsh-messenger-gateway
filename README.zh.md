# 📦 @goodandready/dsh-messenger-gateway

<div align="center">

<h3>DeepSeek Harness Telegram 专属会话路由网关与语音条回复插件</h3>

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

## ⚡ 插件概览

**`dsh-messenger-gateway`** 提供 Telegram 与 DeepSeek Harness 独立会话的双向桥接，支持权限隔离与 TTS 语音消息回复。

```mermaid
graph LR
    TG[Telegram 对话] --> LongPoll[Long-poll / Webhook 监听层]
    LongPoll --> SessionRouter[会话与主目录隔离路由]
    SessionRouter --> Agent[DSH 智能体执行流]
    Agent --> TTS[TTS 引擎: 语音条合成]
    TTS --> TG
```

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
