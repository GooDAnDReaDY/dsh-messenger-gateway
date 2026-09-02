import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export const BUILTIN_PERSONAS = {
  default: {
    id: 'default',
    name: 'Default',
    icon: '🤖',
    description: 'Стандартный универсальный ассистент',
    instruction: '',
  },
  coder: {
    id: 'coder',
    name: 'Senior Developer',
    icon: '💻',
    description: 'Опытный разработчик: чистый код, архитектура, минимум лишних слов',
    instruction: 'You are an expert senior software engineer. Provide high-quality, production-ready code with best practices, proper error handling, and concise explanations.',
  },
  architect: {
    id: 'architect',
    name: 'System Architect',
    icon: '📐',
    description: 'Системный архитектор: проектирование, масштабируемость, компромиссы',
    instruction: 'You are a principal system architect. Focus on high-level architecture, scalability, security, trade-offs, modular design, and clear diagrams.',
  },
  reviewer: {
    id: 'reviewer',
    name: 'Code Reviewer',
    icon: '🔍',
    description: 'Строгий код-ревьюер: поиск багов, безопасность, краевые случаи',
    instruction: 'You are a meticulous code reviewer. Analyze code for bugs, edge cases, security vulnerabilities, performance bottlenecks, and maintainability.',
  },
  writer: {
    id: 'writer',
    name: 'Tech Writer',
    icon: '📝',
    description: 'Технический писатель: понятные тексты, структура, документация',
    instruction: 'You are a professional technical writer and editor. Structure information clearly with clean formatting, intuitive language, and thorough documentation.',
  },
  translator: {
    id: 'translator',
    name: 'Translator',
    icon: '🌐',
    description: 'Переводчик: точный перевод с сохранением терминологии',
    instruction: 'You are an expert translator and localization specialist. Translate accurately while preserving technical context, nuance, and terminology.',
  },
  concise: {
    id: 'concise',
    name: 'Concise',
    icon: '⚡',
    description: 'Лаконичный режим: краткие и емкие ответы без воды',
    instruction: 'Be extremely concise. Answer directly in 1-3 sentences or short bullet points without unnecessary filler or pleasantries.',
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
  let cache = {}
  try {
    cache = JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {}

  function save() {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(cache, null, 2), 'utf8')
    } catch {}
  }

  return {
    get(chatId) {
      if (chatId === undefined || chatId === null) return 'default'
      return cache[String(chatId)] || 'default'
    },
    set(chatId, personaId) {
      if (chatId === undefined || chatId === null) return
      const valid = getPersona(personaId)
      if (valid && valid.id !== 'default') {
        cache[String(chatId)] = valid.id
      } else {
        delete cache[String(chatId)]
      }
      save()
    },
    all() {
      return { ...cache }
    },
  }
}
