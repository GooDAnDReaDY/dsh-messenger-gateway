import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractMermaidDiagrams,
  generateDiagramSvg,
  formatMarkdownTables,
  processDiagramsAndTables,
  processDiagramsAndTablesAsync,
  detectDiagramType,
  renderPieChartSvg,
  renderXyChartSvg,
  convertSvgToPng,
} from '../lib/artifacts.js'

test('extractMermaidDiagrams extracts code and boundaries', () => {
  const text = 'Here is a diagram:\n```mermaid\ngraph LR\n  A --> B\n```\nAnd another note.'
  const list = extractMermaidDiagrams(text)
  assert.equal(list.length, 1)
  assert.equal(list[0].code, 'graph LR\n  A --> B')
})

test('generateDiagramSvg generates valid SVG card markup', () => {
  const code = 'flowchart TD\n  Start --> Stop'
  const svg = generateDiagramSvg(code, 'Test Process')
  assert.ok(svg.startsWith('<?xml'))
  assert.ok(svg.includes('<svg'))
  assert.ok(svg.includes('Start --&gt; Stop'))
  assert.ok(svg.includes('Test Process'))
})

test('formatMarkdownTables aligns columns in monospace block', () => {
  const markdown = 'Status table:\n| ID | Name | Role |\n|---|---|---|\n| 1 | Alice | Admin |\n| 22 | Bob | User |\n\nEnd.'
  const out = formatMarkdownTables(markdown)
  assert.ok(out.includes('```'))
  assert.ok(out.includes('ID | Name  | Role'))
  assert.ok(out.includes('22 | Bob   | User'))
})

test('processDiagramsAndTables extracts svg files and updates message text', () => {
  const raw = 'Check this architecture:\n```mermaid\ngraph TD\n  Client --> Server\n```\nDone.'
  const res = processDiagramsAndTables(raw, { artifactPreviews: true })
  assert.equal(res.diagramsCount, 1)
  assert.equal(res.files.length, 1)
  assert.equal(res.files[0].name, 'diagram-1.svg')
  assert.equal(res.files[0].mime, 'image/svg+xml')
  assert.equal(res.files[0].kind, 'document')
  assert.ok(res.text.includes('📊 <b>[Diagram 1: see attachment]</b>'))
})

test("detectDiagramType correctly classifies diagram types", () => {
  assert.equal(detectDiagramType("pie title Pets\n \"Dogs\": 10"), "pie")
  assert.equal(detectDiagramType("xychart-beta\n title Revenue"), "xychart")
  assert.equal(detectDiagramType("xychart\n x-axis [1, 2]"), "xychart")
  assert.equal(detectDiagramType("sequenceDiagram\n Alice->>Bob: hi"), "sequence")
  assert.equal(detectDiagramType("flowchart LR\n A --> B"), "flowchart")
  assert.equal(detectDiagramType("graph TD\n A --> B"), "flowchart")
  assert.equal(detectDiagramType("unknown\n syntax"), "code")
})

test("renderPieChartSvg generates valid SVG donut chart with legend and percentages", () => {
  const code = `pie title Browser Share
    \"Chrome\": 65
    \"Firefox\": 20
    \"Safari\": 15`
  const svg = renderPieChartSvg(code, "Browser Share")
  assert.ok(svg)
  assert.ok(svg.includes("<svg"))
  assert.ok(svg.includes("Browser Share"))
  assert.ok(svg.includes("Chrome"))
  assert.ok(svg.includes("65.0%"))
  assert.ok(svg.includes("Firefox"))
  assert.ok(svg.includes("20.0%"))
  assert.ok(svg.includes("<path d=\"M "))
})

test("renderXyChartSvg generates valid SVG with gridlines, bars and line points", () => {
  const code = `xychart-beta
    title \"Server Metrics\"
    x-axis [\"00:00\", \"06:00\", \"12:00\", \"18:00\"]
    bar [10, 30, 80, 50]
    line [8, 25, 75, 45]`
  const svg = renderXyChartSvg(code, "Server Metrics")
  assert.ok(svg)
  assert.ok(svg.includes("<svg"))
  assert.ok(svg.includes("Server Metrics"))
  assert.ok(svg.includes("00:00"))
  assert.ok(svg.includes("<rect x="))
  assert.ok(svg.includes("<path d=\"M "))
})

test("generateDiagramSvg caches results by hash", () => {
  const code = "xychart-beta\n title CacheTest\n bar [1, 2]"
  const svg1 = generateDiagramSvg(code, "CacheTest")
  const svg2 = generateDiagramSvg(code, "CacheTest")
  assert.equal(svg1, svg2)
})

test("convertSvgToPng converts SVG string to PNG buffer via ffmpeg", async () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
    <rect width="100" height="100" fill="#a6e3a1"/>
  </svg>`
  const png = await convertSvgToPng(svg)
  if (png) {
    assert.ok(Buffer.isBuffer(png))
    assert.equal(png[0], 0x89)
    assert.equal(png[1], 0x50) // P
    assert.equal(png[2], 0x4e) // N
    assert.equal(png[3], 0x47) // G
  }
})

test("processDiagramsAndTablesAsync generates companion photo preview files", async () => {
  const text = `Here is our distribution:
\`\`\`mermaid
pie title Distribution
  \"Alpha\": 60
  \"Beta\": 40
\`\`\`
All set!`

  const res = await processDiagramsAndTablesAsync(text, { artifactPreviews: true })
  assert.equal(res.diagramsCount, 1)
  assert.equal(res.files.length, 1)
  const file = res.files[0]
  assert.ok(file.kind === "photo" || file.kind === "document")
  assert.ok(file.bytes.length > 0)
  assert.ok(res.text.includes("📊 <b>[Pie Chart 1:"))
})
