import { Server } from '@hocuspocus/server'
import type { Config } from './config.js'
import { log } from './log.js'
import { verifyTicket } from './ticket.js'

export interface Ctx {
  userId: string
  name: string
  access: 'EDIT' | 'VIEW'
  epoch: number
  connectedAt: number
}

/** Rejects a connection; the provider gets onAuthenticationFailed({reason}). */
const deny = (reason: string) => ({ reason })

export function createServer(config: Config) {
  return new Server<Ctx>({
    port: config.port,
    quiet: true,
    stopOnSignals: true,
    debounce: 2000,
    maxDebounce: 10_000,

    async onAuthenticate({ token, documentName, requestHeaders, connectionConfig }) {
      if (requestHeaders.get('origin') !== config.appOrigin) throw deny('bad-origin')
      let t
      try {
        t = verifyTicket(token, config.secret, Date.now())
      } catch (e) {
        throw deny((e as Error).message)
      }
      if (t.nodeId !== documentName) throw deny('bad-ticket')
      // VIEW: the server drops their document updates; awareness still works so they show in the avatar stack
      connectionConfig.readOnly = t.access !== 'EDIT'
      return { userId: t.userId, name: t.name, access: t.access, epoch: t.epoch, connectedAt: Date.now() }
    },

    async connected({ documentName, context }) {
      log('connect', { nodeId: documentName, userId: context.userId, access: context.access })
    },

    async onDisconnect({ documentName, context }) {
      log('disconnect', { nodeId: documentName, userId: context?.userId })
    },

    async onRequest({ request, response }) {
      if (request.url === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"status":"UP"}')
        throw null // handled: skip the default response
      }
    },
  })
}
