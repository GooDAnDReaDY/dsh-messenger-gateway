import { normalizeThreadId } from "./topics.js"

export function normalizeHomeName(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 32)
}

/** Legacy single home + named list → unified list. */
export function listHomes(tg = {}) {
  const out = []
  const seen = new Set()
  const push = (name, chatId, threadId) => {
    const n = normalizeHomeName(name) || "default"
    if (seen.has(n)) return
    if (chatId === undefined || chatId === null || String(chatId).trim() === "") return
    seen.add(n)
    out.push({ name: n, chatId, threadId: normalizeThreadId(threadId) })
  }
  const homes = Array.isArray(tg.homes) ? tg.homes : []
  for (const h of homes) {
    if (!h || typeof h !== "object") continue
    push(h.name || h.id, h.chatId, h.threadId)
  }
  // legacy fields as default if not already present
  if (tg.homeChatId !== undefined && tg.homeChatId !== null && String(tg.homeChatId).trim() !== "") {
    push("default", tg.homeChatId, tg.homeThreadId)
  }
  return out
}

export function resolveNamedHome(tg, nameOrTarget) {
  const homes = listHomes(tg)
  if (!homes.length) return null
  if (!nameOrTarget) return homes.find((h) => h.name === "default") || homes[0]
  if (typeof nameOrTarget === "object") {
    if (nameOrTarget.chatId != null && String(nameOrTarget.chatId).trim() !== "") {
      return {
        name: normalizeHomeName(nameOrTarget.name) || "custom",
        chatId: nameOrTarget.chatId,
        threadId: normalizeThreadId(nameOrTarget.threadId),
      }
    }
    nameOrTarget = nameOrTarget.name || nameOrTarget.home
  }
  const want = normalizeHomeName(nameOrTarget)
  return homes.find((h) => h.name === want) || null
}

export function upsertHome(tg, { name, chatId, threadId }) {
  const n = normalizeHomeName(name) || "default"
  const homes = listHomes(tg).filter((h) => h.name !== n)
  homes.push({ name: n, chatId, threadId: normalizeThreadId(threadId) })
  const next = { ...tg, homes }
  if (n === "default") {
    next.homeChatId = chatId
    next.homeThreadId = normalizeThreadId(threadId)
  }
  return next
}
