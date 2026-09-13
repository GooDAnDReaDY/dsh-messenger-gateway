import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const BUILTIN_PERSONAS = {
  default: {
    id: 'default',
    name: 'Default',
    icon: '🤖',
    description: 'General assistant, concise and balanced',
    instruction: '',
  },
  coder: {
    id: 'coder',
    name: 'Senior Developer',
    icon: '💻',
    description: 'Senior developer: clean code, architecture, minimum fluff',
    instruction: 'You are an expert senior software engineer. Provide high-quality, production-ready code with best practices, proper error handling, and concise explanations.',
  },
  architect: {
    id: 'architect',
    name: 'System Architect',
    icon: '📐',
    description: 'System architect: design, scalability, modularity and trade-offs',
    instruction: 'You are a principal system architect. Focus on high-level architecture, scalability, security, trade-offs, modular design, and clear diagrams.',
  },
  reviewer: {
    id: 'reviewer',
    name: 'Code Reviewer',
    icon: '🔍',
    description: 'Rigorous code reviewer: edge cases, security and maintainability',
    instruction: 'You are a meticulous code reviewer. Analyze code for bugs, edge cases, security vulnerabilities, performance bottlenecks, and maintainability.',
  },
  writer: {
    id: 'writer',
    name: 'Tech Writer',
    icon: '📝',
    description: 'Technical writer: clear text, structure and thorough docs',
    instruction: 'You are a professional technical writer and editor. Structure information clearly with clean formatting, intuitive language, and thorough documentation.',
  },
  translator: {
    id: 'translator',
    name: 'Translator',
    icon: '🌐',
    description: 'Translator: accurate translation with technical terminology preserved',
    instruction: 'You are an expert translator and localization specialist. Translate accurately while preserving technical context, nuance, and terminology.',
  },
  concise: {
    id: 'concise',
    name: 'Concise',
    icon: '⚡',
    description: 'Ultra-concise mode: direct, dense answers without filler',
    instruction: 'Be extremely concise. Answer directly in 1-3 sentences or short bullet points without unnecessary filler or pleasantries.',
  },
  analyst: {
    id: 'analyst',
    name: 'Analyst',
    icon: '📊',
    description: 'Data & business analyst: decomposition, metrics and logic',
    instruction: 'You are a senior data and systems analyst. Focus on structured problem breakdown, data interpretation, metrics, and methodical decision making.',
  },
}

export function getPersona(id) {
  if (!id) return BUILTIN_PERSONAS.default
  const clean = String(id).toLowerCase().trim()
  return BUILTIN_PERSONAS[clean] || null
}

export function listPersonas() {
  return Object.values(BUILTIN_PERSONAS)
}

export function createPersonaStore(filePath) {
  let cache = { personas: {}, presets: {} }
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf8'))
    if (raw && typeof raw === 'object') {
      if (raw.personas || raw.presets) {
        cache = { personas: raw.personas || {}, presets: raw.presets || {} }
      } else {
        cache = { personas: raw, presets: {} }
      }
    }
  } catch {}

  function save() {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf8')
    } catch {}
  }

  function makeKey(chatId, threadId = 0) {
    const tid = Number(threadId) || 0
    return tid > 0 ? `${chatId}:${tid}` : String(chatId)
  }

  return {
    get(chatId, threadId = 0) {
      if (chatId === undefined || chatId === null) return 'default'
      const key = makeKey(chatId, threadId)
      if (cache.personas[key]) return cache.personas[key]
      // Fallback to chat-level persona if in thread
      const baseKey = String(chatId)
      return cache.personas[baseKey] || 'default'
    },
    set(chatId, personaId, threadId = 0) {
      if (chatId === undefined || chatId === null) return
      const key = makeKey(chatId, threadId)
      const valid = getPersona(personaId)
      if (valid && valid.id !== 'default') {
        cache.personas[key] = valid.id
      } else {
        delete cache.personas[key]
      }
      save()
    },
    getPersonaForChat(chatId, threadId = 0) {
      return this.get(chatId, threadId)
    },
    getPreset(chatId, threadId = 0) {
      if (chatId === undefined || chatId === null) return null
      const key = makeKey(chatId, threadId)
      if (cache.presets[key]) return cache.presets[key]
      const baseKey = String(chatId)
      return cache.presets[baseKey] || null
    },
    setPreset(chatId, a, b) {
      if (chatId === undefined || chatId === null) return
      let presetName, threadId
      if (typeof a === 'number' || (typeof a === 'string' && !isNaN(Number(a)) && b !== undefined && isNaN(Number(b)))) {
        threadId = a
        presetName = b
      } else {
        presetName = a
        threadId = b || 0
      }
      const key = makeKey(chatId, threadId)
      const clean = String(presetName || '').trim()
      if (clean && clean !== 'default' && clean !== 'null') {
        cache.presets[key] = clean
      } else {
        delete cache.presets[key]
      }
      save()
    },
    all() {
      return { ...cache }
    },
  }
}
