import { afterEach, expect, it, vi } from 'vitest'
import { loadTheme, saveTheme } from './theme'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

it('themeDefaultsLight', () => {
  expect(loadTheme()).toBe('light')
  localStorage.setItem('kf.board.theme', 'nonsense')
  expect(loadTheme()).toBe('light')
})

it('themeRemembered', () => {
  saveTheme('dark')
  expect(localStorage.getItem('kf.board.theme')).toBe('dark')
  expect(loadTheme()).toBe('dark')
})

it('themeDefaultsLightWhenStorageThrows', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  expect(() => saveTheme('dark')).not.toThrow()
  expect(loadTheme()).toBe('light')
})
