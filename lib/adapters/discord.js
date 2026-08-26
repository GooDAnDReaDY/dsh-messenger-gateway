// Discord adapter — planned for a future release.
export class DiscordAdapter {
  constructor() { this.name = 'discord' }
  async start() { throw new Error('Discord adapter is not implemented yet') }
  stop() {}
}
