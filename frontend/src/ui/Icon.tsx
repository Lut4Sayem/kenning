// One inline line-icon set: 16px, stroke 1.5, currentColor (DESIGN.md section 6). Decorative: buttons carry the label.
const PATHS = {
  'chevron-down': 'M4 6l4 4 4-4',
  'chevron-right': 'M6 4l4 4-4 4',
  search: 'M7 12.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11zM14.5 14.5L11 11',
  home: 'M2.5 7.5L8 2.5l5.5 5V13a.5.5 0 01-.5.5h-3V10h-4v3.5H3a.5.5 0 01-.5-.5V7.5z',
  clock: 'M8 14a6 6 0 100-12 6 6 0 000 12zM8 4.5V8l2.5 1.5',
  plus: 'M8 3v10M3 8h10',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  grip: 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01',
  edit: 'M2.5 13.5l.7-3L10.8 3a1.4 1.4 0 012 2L5.2 12.6l-2.7.9zM9.5 4.5l2 2',
  user: 'M8 8a2.7 2.7 0 100-5.4A2.7 2.7 0 008 8zM2.8 13.5c.4-2.4 2.5-3.8 5.2-3.8s4.8 1.4 5.2 3.8',
  logout: 'M6.5 2.5h-3a1 1 0 00-1 1v9a1 1 0 001 1h3M10 5l3 3-3 3M13 8H6',
  file: 'M4 2h5l3 3v8.5a.5.5 0 01-.5.5h-7a.5.5 0 01-.5-.5v-11A.5.5 0 014 2zM9 2v3h3',
  close: 'M4 4l8 8M12 4l-8 8',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 100 4 2 2 0 000-4z',
  info: 'M8 14a6 6 0 100-12 6 6 0 000 12zM8 7.5V11M8 5.2h.01',
  'eye-off': 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 6a2 2 0 100 4 2 2 0 000-4zM2.5 2.5l11 11',
  'panel-right': 'M3.5 2.5h9a1 1 0 011 1v9a1 1 0 01-1 1h-9a1 1 0 01-1-1v-9a1 1 0 011-1zM10 2.5v11',
  'user-plus': 'M6.5 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM2 13.5c.4-2.3 2.1-3.5 4.5-3.5s4.1 1.2 4.5 3.5M12.5 5.5v4M10.5 7.5h4',
  filter: 'M2 3.5h12L9.5 9v4l-3 1.5V9L2 3.5z',
  sliders: 'M2.5 4.5h6M11.5 4.5h2M2.5 11.5h2M7.5 11.5h6M10 3v3M5 10v3',
  copy: 'M5.5 5.5h7a1 1 0 011 1v7a1 1 0 01-1 1h-7a1 1 0 01-1-1v-7a1 1 0 011-1zM3.5 10.5h-1a1 1 0 01-1-1v-7a1 1 0 011-1h7a1 1 0 011 1v1',
  layers: 'M8 2L1.5 5.5 8 9l6.5-3.5L8 2zM1.5 8.5L8 12l6.5-3.5',
  check: 'M3 8.5l3.2 3L13 4.5',
  circle: 'M8 14a6 6 0 100-12 6 6 0 000 12z',
  'arrow-up-down': 'M5 13V3M2.5 5.5L5 3l2.5 2.5M11 3v10M8.5 10.5L11 13l2.5-2.5',
} as const

export type IconName = keyof typeof PATHS

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}
