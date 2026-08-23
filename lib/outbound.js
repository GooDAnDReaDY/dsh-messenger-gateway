const IMAGE_URL_RE = /(\/(?:dsh-[\w-]+)\/image\?[^\s)]+)/g

export function extractImageUrls(text) {
  const urls = []
  for (const m of String(text || '').matchAll(IMAGE_URL_RE)) urls.push(m[1])
  return urls
}

export function collectAssistantParts(message) {
  const texts = []
  const images = []
  for (const block of message?.content || []) {
    if (block.type === 'text' && block.text) texts.push(block.text)
    if (block.type === 'image' && block.attachment) images.push(block.attachment)
  }
  return { text: texts.join('\n\n').trim(), images }
}

export async function readAttachmentBytes(ctx, ref) {
  const stored = await ctx.attachments.readImage(ref)
  return {
    bytes: stored.data,
    mime: ref.mediaType || 'image/png',
    kind: 'photo',
    name: `image${ref.mediaType === 'image/jpeg' ? '.jpg' : '.png'}`,
  }
}

export async function fetchInternalImage(baseUrl, path, signal) {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`image fetch HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  const mime = res.headers.get('content-type') || 'image/png'
  return { bytes, mime, kind: 'photo', name: 'image.png' }
}
