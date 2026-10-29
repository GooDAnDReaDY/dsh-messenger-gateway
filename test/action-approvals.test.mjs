import test from "node:test"
import assert from "node:assert/strict"
import {
  isSensitiveTool,
  formatApprovalCard,
  answerApproval,
} from "../lib/gateway-turn.js"

test("isSensitiveTool detects mutation and execution tools accurately", () => {
  // Sensitive tools
  assert.equal(isSensitiveTool("run_command"), true)
  assert.equal(isSensitiveTool("bash"), true)
  assert.equal(isSensitiveTool("exec"), true)
  assert.equal(isSensitiveTool("terminal_run"), true)
  assert.equal(isSensitiveTool("write_file"), true)
  assert.equal(isSensitiveTool("edit_file"), true)
  assert.equal(isSensitiveTool("delete_file"), true)
  assert.equal(isSensitiveTool("git_push"), true)
  assert.equal(isSensitiveTool("git_commit"), true)
  assert.equal(isSensitiveTool("deploy_app"), true)
  assert.equal(isSensitiveTool("curl"), true)

  // Read-only / safe tools
  assert.equal(isSensitiveTool("read_file"), false)
  assert.equal(isSensitiveTool("list_files"), false)
  assert.equal(isSensitiveTool("search_web"), false)
  assert.equal(isSensitiveTool("read_resource"), false)
  assert.equal(isSensitiveTool("brain_recall"), false)
  assert.equal(isSensitiveTool(""), false)
  assert.equal(isSensitiveTool(null), false)
})

test("formatApprovalCard formats bash command execution cleanly", () => {
  const card = formatApprovalCard({
    toolName: "run_command",
    reason: "Install critical dependencies",
    input: { CommandLine: "npm install @cordis/core && npm test" },
  }, "en")

  assert.match(card, /Action Confirmation Required/)
  assert.match(card, /<code>run_command<\/code>/)
  assert.match(card, /<i>Install critical dependencies<\/i>/)
  assert.match(card, /<code class="language-bash">npm install @cordis\/core &amp;&amp; npm test<\/code>/)
})

test("formatApprovalCard formats file modifications with unified inline diff", () => {
  const card = formatApprovalCard({
    toolName: "edit_file",
    reason: "Fix null pointer in auth handler",
    input: {
      Path: "/src/auth.js",
      Target: "if (user.id) return user",
      Replacement: "if (user?.id) return user",
    },
  }, "en")

  assert.match(card, /<b>File:<\/b> <code>\/src\/auth.js<\/code>/)
  assert.match(card, /<code class="language-diff">--- a\/auth.js/)
  assert.match(card, /\+\+\+ b\/auth.js/)
  assert.match(card, /- if \(user\.id\) return user/)
  assert.match(card, /\+ if \(user\?\.id\) return user/)
})

test("formatApprovalCard formats file write with content preview", () => {
  const card = formatApprovalCard({
    toolName: "write_file",
    reason: "Create configuration file",
    input: {
      Path: "config.json",
      Content: "{\"port\": 8080, \"debug\": true}",
    },
  }, "en")

  assert.match(card, /<b>File:<\/b> <code>config.json<\/code>/)
  assert.match(card, /<code>\{"port": 8080, "debug": true\}<\/code>/)
})

