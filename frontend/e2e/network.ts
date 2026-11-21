import type { BrowserContext, WebSocketRoute } from '@playwright/test'

/**
 * context.setOffline() does not cut a WebSocket that is already open, so "offline" edits would still reach the
 * collaboration service. This routes the live-editing sockets through the test so going offline really closes them,
 * and refuses new ones until the network is back, the way a real network drop does.
 */
export async function realNetwork(context: BrowserContext) {
  let offline = false
  const open = new Set<{ page: WebSocketRoute; server: WebSocketRoute }>()
  await context.routeWebSocket(/\/collab|:1234/, (page) => {
    if (offline) return void page.close({ code: 1006, reason: 'offline' }).catch(() => {})
    const pair = { page, server: page.connectToServer() }
    open.add(pair)
    page.onClose(() => open.delete(pair))
  })
  return {
    async setOffline(value: boolean) {
      offline = value
      await context.setOffline(value)
      if (!value) return
      for (const { page, server } of open) {
        await server.close().catch(() => {})
        await page.close({ code: 1006, reason: 'offline' }).catch(() => {})
      }
      open.clear()
    },
  }
}
