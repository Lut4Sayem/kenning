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
