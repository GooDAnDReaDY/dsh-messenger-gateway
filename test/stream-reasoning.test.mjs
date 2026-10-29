import test from "node:test"
import assert from "node:assert/strict"
import {
  extractReasoningDelta,
  extractTextDelta,
  parseReasoningStream,
  buildStreamPreview,
  formatReasoningFinal,
} from "../lib/stream.js"
import { markdownToTelegramHtml, stripSafeTags } from "../lib/telegram-format.js"

test("extractReasoningDelta extracts thought and reasoning deltas", () => {
  assert.equal(extractReasoningDelta({ type: "reasoning-delta", text: "thought 1" }), "thought 1")
  assert.equal(extractReasoningDelta({ type: "thought-delta", text: "thought 2" }), "thought 2")
  assert.equal(extractReasoningDelta({ type: "reasoning", text: "thought 3" }), "thought 3")
  assert.equal(extractReasoningDelta({ reasoning_content: "r1 reasoning" }), "r1 reasoning")
  assert.equal(extractReasoningDelta({ reasoning: "generic reasoning" }), "generic reasoning")
  assert.equal(extractReasoningDelta({ thought: "gemini thought" }), "gemini thought")

  // Standard text-delta should not be extracted as reasoning
  assert.equal(extractReasoningDelta({ type: "text-delta", text: "content" }), "")
  assert.equal(extractReasoningDelta(null), "")
  assert.equal(extractReasoningDelta("plain string"), "")
})

test("parseReasoningStream parses unclosed think tags during live generation", () => {
  const res = parseReasoningStream("<think>Analyzing user request")
  assert.equal(res.isThinking, true)
  assert.equal(res.isComplete, false)
  assert.equal(res.hasThought, true)
  assert.equal(res.thought, "Analyzing user request")
  assert.equal(res.content, "")
})

test("parseReasoningStream parses completed think tags and separates content", () => {
  const res = parseReasoningStream("<think>Checked files and found bug</think>Here is the fix:\n```js\nconsole.log(1)\n```")
  assert.equal(res.isThinking, false)
  assert.equal(res.isComplete, true)
  assert.equal(res.hasThought, true)
  assert.equal(res.thought, "Checked files and found bug")
  assert.equal(res.content, "Here is the fix:\n```js\nconsole.log(1)\n```")
})

test("parseReasoningStream handles [THOUGHT] and |begin_of_thought| tags", () => {
  const res1 = parseReasoningStream("[THOUGHT]Step A[/THOUGHT]Answer A")
  assert.equal(res1.thought, "Step A")
  assert.equal(res1.content, "Answer A")
  assert.equal(res1.isComplete, true)

  const res2 = parseReasoningStream("|begin_of_thought|Step B|end_of_thought|Answer B")
  assert.equal(res2.thought, "Step B")
  assert.equal(res2.content, "Answer B")
  assert.equal(res2.isComplete, true)
})

test("parseReasoningStream handles delta reasoning without tags", () => {
  const res = parseReasoningStream("The final answer is 42", "Let me calculate 6 * 7")
  assert.equal(res.hasThought, true)
  assert.equal(res.isThinking, false)
  assert.equal(res.isComplete, true)
  assert.equal(res.thought, "Let me calculate 6 * 7")
  assert.equal(res.content, "The final answer is 42")
})

test("parseReasoningStream leaves plain text without thoughts untouched", () => {
  const res = parseReasoningStream("Hello, how are you today?")
  assert.equal(res.hasThought, false)
  assert.equal(res.isThinking, false)
  assert.equal(res.thought, "")
  assert.equal(res.content, "Hello, how are you today?")
})

test("buildStreamPreview renders intermediate blockquote during thinking", () => {
  const preview = buildStreamPreview("<think>Searching knowledge base", "", 3500, {
    startTime: Date.now() - 3000,
  })
  assert.match(preview, /Thinking.*\(3s\)/)
  assert.match(preview, /<blockquote>Searching knowledge base<\/blockquote>/)
})

test("buildStreamPreview renders collapsible blockquote once thinking completes", () => {
  const preview = buildStreamPreview("<think>Calculation finished</think>Result: 100", "", 3500, {
    thoughtCollapse: true,
  })
  assert.match(preview, /<blockquote expandable>🧠 <i>Thought process.*:<\/i>\nCalculation finished<\/blockquote>/)
  assert.match(preview, /Result: 100/)
})

test("buildStreamPreview respects showReasoning: false", () => {
  const preview = buildStreamPreview("<think>Private thoughts</think>Public answer", "", 3500, {
    showReasoning: false,
  })
  assert.doesNotMatch(preview, /Private thoughts/)
  assert.match(preview, /Public answer/)
})

test("formatReasoningFinal formats final response with expandable thought", () => {
  const raw = "<think>Verified solution</think>All tests passing."
  const finalFormatted = formatReasoningFinal(raw, "", { thoughtCollapse: true })
  assert.match(finalFormatted, /<blockquote expandable>🧠 <i>Thought process:<\/i>\nVerified solution<\/blockquote>/)
  assert.match(finalFormatted, /All tests passing\./)
})

test("markdownToTelegramHtml preserves <blockquote expandable> without escaping", () => {
  const html = "<blockquote expandable>🧠 <i>Thought process:</i>\nStep 1</blockquote>\n\nFinal **answer** `code`"
  const rendered = markdownToTelegramHtml(html)
  assert.match(rendered, /<blockquote expandable>🧠 <i>Thought process:<\/i>\nStep 1<\/blockquote>/)
  assert.match(rendered, /<b>answer<\/b>/)
  assert.match(rendered, /<code>code<\/code>/)
  assert.doesNotMatch(rendered, /&lt;blockquote/)

  const stripped = stripSafeTags(rendered)
  assert.doesNotMatch(stripped, /<blockquote/)
  assert.match(stripped, /Thought process/)
  assert.match(stripped, /Final answer/)
})
