/** DESIGN.md page palette (section 2): picked at random when a page is created. No colour = gray. */
export const PAGE_COLOURS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const

/** CSS background for a page's dot. */
export const dotColour = (c?: string | null) => `var(--page-${c ?? 'gray'})`
