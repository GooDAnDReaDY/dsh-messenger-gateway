import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareVoiceSummary, prepareTtsText } from '../lib/tts.js'

test('prepareVoiceSummary extracts first 1-2 sentences without markdown/code', () => {
  const longMarkdown = `
## Отчет о выполнении
Задача успешно решена и протестирована. Все изменения вступили в силу.

\`\`\`javascript
function longCode() {
  console.log("very long code that should not be spoken");
}
\`\`\`

Дополнительные детали:
1. Шаг первый
2. Шаг второй
`
  const summary = prepareVoiceSummary(longMarkdown, 200)
  assert.ok(summary.includes('Задача успешно решена'))
  assert.ok(!summary.includes('function longCode'))
  assert.ok(!summary.includes('console.log'))
  assert.ok(summary.length <= 200)
})

test('prepareTtsText uses summary when voiceSummary is true', () => {
  const text = 'Первое предложение сути. Второе важное предложение. ' + 'Очень много текста '.repeat(50)
  const full = prepareTtsText(text, 4000, { voiceSummary: false })
  assert.ok(full.length > 500)

  const short = prepareTtsText(text, 4000, { voiceSummary: true })
  assert.ok(short.length <= 400)
  assert.ok(short.startsWith('Первое предложение сути.'))
})
