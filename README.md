# 📦 @goodandready/dsh-messenger-gateway

<div align="center">

[![npm version](https://img.shields.io/npm/v/@goodandready/dsh-messenger-gateway.svg?style=flat-square)](https://www.npmjs.com/package/@goodandready/dsh-messenger-gateway)
[![license](https://img.shields.io/github/license/GooDAnDReaDY/dsh-messenger-gateway.svg?style=flat-square)](LICENSE)
[![DSH Plugin](https://img.shields.io/badge/DSH-Plugin-6366f1.svg?style=flat-square)](https://github.com/topics/dsh-plugin)

**[ 🇬🇧 English ](#-english) • [ 🇷🇺 Русский ](#-русский) • [ 🇨🇳 中文 ](#-中文)**

</div>

---

<a name="-english"></a>
## 🇬🇧 English

Telegram messenger bridge for DeepSeek Harness: multi-session routing, active steering, home directory scoping, and TTS voice note replies.

### Features

- **Telegram Session Hub**: Link Telegram chats directly to isolated DSH agent sessions.
- **Voice Note Responses**: Converts agent answers into voice messages using the configured TTS engine.
- **Interactive Commands**: `/clear`, `/status`, `/model`, and steering prompts right from the messenger chat.
- **Workspace Scoping**: Restricts file operations to authorized user home directories.

### Install

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

---

<a name="-русский"></a>
<details open>
<summary><h2>🇷🇺 Русский (Полное руководство)</h2></summary>

Шлюз Telegram для DeepSeek Harness: маршрутизация сессий, управление агентом, изоляция домашних директорий и голосовые ответы через TTS.

### Возможности

- **Сессии Telegram**: привязка чатов мессенджера к изолированным сессиям агента DSH.
- **Голосовые ответы**: озвучивание ответов агента в виде голосовых сообщений через TTS.
- **Команды управления**: `/clear`, `/status`, `/model` и управление ходом мыслей из Telegram.
- **Безопасность директорий**: ограничение доступа рамками разрешенной домашней папки.

### Установка

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

</details>

---

<a name="-中文"></a>
<details>
<summary><h2>🇨🇳 中文 (完整技术文档)</h2></summary>

DeepSeek Harness Telegram 专属网关：支持独立会话路由、指令干预、主目录权限隔离及 TTS 语音条回复。

### 核心亮点

- **专属会话绑定**：将 Telegram 对话与 DSH 独立会话一一对应。
- **语音消息回复**：通过内置 TTS 引擎将智能体回复转换为自然语音条。
- **交互式指令集**：支持在 Telegram 中直接发送 `/clear`、`/status` 等控制指令。
- **目录权限防护**：严格限定文件操作于指定的工作区主目录。

### 安装方法

```bash
dsh plugin --profile web add @goodandready/dsh-messenger-gateway
```

</details>
