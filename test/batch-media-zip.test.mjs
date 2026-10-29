import test from "node:test"
import assert from "node:assert/strict"
import { writeFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import zlib from "node:zlib"
import {
  isSafeZipPath,
  extractZipEntries,
  formatZipSummary,
  parseDocument,
} from "../lib/documents.js"
import { TelegramAdapter } from "../lib/adapters/telegram.js"

function createMockZipBuffer(entries) {
  const localHeaders = []
  const cdHeaders = []
  let offset = 0

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8")
    const isDir = entry.name.endsWith("/")
    const rawData = Buffer.from(entry.content || "", "utf8")
    const compMethod = isDir || !entry.compress ? 0 : 8
    const compData = isDir ? Buffer.alloc(0) : (compMethod === 8 ? zlib.deflateRawSync(rawData) : rawData)

    const uncompSize = rawData.length
    const compSize = compData.length

    // Local Header (30 bytes + nameLen + data)
    const lh = Buffer.alloc(30 + nameBuf.length + compSize)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(0, 6)
    lh.writeUInt16LE(compMethod, 8)
    lh.writeUInt16LE(0, 10)
    lh.writeUInt16LE(0, 12)
    lh.writeUInt32LE(0, 14)
    lh.writeUInt32LE(compSize, 18)
    lh.writeUInt32LE(uncompSize, 22)
    lh.writeUInt16LE(nameBuf.length, 26)
    lh.writeUInt16LE(0, 28)
    nameBuf.copy(lh, 30)
    compData.copy(lh, 30 + nameBuf.length)

    // Central Directory Header (46 bytes + nameLen)
    const cd = Buffer.alloc(46 + nameBuf.length)
    cd.writeUInt32LE(0x02014b50, 0)
    cd.writeUInt16LE(20, 4)
    cd.writeUInt16LE(20, 6)
    cd.writeUInt16LE(0, 8)
    cd.writeUInt16LE(compMethod, 10)
    cd.writeUInt16LE(0, 12)
    cd.writeUInt16LE(0, 14)
    cd.writeUInt32LE(0, 16)
    cd.writeUInt32LE(compSize, 20)
    cd.writeUInt32LE(uncompSize, 24)
    cd.writeUInt16LE(nameBuf.length, 28)
    cd.writeUInt16LE(0, 30)
    cd.writeUInt16LE(0, 32)
    cd.writeUInt16LE(0, 34)
    cd.writeUInt16LE(0, 36)
    cd.writeUInt32LE(0, 38)
    cd.writeUInt32LE(offset, 42)
    nameBuf.copy(cd, 46)

    localHeaders.push(lh)
    cdHeaders.push(cd)
    offset += lh.length
  }

  const cdStart = offset
  const cdData = Buffer.concat(cdHeaders)
  const cdSize = cdData.length

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdStart, 16)
  eocd.writeUInt16LE(0, 20)

  return Buffer.concat([...localHeaders, cdData, eocd])
}

test("isSafeZipPath blocks path traversal and accepts safe relative paths", () => {
  assert.equal(isSafeZipPath("src/index.js"), true)
  assert.equal(isSafeZipPath("README.md"), true)
  assert.equal(isSafeZipPath("nested/dir/app.py"), true)

  assert.equal(isSafeZipPath("../passwd"), false)
  assert.equal(isSafeZipPath("src/../../secret.txt"), false)
  assert.equal(isSafeZipPath("/etc/hosts"), false)
  assert.equal(isSafeZipPath("C:\\boot.ini"), false)
  assert.equal(isSafeZipPath(""), false)
  assert.equal(isSafeZipPath(null), false)
})

test("extractZipEntries unpacks source files and filters out binaries, lockfiles and node_modules", () => {
  const entries = [
    { name: "src/index.js", content: "console.log('hi')", compress: true },
    { name: "README.md", content: "# Title", compress: false },
    { name: "package-lock.json", content: "{ lock: true }", compress: true },
    { name: "node_modules/dep/index.js", content: "export default 42", compress: true },
    { name: "image.png", content: "FAKE_PNG_BYTES", compress: false },
    { name: "binary.exe", content: "MZ_FAKE_EXE", compress: true },
  ]

  const zipBuf = createMockZipBuffer(entries)
  const result = extractZipEntries(zipBuf)

  assert.equal(result.totalInArchive, 6)
  assert.equal(result.entries.length, 2)
  assert.equal(result.entries[0].name, "src/index.js")
  assert.equal(result.entries[0].content, "console.log('hi')")
  assert.equal(result.entries[1].name, "README.md")
  assert.equal(result.entries[1].content, "# Title")
})

