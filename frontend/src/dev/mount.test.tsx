import { afterEach, describe, expect, it } from 'vitest'
import { mountTokenPanel } from './mount'

afterEach(() => { document.body.innerHTML = '' })

describe('mountTokenPanel', () => {
  it('rendersNothingWhenNotInDevelopment', () => {
    expect(mountTokenPanel(false)).toBeNull()
    expect(document.getElementById('kf-dev-tokens')).toBeNull()
  })

  it('addsThePanelHostInDevelopment', () => {
    expect(mountTokenPanel(true)).not.toBeNull()
    expect(document.getElementById('kf-dev-tokens')).not.toBeNull()
  })
})
