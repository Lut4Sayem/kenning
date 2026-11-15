import type { Theme } from '@blocknote/mantine'

/** BlockNote's own colours, from the design tokens (they are CSS variables, so a theme change in tokens.css reaches the editor). */
export const kfTheme: Theme = {
  colors: {
    editor: { text: 'var(--ink-doc)', background: 'var(--canvas)' },
    menu: { text: 'var(--ink)', background: 'var(--canvas)' },
    tooltip: { text: 'var(--on-primary)', background: 'var(--primary)' },
    hovered: { text: 'var(--ink)', background: 'var(--surface-card-hover)' },
    selected: { text: 'var(--ink)', background: 'var(--callout)' },
    disabled: { text: 'var(--ink-muted)', background: 'var(--surface-card)' },
    shadow: 'rgb(20 20 15 / 0.18)',
    border: 'rgb(28 27 23 / 0.09)',
    sideMenu: 'var(--ink-muted)',
  },
  borderRadius: 8,
  fontFamily: 'var(--font-sans)',
}
