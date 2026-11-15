import { BlockNoteEditor } from '@blocknote/core'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SlashMenu from './SlashMenu'
import { kfSchema, type KfEditor } from './schema'
import { getKfSlashItems } from './slashItems'

Element.prototype.scrollIntoView ??= () => {} // jsdom has no layout
afterEach(cleanup)
const editor = () => BlockNoteEditor.create({ schema: kfSchema }) as unknown as KfEditor

describe('slash items', () => {
  it('areSortedIntoBasicBlocksThenMediaThenOthersWithOurTwoBlocksLast', () => {
    const items = getKfSlashItems(editor())
    const groups = items.map((i) => i.group)
    expect(new Set(groups)).toEqual(new Set(['Basic blocks', 'Media', 'Others']))
    // contiguous and in that order, so the arrow keys follow what is drawn
    expect([...new Set(groups)]).toEqual(['Basic blocks', 'Media', 'Others'])
    const others = items.filter((i) => i.group === 'Others').map((i) => i.title)
    expect(others).toEqual(expect.arrayContaining(['Status', 'Bookmark']))
    for (const t of ['Status', 'Bookmark']) {
      const it = items.find((i) => i.title === t)!
      expect(it.icon, `${t} has an icon`).toBeTruthy()
      expect(it.subtext, `${t} has a description`).toBeTruthy()
    }
  })
})

describe('slash menu', () => {
  it('drawsGroupHeadingsOnceMarksTheSelectedItemAndClicks', () => {
    const items = getKfSlashItems(editor())
    const onItemClick = vi.fn()
    render(<SlashMenu items={items} loadingState="loaded" selectedIndex={1} onItemClick={onItemClick} />)
    expect(screen.getAllByRole('option')).toHaveLength(items.length)
    expect(['Basic blocks', 'Media', 'Others'].map((g) => screen.getAllByText(g).length)).toEqual([1, 1, 1])
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true')
    screen.getAllByRole('option')[0].click()
    expect(onItemClick).toHaveBeenCalledWith(items[0])
  })

  it('saysSoWhenNothingMatches', () => {
    render(<SlashMenu items={[]} loadingState="loaded" selectedIndex={undefined} />)
    expect(screen.getByText('No blocks match.')).toBeTruthy()
  })
})
