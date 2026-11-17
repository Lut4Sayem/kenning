import { describe, expect, it } from 'vitest'
import { wave } from './AuthStage'

describe('AuthStage wave', () => {
  it('leavesAndArrivesFlatWithControlsAt45And55Percent', () => {
    expect(wave([100, 50], [300, 200])).toBe('M100 50 C190 50 210 200 300 200')
  })
  it('worksRightToLeft', () => {
    expect(wave([300, 80], [100, 94])).toBe('M300 80 C210 80 190 94 100 94')
  })
})

describe('AuthStage card end', async () => {
  const { cardEndY, doubleWave } = await import('./AuthStage')
  it('keepsAFarEndWhereItLands', () => expect(cardEndY(100, 300, 600)).toBe(300))
  it('movesANearEndAtLeast48pxTowardTheCentre', () => {
    expect(cardEndY(320, 300, 600)).toBe(368) // 320 - 48 does not fit
    expect(cardEndY(500, 300, 600)).toBe(452) // both fit: the one nearer the centre (450)
  })
  it('fallsBackToADoubleWaveWhen48pxDoesNotFit', () => {
    expect(cardEndY(320, 300, 340)).toBeNull()
    expect(doubleWave([0, 100], [200, 100])).toBe('M0 100 C45 100 55 80 100 80 C145 80 155 100 200 100')
  })
})
