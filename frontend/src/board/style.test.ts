import { afterEach, expect, it, vi } from 'vitest'
import { loadMode, saveMode, styleDefaults } from './style'

vi.mock('@excalidraw/excalidraw', () => ({ FONT_FAMILY: { Nunito: 6 } }))

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('sketchDefaults', () => {
  expect(styleDefaults('sketch')).toEqual({
    currentItemRoughness: 1, currentItemRoundness: 'round', currentItemArrowType: 'round',
    gridModeEnabled: false, objectsSnapModeEnabled: false, currentItemFontFamily: 6,
  })
})

it('preciseDefaults', () => {
  expect(styleDefaults('precise')).toEqual({
    currentItemRoughness: 0, currentItemRoundness: 'sharp', currentItemArrowType: 'elbow',
    gridModeEnabled: true, objectsSnapModeEnabled: true, currentItemFontFamily: 6,
  })
})

it('modeRemembered', () => {
  expect(loadMode()).toBe('sketch')
  saveMode('precise')
  expect(localStorage.getItem('kf.board.style')).toBe('precise')
  expect(loadMode()).toBe('precise')
})

it('modeDefaultsToSketchWhenStorageThrows', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => saveMode('precise')).not.toThrow()
  expect(loadMode()).toBe('sketch')
})
