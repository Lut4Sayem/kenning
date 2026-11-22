import { describe, expect, it } from 'vitest'
import { USER_COLORS, userColor } from './userColor'

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('userColor', () => {
  it('stablePerUser', () => {
    expect(userColor('665f1c2e9b1d4a0012345678')).toBe(userColor('665f1c2e9b1d4a0012345678'))
  })
  it('alwaysInPalette', () => {
    for (let i = 0; i < 50; i++) expect(USER_COLORS).toContain(userColor(`user-${i}`))
  })
  it('spreadsAcrossPalette', () => {
    const used = new Set(Array.from({ length: 100 }, (_, i) => userColor(`6650${i.toString(16).padStart(20, '0')}`)))
    expect(used.size).toBeGreaterThanOrEqual(6)
  })
  it('whiteTextIsReadable', () => {
    for (const c of USER_COLORS) expect(1.05 / (luminance(c) + 0.05)).toBeGreaterThanOrEqual(4.5)
  })
})
