import { describe, expect, it } from 'vitest'
import { verifyTicket } from '../src/ticket.js'

// Same vector as CollabTicketServiceTest on the Spring side: both must produce and accept exactly this token.
const VECTOR = 'eyJub2RlSWQiOiJuMSIsInVzZXJJZCI6InUxIiwibmFtZSI6IkFubiIsImFjY2VzcyI6IkVESVQiLCJlcG9jaCI6MCwiaWF0Ijo0MTAyNDQ0NzQwMDAwLCJleHAiOjQxMDI0NDQ4MDAwMDB9.yQGvp-wv_3sQndXhpz_t80qElFv5Ma-im9QxE-paRLg'
const NOW = 1_700_000_000_000

describe('verifyTicket', () => {
  it('acceptsValidTicket', () => {
    expect(verifyTicket(VECTOR, 'test-secret', NOW)).toEqual({
      nodeId: 'n1', userId: 'u1', name: 'Ann', access: 'EDIT', epoch: 0, iat: 4102444740000, exp: 4102444800000,
    })
  })
  it('rejectsBadSignature', () => {
    const bad = VECTOR.slice(0, -1) + (VECTOR.endsWith('w') ? 'x' : 'w')
    expect(() => verifyTicket(bad, 'test-secret', NOW)).toThrow('bad-ticket')
    expect(() => verifyTicket(VECTOR, 'other-secret', NOW)).toThrow('bad-ticket')
  })
  it('rejectsExpired', () => {
    expect(() => verifyTicket(VECTOR, 'test-secret', 4102444800001)).toThrow('expired')
  })
  it('rejectsMalformed', () => {
    expect(() => verifyTicket('abc', 'test-secret', NOW)).toThrow('bad-ticket')
    expect(() => verifyTicket('', 'test-secret', NOW)).toThrow('bad-ticket')
    expect(() => verifyTicket('a.b.c', 'test-secret', NOW)).toThrow('bad-ticket')
  })
})