test("answerApproval presents 4 action buttons and handles approve, trust, and deny", async () => {
  let askedOptions = null
  const fakeChat = {
    target: { platform: "telegram", chatId: 100, threadId: 0 },
    sessionAllowlist: new Set(),
  }
  const fakeGw = {
    tg: () => ({ approvalsEnabled: true, approvalsSensitivity: "mutations" }),
    chats: new Map([["chat-1", fakeChat]]),
    resolveLocale: () => "en",
    messengerAsk: async (target, opts, timeout) => {
      askedOptions = { target, opts, timeout }
      return { buttonId: "allow_once" }
    },
  }

  // 1. Approve
  const res1 = await answerApproval(fakeGw, "chat-1", {
    toolName: "run_command",
    input: { CommandLine: "ls" },
  })
  assert.equal(res1, "allowed-once")
  assert.ok(askedOptions)
  assert.equal(askedOptions.opts.buttons.length, 2)
  assert.equal(askedOptions.opts.buttons[0][0].id, "allow_once")
  assert.equal(askedOptions.opts.buttons[0][1].id, "deny")
  assert.equal(askedOptions.opts.buttons[1][0].id, "steer")
  assert.equal(askedOptions.opts.buttons[1][1].id, "allow_session")

  // 2. Allow session (Trust Session)
  fakeGw.messengerAsk = async () => ({ buttonId: "allow_session" })
  const res2 = await answerApproval(fakeGw, "chat-1", {
    toolName: "write_file",
    input: { Path: "a.txt", Content: "hi" },
  })
  assert.equal(res2, "allowed-once")
  assert.ok(fakeChat.sessionAllowlist.has("write_file"))

  // Subsequent call for write_file bypasses prompt
  let prompted = false
  fakeGw.messengerAsk = async () => { prompted = true; return { buttonId: "deny" } }
  const res3 = await answerApproval(fakeGw, "chat-1", { toolName: "write_file" })
  assert.equal(res3, "allowed-once")
  assert.equal(prompted, false)

  // 3. Deny
  const res4 = await answerApproval(fakeGw, "chat-1", { toolName: "delete_file" })
  assert.equal(res4, "rejected")
})

test("answerApproval handles steer / amend by prompting user and rejecting tool call", async () => {
  const sentMessages = []
  const fakeChat = {
    target: { platform: "telegram", chatId: 100, threadId: 0 },
    sessionAllowlist: new Set(),
  }
  const fakeGw = {
    tg: () => ({ approvalsEnabled: true, approvalsSensitivity: "mutations" }),
    chats: new Map([["chat-1", fakeChat]]),
    resolveLocale: () => "en",
    adapters: {
      telegram: {
        sendTo: async (chatId, payload, opts) => {
          sentMessages.push({ chatId, payload, opts })
        },
      },
    },
    messengerAsk: async () => ({ buttonId: "steer" }),
  }

  const res = await answerApproval(fakeGw, "chat-1", {
    toolName: "run_command",
    input: { CommandLine: "rm -rf /" },
  })

  assert.equal(res, "rejected")
  assert.equal(sentMessages.length, 1)
  assert.match(sentMessages[0].payload.text, /instructions or corrections/)
})

test("answerApproval auto-rejects on timeout (fail-closed)", async () => {
  const fakeChat = {
    target: { platform: "telegram", chatId: 100, threadId: 0 },
    sessionAllowlist: new Set(),
  }
  const fakeGw = {
    tg: () => ({ approvalsEnabled: true, approvalsSensitivity: "mutations" }),
    chats: new Map([["chat-1", fakeChat]]),
    resolveLocale: () => "en",
    messengerAsk: async () => null, // timed out or dismissed
  }

  const res = await answerApproval(fakeGw, "chat-1", {
    toolName: "run_command",
    input: { CommandLine: "deploy" },
  })

  assert.equal(res, "rejected")
})

test("answerApproval skips approval for read-only tools under mutations sensitivity", async () => {
  let asked = false
  const fakeChat = {
    target: { platform: "telegram", chatId: 100, threadId: 0 },
    sessionAllowlist: new Set(),
  }
  const fakeGw = {
    tg: () => ({ approvalsEnabled: true, approvalsSensitivity: "mutations" }),
    chats: new Map([["chat-1", fakeChat]]),
    resolveLocale: () => "en",
    messengerAsk: async () => { asked = true; return { buttonId: "deny" } },
  }

  const res = await answerApproval(fakeGw, "chat-1", {
    toolName: "read_file",
    input: { Path: "index.js" },
  })

  assert.equal(res, "allowed-once")
  assert.equal(asked, false, "read_file should not trigger approval prompt under mutations sensitivity")
})
