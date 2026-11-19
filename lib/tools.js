import { defineTool } from '@deepseek-ai/dsh-tools'

// The messenger_ask agent tool (#233): inline buttons in the telegram chat
// bound to this msgw session. Extracted from the plugin entry point.

export function registerMessengerAskTool(ctx, { getGw }) {
  const tools = ctx.get?.('tools') || ctx.tools
  if (!tools?.register) return
  ctx.effect(() => tools.register(defineTool({
    name: 'messenger_ask',
    description:
      'Ask the Telegram user a single or multiple-choice question with inline buttons/checkboxes and wait for their choice. '
      + 'Supports mode: "single" (default) or "multi" (checkboxes with Done/Cancel buttons). Only works inside messenger-gateway sessions (msgw-*).',
    parameters: {
      text: { type: 'string', required: true, description: 'Question text shown in Telegram.' },
      buttons: {
        type: 'array',
        description: 'Rows of buttons: [[{ id, text }, ...], ...] (for single choice)',
      },
      options: {
        type: 'array',
        description: 'List of options: [{ id, text, selected?: boolean }, ...] (for single or multi choice)',
      },
      mode: {
        type: 'string',
        description: '"single" for instant choice or "multi" for checkboxes form',
      },
      selected: {
        type: 'array',
        description: 'Initial selected option IDs for multi-select mode',
      },
      pageSize: { type: 'number', description: 'Number of options per page (default 6).' },
      timeoutMs: { type: 'number', description: 'Wait timeout ms (default 300000).' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ok: { type: 'boolean' },
          buttonId: { type: 'string' },
          selected: { type: 'array', items: { type: 'string' } },
          data: { type: 'string' },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value && value.ok
          ? (value.selected?.length ? `User selected: ${value.selected.join(', ')}` : `User chose: ${value.buttonId}`)
          : `messenger_ask failed: ${value && value.error ? value.error : 'unknown'}`,
      }],
    },
    execute: async (args, exec) => {
      const gw = getGw()
      if (!gw) return { ok: false, error: 'gateway not running' }
      try {
        const result = await gw.messengerAskFromAgent(exec.agent, {
          text: String(args.text || ''),
          buttons: args.buttons,
          options: args.options,
          mode: args.mode,
          selected: args.selected,
          pageSize: args.pageSize,
        }, Number(args.timeoutMs) || 300_000)
        return { ok: true, buttonId: result?.buttonId, selected: result?.selected, data: result?.data }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    },
  })), 'dsh-messenger-gateway: messenger_ask tool')
}
