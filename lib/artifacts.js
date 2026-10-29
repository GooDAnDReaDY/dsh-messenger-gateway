import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { writeFileSync, readFileSync, unlinkSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

export function extractMermaidDiagrams(text) {
  if (!text || typeof text !== "string") return []
  const regex = /```(?:mermaid|chart)\s*\n([\s\S]*?)```/gi
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

export function escapeSvgXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

const DIAGRAM_CACHE = new Map()
const MAX_CACHE_SIZE = 250

export function getCachedDiagram(hash) {
  return DIAGRAM_CACHE.get(hash)
}

export function setCachedDiagram(hash, svg) {
  if (DIAGRAM_CACHE.size >= MAX_CACHE_SIZE) {
    const firstKey = DIAGRAM_CACHE.keys().next().value
    DIAGRAM_CACHE.delete(firstKey)
  }
  DIAGRAM_CACHE.set(hash, svg)
}

export function detectDiagramType(code = "") {
  const clean = code.trim().toLowerCase()
  if (clean.startsWith("pie")) return "pie"
  if (clean.startsWith("xychart") || clean.startsWith("xychart-beta")) return "xychart"
  if (clean.startsWith("sequencediagram")) return "sequence"
  if (clean.startsWith("flowchart") || clean.startsWith("graph")) return "flowchart"
  if (clean.startsWith("statediagram")) return "state"
  if (clean.startsWith("classdiagram")) return "class"
  return "code"
}

export function renderPieChartSvg(code, title = "Pie Chart") {
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean)
  let extractedTitle = title
  const slices = []

  for (const line of lines) {
    const titleMatch = line.match(/^title\s+(?:"([^"]+)"|(.+))$/i)
    if (titleMatch) {
      extractedTitle = titleMatch[1] || titleMatch[2]
      continue
    }
    const sliceMatch = line.match(/^(?:"([^"]+)"|([\w\s-]+))\s*:\s*([\d.]+)/)
    if (sliceMatch) {
      const label = sliceMatch[1] || sliceMatch[2]
      const val = parseFloat(sliceMatch[3])
      if (!isNaN(val) && val > 0) {
        slices.push({ label: label.trim(), val })
      }
    }
  }

  if (slices.length < 2) return null

  const total = slices.reduce((acc, s) => acc + s.val, 0)
  const colors = ["#89b4fa", "#a6e3a1", "#f9e2af", "#f38ba8", "#cba6f7", "#94e2d5", "#fab387", "#74c7ec"]

  const cx = 220
  const cy = 200
  const r = 120
  const innerR = 60

  let currentAngle = -Math.PI / 2
  const pathElements = []
  const legendElements = []

  slices.forEach((slice, i) => {
    const sliceAngle = (slice.val / total) * 2 * Math.PI
    const endAngle = currentAngle + sliceAngle
    const color = colors[i % colors.length]

    const x1 = cx + r * Math.cos(currentAngle)
    const y1 = cy + r * Math.sin(currentAngle)
    const x2 = cx + r * Math.cos(endAngle)
    const y2 = cy + r * Math.sin(endAngle)

    const ix1 = cx + innerR * Math.cos(endAngle)
    const iy1 = cy + innerR * Math.sin(endAngle)
    const ix2 = cx + innerR * Math.cos(currentAngle)
    const iy2 = cy + innerR * Math.sin(currentAngle)

    const largeArc = sliceAngle > Math.PI ? 1 : 0
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix2} ${iy2} Z`

    pathElements.push(`<path d="${d}" fill="${color}" stroke="#181825" stroke-width="2"/>`)

    const pct = ((slice.val / total) * 100).toFixed(1)
    const legendY = 90 + i * 28
    legendElements.push(`
      <rect x="420" y="${legendY - 12}" width="14" height="14" rx="3" fill="${color}" />
      <text x="444" y="${legendY}" fill="#cdd6f4" font-family="-apple-system, sans-serif" font-size="13" font-weight="500">${escapeSvgXml(slice.label)}</text>
      <text x="740" y="${legendY}" fill="#a6adc8" font-family="monospace" font-size="13" text-anchor="end">${pct}% (${slice.val})</text>
    `)

    currentAngle = endAngle
  })

  const safeTitle = escapeSvgXml(extractedTitle)
  const height = Math.max(360, 110 + slices.length * 30)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 ${height}" width="780" height="${height}">
  <desc>${escapeSvgXml(code)}</desc>
  <defs>
    <linearGradient id="pie-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e2e"/>
      <stop offset="100%" stop-color="#181825"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="url(#pie-bg)" stroke="#313244" stroke-width="2"/>
  <circle cx="28" cy="28" r="6" fill="#f38ba8" />
  <circle cx="48" cy="28" r="6" fill="#f9e2af" />
  <circle cx="68" cy="28" r="6" fill="#a6e3a1" />
  <text x="96" y="32" fill="#cdd6f4" font-family="-apple-system, sans-serif" font-size="14" font-weight="600">${safeTitle}</text>
  <line x1="16" y1="48" x2="764" y2="48" stroke="#313244" stroke-width="1"/>
  <g>${pathElements.join("\n")}</g>
  <g>${legendElements.join("\n")}</g>
</svg>`
}

export function renderXyChartSvg(code, title = "Chart") {
  const lines = code.split("\n").map((l) => l.trim()).filter(Boolean)
  let extractedTitle = title
  let xLabels = []
  let barVals = []
  let lineVals = []

  for (const line of lines) {
    const titleMatch = line.match(/^title\s+(?:"([^"]+)"|(.+))$/i)
    if (titleMatch) {
      extractedTitle = titleMatch[1] || titleMatch[2]
      continue
    }
    const xMatch = line.match(/^x-axis\s*\[(.*)\]/i)
    if (xMatch) {
      xLabels = xMatch[1].split(",").map((s) => s.replace(/["']/g, "").trim()).filter(Boolean)
      continue
    }
    const barMatch = line.match(/^bar\s*\[(.*)\]/i)
    if (barMatch) {
      barVals = barMatch[1].split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n))
      continue
    }
    const lineMatch = line.match(/^line\s*\[(.*)\]/i)
    if (lineMatch) {
      lineVals = lineMatch[1].split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n))
      continue
    }
  }

  const count = Math.max(xLabels.length, barVals.length, lineVals.length)
  if (count < 2) return null

  const allVals = [...barVals, ...lineVals]
  const maxVal = Math.max(...allVals, 1)

  const width = 780
  const height = 400
  const plotX = 80
  const plotY = 70
  const plotW = 660
  const plotH = 260

  const colW = plotW / count
  const barWidth = Math.min(36, colW * 0.5)

  // Gridlines
  const gridLines = []
  for (let step = 0; step <= 4; step++) {
    const yVal = ((maxVal * step) / 4).toFixed(0)
    const yPos = plotY + plotH - (plotH * step) / 4
    gridLines.push(`
      <line x1="${plotX}" y1="${yPos}" x2="${plotX + plotW}" y2="${yPos}" stroke="#313244" stroke-width="1" stroke-dasharray="4"/>
      <text x="${plotX - 12}" y="${yPos + 4}" fill="#a6adc8" font-family="monospace" font-size="11" text-anchor="end">${yVal}</text>
    `)
  }

  // Bars
  const barsElements = []
  barVals.forEach((val, i) => {
    const bH = (val / maxVal) * plotH
    const bx = plotX + i * colW + (colW - barWidth) / 2
    const by = plotY + plotH - bH
    barsElements.push(`
      <rect x="${bx}" y="${by}" width="${barWidth}" height="${bH}" rx="4" fill="#89b4fa" fill-opacity="0.85" />
      <text x="${bx + barWidth / 2}" y="${by - 6}" fill="#cdd6f4" font-family="monospace" font-size="10" text-anchor="middle">${val}</text>
    `)
  })

  // Line points
  const linePoints = []
  lineVals.forEach((val, i) => {
    const lx = plotX + i * colW + colW / 2
    const ly = plotY + plotH - (val / maxVal) * plotH
    linePoints.push({ x: lx, y: ly, val })
  })

  let lineSvg = ""
  if (linePoints.length >= 2) {
    const d = linePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    const dots = linePoints.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#f38ba8" stroke="#181825" stroke-width="2"/>`).join("")
    lineSvg = `<path d="${d}" fill="none" stroke="#f38ba8" stroke-width="3"/>${dots}`
  }

  // X Labels
  const xLabelElements = []
  for (let i = 0; i < count; i++) {
    const lbl = xLabels[i] || `T${i + 1}`
    const lx = plotX + i * colW + colW / 2
    xLabelElements.push(`
      <text x="${lx}" y="${plotY + plotH + 24}" fill="#a6adc8" font-family="-apple-system, sans-serif" font-size="12" text-anchor="middle">${escapeSvgXml(lbl)}</text>
    `)
  }

  const safeTitle = escapeSvgXml(extractedTitle)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <desc>${escapeSvgXml(code)}</desc>
  <defs>
    <linearGradient id="xy-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1e2e"/>
      <stop offset="100%" stop-color="#181825"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" rx="12" fill="url(#xy-bg)" stroke="#313244" stroke-width="2"/>
  <circle cx="28" cy="28" r="6" fill="#f38ba8" />
  <circle cx="48" cy="28" r="6" fill="#f9e2af" />
  <circle cx="68" cy="28" r="6" fill="#a6e3a1" />
  <text x="96" y="32" fill="#cdd6f4" font-family="-apple-system, sans-serif" font-size="14" font-weight="600">${safeTitle}</text>
  <line x1="16" y1="48" x2="${width - 16}" y2="48" stroke="#313244" stroke-width="1"/>
  <g>${gridLines.join("\n")}</g>
  <g>${barsElements.join("\n")}</g>
  <g>${lineSvg}</g>
  <g>${xLabelElements.join("\n")}</g>
</svg>`
}

export function renderCodeCardSvg(code, title = "Mermaid Diagram") {
  const lines = code.split("\n").slice(0, 30)
  const lineSpans = lines.map((line, i) => {
    const escaped = escapeSvgXml(line)
    return `<tspan x="24" dy="${i === 0 ? "0" : "1.4em"}">${escaped}</tspan>`
  }).join("")

  const height = Math.max(160, Math.min(800, lines.length * 24 + 100))
  const safeTitle = escapeSvgXml(title)

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 ${height}" width="800" height="${height}">
  <desc>${escapeSvgXml(code)}</desc>
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

export function generateDiagramSvg(code, title = "Diagram") {
  const hash = createHash("sha256").update(code).digest("hex")
  const cached = getCachedDiagram(hash)
  if (cached) return cached

  const type = detectDiagramType(code)
  let svg = null

  if (type === "pie") {
    svg = renderPieChartSvg(code, title)
  } else if (type === "xychart") {
    svg = renderXyChartSvg(code, title)
  }

  if (!svg) {
    svg = renderCodeCardSvg(code, title)
  }

  setCachedDiagram(hash, svg)
  return svg
}

export async function convertSvgToPng(svgContent) {
  const rnd = Math.random().toString(36).slice(2, 8)
  const inPath = join(tmpdir(), `chart-${Date.now()}-${rnd}.svg`)
  const outPath = join(tmpdir(), `chart-${Date.now()}-${rnd}.png`)

  try {
    writeFileSync(inPath, svgContent, "utf-8")
    await new Promise((resolve, reject) => {
      const proc = spawn("ffmpeg", ["-y", "-i", inPath, "-update", "1", "-frames:v", "1", outPath])
      proc.on("error", reject)
      proc.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg exited with code ${code}`))
      })
    })
    return readFileSync(outPath)
  } catch {
    return null
  } finally {
    try { unlinkSync(inPath) } catch { /* safe best-effort temp file cleanup */ }
    try { unlinkSync(outPath) } catch { /* safe best-effort temp file cleanup */ }
  }
}