test("formatZipSummary produces clean file structure and code previews with truncation", () => {
  const extracted = {
    totalInArchive: 2,
    entries: [
      { name: "app.py", size: 25, content: "print('hello python!')" },
      { name: "notes.txt", size: 10, content: "some notes" },
    ],
  }

  const summary = formatZipSummary(extracted, 1000)
  assert.equal(summary.fileCount, 2)
  assert.equal(summary.truncated, false)
  assert.match(summary.text, /Archive structure \(2 text files extracted, 2 total entries\)/)
  assert.match(summary.text, /- app\.py \(25 B\)/)
  assert.match(summary.text, /--- File: app\.py ---/)
  assert.match(summary.text, /print\('hello python!'\)/)

  const truncatedSummary = formatZipSummary(extracted, 80)
  assert.equal(truncatedSummary.truncated, true)
  assert.match(truncatedSummary.text, /\[Archive ingestion truncated/)
})

test("parseDocument parses valid .zip file from disk", async () => {
  const zipBuf = createMockZipBuffer([
    { name: "hello.js", content: "export const x = 123;", compress: true },
  ])
  const tmpPath = join(tmpdir(), `test-zip-${Date.now()}.zip`)
  writeFileSync(tmpPath, zipBuf)

  try {
    const res = await parseDocument(tmpPath)
    assert.equal(res.parsed, true)
    assert.equal(res.type, "zip")
    assert.match(res.text, /hello\.js \(21 B\)/)
    assert.match(res.text, /export const x = 123;/)
  } finally {
    try { unlinkSync(tmpPath) } catch {}
  }
})

test("TelegramAdapter debounces media_group_id messages into single onMessage invocation", async () => {
  const receivedMessages = []
  const adapter = new TelegramAdapter({
    botToken: "123456:fake-token",
    mediaGroupDebounceMs: 50,
    onMessage: async (msg) => {
      receivedMessages.push(msg)
    },
  })

  adapter.downloadByFileId = async (fileId, prefix, ext) => {
    return { path: `/tmp/${prefix}-${fileId}${ext}`, bytes: Buffer.from("fake-img"), file: { file_path: "fake" } }
  }

  const groupId = "group_test_999"
  const baseMsg = {
    chat: { id: 1001, type: "private" },
    from: { id: 2002 },
    media_group_id: groupId,
  }

  await adapter.dispatchUpdate({
    message: { ...baseMsg, message_id: 11, photo: [{ file_id: "p1" }] },
  })
  await adapter.dispatchUpdate({
    message: { ...baseMsg, message_id: 12, photo: [{ file_id: "p2" }] },
  })
  await adapter.dispatchUpdate({
    message: { ...baseMsg, message_id: 13, caption: "Album caption", photo: [{ file_id: "p3" }] },
  })

  assert.equal(receivedMessages.length, 0)

  await new Promise((r) => setTimeout(r, 120))

  assert.equal(receivedMessages.length, 1)
  const batch = receivedMessages[0]
  assert.equal(batch.chatId, 1001)
  assert.equal(batch.userId, 2002)
  assert.equal(batch.text, "Album caption")
  assert.equal(batch.attachments.length, 3)
  assert.equal(batch.attachments[0].path, "/tmp/photo-p1.jpg")
  assert.equal(batch.attachments[1].path, "/tmp/photo-p2.jpg")
  assert.equal(batch.attachments[2].path, "/tmp/photo-p3.jpg")

  adapter.stop()
})

test("TelegramAdapter.stop clears active media group timers", () => {
  const adapter = new TelegramAdapter({
    botToken: "123456:fake-token",
    mediaGroupDebounceMs: 5000,
  })

  adapter.bufferMediaGroup({
    chat: { id: 555 },
    media_group_id: "pending_group",
  })

  assert.equal(adapter.mediaGroups.size, 1)
  adapter.stop()
  assert.equal(adapter.mediaGroups.size, 0)
})
