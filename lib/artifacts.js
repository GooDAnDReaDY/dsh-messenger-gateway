export function extractMermaidDiagrams(text) {
  if (!text || typeof text !== 'string') return []
  const regex = /```mermaid\s*\n([\s\S]*?)```/gi
  const diagrams = []
  let match
  while ((match = regex.exec(text)) !== null) {
    diagrams.push({
      fullMatch: match[0],
      code: match[1].trim(),
      index: match.index,
    })
  }
  return diagrams
}

export function escapeSvgXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function generateDiagramSvg(code, title = 'Mermaid Diagram') {
  const lines = code.split('\n').slice(0, 30)
  const lineSpans = lines.map((line, i) => {
    const escaped = escapeSvgXml(line)
    return `<tspan x="24" dy="${i === 0 ? '0' : '1.4em'}">${escaped}</tspan>`
  }).join('')

  const height = Math.max(160, Math.min(800, lines.length * 24 + 100))
  const safeTitle = escapeSvgXml(title)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${height}" width="800" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e2e"/>
      <stop offset="100%" stop-color="#181825"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="url(#bg)" stroke="#313244" stroke-width="2"/>
  <circle cx="28" cy="28" r="6" fill="#f38ba8" />
  <circle cx="48" cy="28" r="6" fill="#f9e2af" />
  <circle cx="68" cy="28" r="6" fill="#a6e3a1" />
  <text x="96" y="32" fill="#cdd6f4" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, monospace" font-size="14" font-weight="600">${safeTitle}</text>
  <line x1="16" y1="48" x2="784" y2="48" stroke="#313244" stroke-width="1"/>
  <text x="24" y="76" fill="#a6adc8" font-family="'JetBrains Mono', 'Fira Code', monospace" font-size="13" xml:space="preserve">
    ${lineSpans}
  </text>
</svg>`
}

export function formatMarkdownTables(text) {
  if (!text || typeof text !== 'string') return text
  const tableRegex = /((?:^|\n)\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/g

  return text.replace(tableRegex, (match) => {
    const rawLines = match.trim().split('\n')
    if (rawLines.length < 3) return match

    const rows = rawLines.map((line) => {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim())
      return cells
    })

    const colCount = Math.max(...rows.map((r) => r.length))
    const colWidths = Array(colCount).fill(0)

    rows.forEach((row, rowIdx) => {
      if (rowIdx === 1) return
      row.forEach((cell, colIdx) => {
        colWidths[colIdx] = Math.max(colWidths[colIdx] || 0, cell.length)
      })
    })

    const formattedRows = rows.map((row, rowIdx) => {
      if (rowIdx === 1) {
        return colWidths.map((w) => '-'.repeat(Math.max(w, 3))).join(' | ')
      }
      return row.map((cell, colIdx) => cell.padEnd(colWidths[colIdx] || 3)).join(' | ')
    })

    const alignedTable = formattedRows.join('\n')
    return `\n\`\`\`\n${alignedTable}\n\`\`\`\n`
  })
}

export function processDiagramsAndTables(rawText, options = {}) {
  const { artifactPreviews = true } = options
  let text = String(rawText || '')
  const files = []

  if (artifactPreviews) {
    const diagrams = extractMermaidDiagrams(text)
    if (diagrams.length > 0) {
      let diagramIndex = 1
      for (const diag of diagrams) {
        const svgContent = generateDiagramSvg(diag.code, `Диаграмма ${diagramIndex}`)
        const base64 = Buffer.from(svgContent, 'utf-8').toString('base64')
        files.push({
          name: `diagram-${diagramIndex}.svg`,
          mime: 'image/svg+xml',
          kind: 'document',
          dataBase64: base64,
          bytes: Buffer.from(svgContent, 'utf-8'),
        })

        text = text.replace(diag.fullMatch, `\n📊 <b>[Диаграмма ${diagramIndex}: см. вложение]</b>\n`)
        diagramIndex++
      }
    }
    text = formatMarkdownTables(text)
  }

  return { text, files, diagramsCount: files.length }
}
