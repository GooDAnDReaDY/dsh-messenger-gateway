const IMAGE_URL_RE = /(\/(?:dsh-[\w-]+)\/image\?[^\s)]+)/g

export function extractImageUrls(text) {
  const urls = []
  for (const m of String(text || '').matchAll(IMAGE_URL_RE)) urls.push(m[1])
  return urls
}

/** Remove harness image URLs from reply text before sending to messenger. */
export function stripImageUrls(text) {
  return String(text || '')
    .replace(IMAGE_URL_RE, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Collect image attachment refs from assistant content (incl. nested tool blocks). */
export function collectImagesDeep(content) {
  const images = []
  const walk = (blocks) => {
    if (!Array.isArray(blocks)) return
    for (const block of blocks) {
      if (!block || typeof block !== 'object') continue
      if (block.type === 'image' && block.attachment) images.push(block.attachment)
      if (Array.isArray(block.content)) walk(block.content)
    }
  }
  walk(content)
  return images
}

export function collectAssistantParts(message) {
  const texts = []
  for (const block of message?.content || []) {
    if (block.type === 'text' && block.text) texts.push(block.text)
  }
  return { text: texts.join('\n\n').trim(), images: collectImagesDeep(message?.content) }
}

export function dedupeAttachmentRefs(refs) {
  const seen = new Set()
  const out = []
  for (const ref of refs || []) {
    const id = ref?.attachmentId ?? ref?.id
    const key = id !== undefined ? String(id) : JSON.stringify(ref)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(ref)
  }
  return out
}

export function fileNameForRef(ref) {
  const name = String(ref?.name || '').trim()
  if (name) return name.replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'image.png'
  const mt = String(ref?.mediaType || '').toLowerCase()
  if (mt === 'image/jpeg' || mt === 'image/jpg') return 'image.jpg'
  if (mt === 'image/webp') return 'image.webp'
  if (mt === 'image/gif') return 'image.gif'
  return 'image.png'
}

export async function readAttachmentBytes(ctx, ref) {
  const stored = await ctx.attachments.readImage(ref)
  return {
    bytes: stored.data,
    mime: ref.mediaType || stored.ref?.mediaType || 'image/png',
    kind: 'photo',
    name: fileNameForRef(ref),
  }
}

export async function fetchInternalImage(baseUrl, path, signal) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`image fetch HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'image/png'
  const fromQuery = url.searchParams.get('id') || url.searchParams.get('name')
  const name = fromQuery ? `image-${fromQuery.slice(0, 32)}.png` : 'image.png'
  return { bytes, mime, kind: 'photo', name }
}

const DEFAULT_MAX_OUTBOUND_FILES = 10

/** Build Telegram-ready files from assistant image blocks and inline plugin URLs. */
export async function buildOutboundFiles(ctx, baseUrl, collector, opts = {}) {
  const { signal, logger, maxFiles = DEFAULT_MAX_OUTBOUND_FILES } = opts
  const files = []
  const refs = dedupeAttachmentRefs(collector.images)
  for (const ref of refs) {
    if (files.length >= maxFiles) break
    if (signal?.aborted) break
    try {
      files.push(await readAttachmentBytes(ctx, ref))
    } catch (e) {
      logger?.warn?.(`outbound image: ${e.message}`)
    }
  }
  const urls = [...new Set(extractImageUrls(collector.parts.join('\n')))]
  for (const path of urls) {
    if (files.length >= maxFiles) break
    if (signal?.aborted) break
    try {
      files.push(await fetchInternalImage(baseUrl, path, signal))
    } catch (e) {
      logger?.warn?.(`outbound url image: ${e.message}`)
    }
  }
  return files
}
