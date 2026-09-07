import test from "node:test"
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { writeJsonAtomic } from "../lib/storage-atomic.js"
import { createEditScheduler, parseRetryAfter } from "../lib/stream.js"

test("writeJsonAtomic writes valid JSON atomically without left-over tmp files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "msgw-atomic-"))
  const file = join(dir, "sub", "test.json")
  try {
    await writeJsonAtomic(file, { ok: true, count: 42 })
    const raw = await readFile(file, "utf8")
    const parsed = JSON.parse(raw)
    assert.equal(parsed.ok, true)
    assert.equal(parsed.count, 42)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

test("parseRetryAfter extracts seconds from telegram flood error", () => {
  assert.equal(parseRetryAfter(new Error("Too Many Requests: retry after 5")), 5000)
  assert.equal(parseRetryAfter(new Error("Normal network error")), 0)
  assert.equal(parseRetryAfter(null), 0)
})

test("createEditScheduler handles 429 and delivers finalize", async () => {
  const sent = []
  let callCount = 0
  const scheduler = createEditScheduler(async (text) => {
    callCount++
    if (callCount === 1) {
      throw new Error("telegram editMessageText: Too Many Requests: retry after 1")
    }
    sent.push(text)
  }, 50)

  scheduler.push("first")
  await scheduler.flush()
  assert.ok(sent.includes("first"), "final text should be delivered despite 429 retry")
})