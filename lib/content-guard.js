/**
 * Normalize any content value to ContentBlock[].
 * DSH core (dsh-llm) calls content.some() without Array.isArray guard,
 * so we must ensure every message we create or copy has array content.
 * Refs: #51
 */
export function ensureContentArray(content) {
  if (Array.isArray(content)) return content
  if (typeof content === 'string') {
    return content ? [{ type: 'text', text: content }] : [{ type: 'text', text: '(пустое сообщение)' }]
  }
  if (content && typeof content === 'object' && content.type) return [content]
  return [{ type: 'text', text: String(content ?? '(пустое сообщение)') }]
}
