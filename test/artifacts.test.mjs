import test from 'node:test'
import assert from 'node:assert/strict'
import {
  extractMermaidDiagrams,
  generateDiagramSvg,
  formatMarkdownTables,
  processDiagramsAndTables,
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
  assert.ok(res.text.includes('📊 <b>[Диаграмма 1: см. вложение]</b>'))
})
