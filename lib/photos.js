import { readFile } from 'node:fs/promises'

/**
 * Persist an inbound photo for the agent. dsh-vision-bridge rewrites image blocks
 * for text-only models at agent/pre-step and llm/stream.
 */
export async function attachInboundPhoto(ctx, att, opts = {}) {
  const { signal, maxBytes = 20 * 1024 * 1024 } = opts
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  const bytes = new Uint8Array(await readFile(att.path))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (maxBytes > 0 && bytes.length > maxBytes) {
    throw new Error(`image too large (${bytes.length} bytes, max ${maxBytes})`)
  }
  const ref = await ctx.attachments.saveImage({
    data: bytes,
    mediaType: att.mime || 'image/jpeg',
    ...(att.name ? { name: att.name } : {}),
  })
  return { ref, byteLength: bytes.length }
}

/** Text hint when the user sent photo(s) without a caption. */
export function photoOnlyHint(attachments, userText) {
  if (String(userText || '').trim()) return ''
  const photos = attachments.filter((a) => a.kind === 'photo')
  if (!photos.length) return ''
  if (photos.length === 1) return '[Пользователь отправил фото]'
  return `[Пользователь отправил ${photos.length} фото]`
}
