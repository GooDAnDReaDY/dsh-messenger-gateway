import test from "node:test"
import assert from "node:assert/strict"
import { mkdirSync, writeFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  createTopicWorkspaceStore,
  inspectGitWorkspace,
  resolveEffectiveCwd,
} from "../lib/workspace.js"
import { handleGatewayCommand } from "../lib/gateway-commands.js"

test("createTopicWorkspaceStore persists and queries topic bindings", () => {
  const tmpFile = join(tmpdir(), `test-topic-ws-${Date.now()}.json`)
  try {
    const store = createTopicWorkspaceStore(tmpFile)
    assert.equal(store.get(100, 1), null)

    // Set topic 1
    store.set(100, 1, { path: "/tmp/project-a", role: "coder", worktree: true })
    const bound1 = store.get(100, 1)
    assert.equal(bound1.path, "/tmp/project-a")
    assert.equal(bound1.role, "coder")
    assert.equal(bound1.worktree, true)

    // Set chat-level default
    store.set(100, 0, { path: "/tmp/project-default" })
    // Query unset thread 2 -> falls back to chat-level
    const bound2 = store.get(100, 2)
    assert.equal(bound2.path, "/tmp/project-default")

    // List
    const list = store.list(100)
    assert.equal(list.length, 2)

    // Re-load from disk to verify atomic persistence
    const reloaded = createTopicWorkspaceStore(tmpFile)
    const reloadedBound1 = reloaded.get(100, 1)
    assert.equal(reloadedBound1.path, "/tmp/project-a")

    // Delete
    assert.equal(reloaded.delete(100, 1), true)
    assert.equal(reloaded.get(100, 1).path, "/tmp/project-default")
  } finally {
    try { rmSync(tmpFile, { force: true }) } catch {}
  }
})

test("inspectGitWorkspace detects git repositories and worktrees", () => {
  const tmpBase = join(tmpdir(), `test-git-${Date.now()}`)
  const repoDir = join(tmpBase, "main-repo")
  const worktreeDir = join(tmpBase, "worktree")
  const plainDir = join(tmpBase, "plain")

  mkdirSync(join(repoDir, ".git"), { recursive: true })
  mkdirSync(worktreeDir, { recursive: true })
  writeFileSync(join(worktreeDir, ".git"), "gitdir: /tmp/main-repo/.git/worktrees/wt1\n")
  mkdirSync(plainDir, { recursive: true })

  try {
    const gitMain = inspectGitWorkspace(repoDir)
    assert.equal(gitMain.isGit, true)
    assert.equal(gitMain.isWorktree, false)

    const gitWt = inspectGitWorkspace(worktreeDir)
    assert.equal(gitWt.isGit, true)
    assert.equal(gitWt.isWorktree, true)
    assert.equal(gitWt.gitdir, "/tmp/main-repo/.git/worktrees/wt1")

    const plain = inspectGitWorkspace(plainDir)
    assert.equal(plain.isGit, false)
    assert.equal(plain.isWorktree, false)
  } finally {
    try { rmSync(tmpBase, { recursive: true, force: true }) } catch {}
  }
})

test("handleGatewayCommand /project binds, inspects, and unbinds topic workspaces", async () => {
  const tmpWsFile = join(tmpdir(), `test-cmd-ws-${Date.now()}.json`)
  const targetDir = join(tmpdir(), `test-target-${Date.now()}`)
  mkdirSync(targetDir, { recursive: true })

  const topicStore = createTopicWorkspaceStore(tmpWsFile)
  const replies = []
  const mockGw = {
    topicWorkspaces: topicStore,
    personas: {
      set: () => {},
      get: () => "default",
    },
    chats: new Map(),
    config: { agent: { cwd: "/tmp" } },
    resolveLocale: () => "en",
    resolveEffectiveCwdFor(chatId, threadId) {
      const b = this.topicWorkspaces.get(chatId, threadId)
      return b?.path || this.config.agent.cwd
    },
    isUserAllowed: () => true,
    ctx: { logger: { debug: () => {}, warn: () => {} } },
  }

  const mockInput = {
    chatId: 500,
    threadId: 42,
    userId: 101,
    platform: "telegram",
    reply: (msg) => replies.push(msg),
  }

  try {
    // 1. Initial status -> not bound
    await handleGatewayCommand(mockGw, "500:42", "/project", mockInput)
    assert.match(replies.pop(), /Not bound to dedicated project/)

    // 2. Bind to target directory
    await handleGatewayCommand(mockGw, "500:42", `/project bind ${targetDir} coder`, mockInput)
    assert.match(replies.pop(), /Workspace bound to topic/)
    const bound = topicStore.get(500, 42)
    assert.equal(bound.path, targetDir)
    assert.equal(bound.role, "coder")

    // 3. /cwd reflects bound topic workspace
    await handleGatewayCommand(mockGw, "500:42", "/cwd", mockInput)
    assert.match(replies.pop(), /Topic binding:/)

    // 4. /project list lists the bound topic
    await handleGatewayCommand(mockGw, "500:42", "/project list", mockInput)
    assert.match(replies.pop(), /Topic #42/)

    // 5. /project unbind resets
    await handleGatewayCommand(mockGw, "500:42", "/project unbind", mockInput)
    assert.match(replies.pop(), /reverted to default workspace/)
    assert.equal(topicStore.get(500, 42), null)
  } finally {
    try { rmSync(tmpWsFile, { force: true }) } catch {}
    try { rmSync(targetDir, { recursive: true, force: true }) } catch {}
  }
})
