# 📦 @goodandready/dsh-messenger-gateway

<div align="center">

<h3>DeepSeek Harness Telegram 专属网关（支持交互按钮调度、论坛话题隔离与语音条回复）</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-messenger-gateway"><img src="https://img.shields.io/npm/v/@goodandready/dsh-messenger-gateway.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/作者全部项目-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="作者全部项目"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ 插件概览

**`dsh-messenger-gateway`** 为 **DeepSeek Harness** 智能体提供企业级 Telegram 接入桥梁。

除常规对话转发外，本插件全面打通了智能体深度交互能力：**问答交互式内联按钮 (Inline Keyboard)**、**Telegram 论坛话题 (Forum Topics) 独立会话隔离**、**单用户工作区目录安全隔离**、**6 位配对码鉴权防护**以及**语音条朗读回复 (TTS)**。

```mermaid
graph LR
    subgraph TelegramClient [Telegram 客户端 / 群组 / 话题]
        User[👤 用户 / 论坛话题] --> TG[Telegram Bot API 轮询 / Webhook]
    end

    subgraph GatewayCore [网关调度核心]
        TG --> Auth{配对码与权限校验}
        Auth -->|已配对用户| Router{话题与目录路由器}
        Router --> Home[独立工作目录: /homes/user_id]
        Home --> Thread[DSH 隔离会话上下文]
    end

    subgraph AgentLoop [DSH 智能体执行流]
        Thread --> Agent[智能体逻辑流]
        Agent -->|ask_question 工具调用| Ask[Telegram 原生内联交互按钮]
        Agent -->|语音回复合成| TTS[TTS 语音条消息下发]
    end

    subgraph Feedback [交互下发]
        Ask --> TG
        TTS --> TG
    end

    style TelegramClient fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style GatewayCore fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style AgentLoop fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style Feedback fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## 📦 安装指南

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

---

## 📄 开源协议

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
