import { insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { getDefaultReactSlashMenuItems, type DefaultReactSuggestionItem } from '@blocknote/react'
import { createElement } from 'react'
import Icon from '../ui/Icon'
import type { KfEditor } from './schema'

export type KfSlashItem = DefaultReactSuggestionItem & { key: string }

// BlockNote's own groups folded into the three the design shows (DESIGN.md section 7), in that order.
const GROUPS = ['Basic blocks', 'Media', 'Others']
const GROUP: Record<string, string> = { Headings: 'Basic blocks', Subheadings: 'Basic blocks', 'Basic blocks': 'Basic blocks', Media: 'Media' }

/** BlockNote's default items (text, headings, lists, quote, divider, code, image, file, table, ...) + ours, sorted by group so the arrow keys follow what is drawn. */
export function getKfSlashItems(editor: KfEditor): KfSlashItem[] {
  const items: KfSlashItem[] = [
    ...(getDefaultReactSlashMenuItems(editor) as KfSlashItem[]),
    {
      key: 'status',
      title: 'Status',
      subtext: 'A coloured label: in progress, blocked, done',
      icon: createElement(Icon, { name: 'circle', size: 18 }),
      aliases: ['status', 'lozenge', 'label', 'state'],
      group: 'Others',
      onItemClick: () => editor.insertInlineContent([{ type: 'status', props: { label: 'Status', color: 'gray' } }, ' ']),
    },
    {
      key: 'bookmark',
      title: 'Bookmark',
      subtext: 'Show a link as a card',
      icon: createElement(Icon, { name: 'link', size: 18 }),
      aliases: ['bookmark', 'link', 'url', 'embed'],
      group: 'Others',
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'bookmark' }),
    },
  ]
  const group = (i: KfSlashItem) => GROUP[i.group ?? ''] ?? 'Others'
  return items.map((i) => ({ ...i, group: group(i) })).sort((a, b) => GROUPS.indexOf(a.group!) - GROUPS.indexOf(b.group!)) // Array.sort is stable
}