export function formatMarkdownTables(text) {
  if (!text || typeof text !== "string") return text
  const tableRegex = /((?:^|\n)\|[^\n]+\|\n\|[\s\-:|]+\|\n(?:\|[^\n]+\|\n?)+)/g

  return text.replace(tableRegex, (match) => {
    const rawLines = match.trim().split("\n")
    if (rawLines.length < 3) return match

    const rows = rawLines.map((line) => {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim())
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
        return colWidths.map((w) => "-".repeat(Math.max(w, 3))).join(" | ")
      }
      return row.map((cell, colIdx) => cell.padEnd(colWidths[colIdx] || 3)).join(" | ")
    })

    const alignedTable = formattedRows.join("\n")
    return `\n\`\`\`\n${alignedTable}\n\`\`\`\n`
  })
}

export function processDiagramsAndTables(rawText, options = {}) {
  const { artifactPreviews = true } = options
  let text = String(rawText || "")
  const files = []

  if (artifactPreviews) {
    const diagrams = extractMermaidDiagrams(text)
    if (diagrams.length > 0) {
      let diagramIndex = 1
      for (const diag of diagrams) {
        const svgContent = generateDiagramSvg(diag.code, `Diagram ${diagramIndex}`)
        const base64 = Buffer.from(svgContent, "utf-8").toString("base64")
        files.push({
          name: `diagram-${diagramIndex}.svg`,
          mime: "image/svg+xml",
          kind: "document",
          dataBase64: base64,
          bytes: Buffer.from(svgContent, "utf-8"),
        })

        text = text.replace(diag.fullMatch, `\n📊 <b>[Diagram ${diagramIndex}: see attachment]</b>\n`)
        diagramIndex++
      }
    }
    text = formatMarkdownTables(text)
  }

  return { text, files, diagramsCount: files.length }
}

