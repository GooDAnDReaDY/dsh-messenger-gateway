export function exportSessionToMarkdown(session, opts = {}) {
  if (!session) return { filename: 'session-export.md', content: '# Empty session\n', buffer: Buffer.from('# Empty session\n') }

  const id = session.id || 'unknown'
  const dateStr = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `session-${id}-${dateStr}.md`

  const lines = [
    `# Export of Session: ${id}`,
    `*Generated on: ${new Date().toLocaleString()}*`,
    '',
    '---',
    '',
  ]

  const messages = Array.isArray(session.messages)
    ? session.messages
    : (Array.isArray(session.history) ? session.history : [])

  if (!messages.length) {
    lines.push('*(No messages in this session)*\n')
  }

  for (const msg of messages) {
    const role = msg.role || (msg.type === 'user' ? 'user' : 'assistant')
    const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString() : ''
    const timeStr = time ? ` (${time})` : ''

    if (role === 'user') {
      lines.push(`### 👤 User${timeStr}`)
    } else if (role === 'assistant') {
      lines.push(`### 🤖 Assistant${timeStr}`)
    } else if (role === 'system') {
      lines.push(`### ⚙️ System${timeStr}`)
    } else {
      lines.push(`### 💬 ${role}${timeStr}`)
    }

    let textContent = ''
    if (typeof msg.content === 'string') {
      textContent = msg.content
    } else if (Array.isArray(msg.content)) {
      textContent = msg.content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part?.text) return part.text
          if (part?.type === 'text') return part.text
          if (part?.type === 'tool_use' || part?.tool) {
            return `\n> 🛠️ **Tool call:** \`${part.name || part.tool}\`\n`
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
    } else if (msg.text) {
      textContent = msg.text
    }

    lines.push(textContent || '*(empty message)*')
    lines.push('')
  }

  const content = lines.join('\n')
  return {
    filename,
    content,
    buffer: Buffer.from(content, 'utf8'),
    messagesCount: messages.length,
  }
}

export function rewindSession(session, turnsCount = 1) {
  if (!session) return { removed: 0, remaining: 0 }
  const count = Math.max(1, Number(turnsCount) || 1)
  const messages = Array.isArray(session.messages) ? session.messages : []
  if (!messages.length) return { removed: 0, remaining: 0 }

  let toRemove = 0
  let userTurnsSeen = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    toRemove++
    if (msg.role === 'user' || msg.type === 'user') {
      userTurnsSeen++
      if (userTurnsSeen >= count) break
    }
  }

  const removed = messages.splice(messages.length - toRemove, toRemove)
  return {
    removed: removed.length,
    remaining: messages.length,
  }
}
