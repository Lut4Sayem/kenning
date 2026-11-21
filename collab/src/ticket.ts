// Ticket = base64url(JSON payload) + "." + base64url(HMAC-SHA256(secret, first part)). Spring signs, collab verifies.
import { createHmac, timingSafeEqual } from 'node:crypto'

export interface Ticket {
  nodeId: string
  userId: string
  name: string
  access: 'EDIT' | 'VIEW'
  epoch: number
  exp: number // epoch ms
}

export const sign = (payloadPart: string, secret: string) => createHmac('sha256', secret).update(payloadPart).digest('base64url')

export function verifyTicket(token: string, secret: string, now: number): Ticket {
  const parts = token.split('.')
  if (parts.length !== 2) throw new Error('bad-ticket')
  const [payload, mac] = parts
  const want = Buffer.from(sign(payload, secret))
  const got = Buffer.from(mac)
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw new Error('bad-ticket')
  let t: Ticket
  try {
    t = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw new Error('bad-ticket')
  }
  const ok = typeof t?.nodeId === 'string' && typeof t.userId === 'string' && typeof t.name === 'string'
    && (t.access === 'EDIT' || t.access === 'VIEW') && Number.isInteger(t.epoch) && typeof t.exp === 'number'
  if (!ok) throw new Error('bad-ticket')
  if (now > t.exp) throw new Error('expired')
  return t
}