export async function processDiagramsAndTablesAsync(rawText, options = {}) {
  const { artifactPreviews = true } = options
  let text = String(rawText || "")
  const files = []

  if (artifactPreviews) {
    const diagrams = extractMermaidDiagrams(text)
    if (diagrams.length > 0) {
      let diagramIndex = 1
      for (const diag of diagrams) {
        const type = detectDiagramType(diag.code)
        const typeLabel = type === "pie" ? "Pie Chart" : type === "xychart" ? "Chart" : "Diagram"
        const title = `${typeLabel} ${diagramIndex}`
        const svgContent = generateDiagramSvg(diag.code, title)
        const pngBytes = await convertSvgToPng(svgContent)

        if (pngBytes && pngBytes.length > 0) {
          files.push({
            name: `diagram-${diagramIndex}.png`,
            mime: "image/png",
            kind: "photo",
            dataBase64: pngBytes.toString("base64"),
            bytes: pngBytes,
          })
          text = text.replace(diag.fullMatch, `\n📊 <b>[${title}: see photo preview]</b>\n`)
        } else {
          files.push({
            name: `diagram-${diagramIndex}.svg`,
            mime: "image/svg+xml",
            kind: "document",
            dataBase64: Buffer.from(svgContent, "utf-8").toString("base64"),
            bytes: Buffer.from(svgContent, "utf-8"),
          })
          text = text.replace(diag.fullMatch, `\n📊 <b>[${title}: see attachment]</b>\n`)
        }
        diagramIndex++
      }
    }
    text = formatMarkdownTables(text)
  }

  return { text, files, diagramsCount: files.length }
}
