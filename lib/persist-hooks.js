import { Config } from './config.js'

// Settings-writer hooks the Gateway invokes from chat commands (#222, #233).
// Every writer serializes through the settings write mutex and re-reads the
// current config at execution time, so concurrent writers cannot lose updates.

/**
 * @param {{ getSource: () => any, settingsApi: any }} io
 */
export function createPersistHooks({ getSource, settingsApi }) {
  const writeSection = (mutate) => settingsApi.writeExclusive(async (api) => {
    const cur = getSource()
    await api.replace(Config(mutate(cur)))
  })

  return {
    persistAllowedUserIds: async (ids) => {
      if (!settingsApi?.isReady?.()) return
      await writeSection((cur) => ({
        ...cur,
        telegram: { ...cur.telegram, allowedUserIds: ids },
      }))
    },
    persistHome: async ({ chatId, threadId }) => {
      if (!settingsApi?.isReady?.()) throw new Error('settings not ready')
      await writeSection((cur) => ({
        ...cur,
        telegram: { ...cur.telegram, homeChatId: chatId, homeThreadId: threadId || 0 },
      }))
    },
    persistHomes: async (nextTelegram) => {
      if (!settingsApi?.isReady?.()) throw new Error('settings not ready')
      await writeSection((cur) => ({
        ...cur,
        telegram: { ...cur.telegram, ...nextTelegram },
      }))
    },
    persistAgentModel: async ({ provider, model }) => {
      if (!settingsApi?.isReady?.()) return
      await writeSection((cur) => ({
        ...cur,
        agent: { ...cur.agent, provider, model },
      }))
    },
    // Runtime toggles from chat commands (#222): /voice summary and
    // /keyboard on|off now survive config syncs like every other writer.
    persistVoiceSummary: async (on) => {
      if (!settingsApi?.isReady?.()) return
      await writeSection((cur) => ({
        ...cur,
        tts: { ...cur.tts, voiceSummary: on },
      }))
    },
    persistQuickActions: async (on) => {
      if (!settingsApi?.isReady?.()) return
      await writeSection((cur) => ({
        ...cur,
        telegram: { ...cur.telegram, quickActions: on },
      }))
    },
  }
}
