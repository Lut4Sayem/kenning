// The board's own tool row, in the WB 7.5 order. Excalidraw's desktop toolbar can't be reordered and has no sticky note,
// so it is hidden; its keyboard shortcuts still work, and phones keep its compact toolbar (WB 7.10).
import Icon, { type IconName } from '../ui/Icon'
import type { StyleMode } from './style'
import StyleSwitch from './StyleSwitch'
import s from './Board.module.css'

const TOOLS = [
  ['selection', 'Select', 'cursor', 'V'],
  ['hand', 'Hand', 'hand', 'H'],
  ['freedraw', 'Pen', 'edit', 'P'],
  ['eraser', 'Eraser', 'eraser', 'E'],
  ['rectangle', 'Rectangle', 'rectangle', 'R'],
  ['ellipse', 'Ellipse', 'circle', 'O'],
  ['diamond', 'Diamond', 'diamond', 'D'],
  ['arrow', 'Arrow', 'arrow', 'A'],
  ['line', 'Line', 'line', 'L'],
  ['text', 'Text', 'text', 'T'],
] as const satisfies readonly (readonly [string, string, IconName, string])[]

export type Tool = (typeof TOOLS)[number][0] | 'laser'

interface Props {
  editable: boolean
  active: string
  mode: StyleMode
  onTool: (tool: Tool) => void
  onSticky: () => void
  onMode: (mode: StyleMode) => void
  onFit: () => void
  /** A mouse pick hands the keyboard back to the canvas; a keyboard user's focus stays put. */
  onMousePick: () => void
}

export default function Toolbar({ editable, active, mode, onTool, onSticky, onMode, onFit, onMousePick }: Props) {
  const button = (label: string, icon: IconName, title: string, run: () => void, pressed?: boolean, className?: string) => (
    <button key={label} type="button" className={className} aria-label={label} title={title} aria-pressed={pressed}
      onClick={(e) => {
        run()
        if (e.detail > 0) onMousePick()
      }}>
      <Icon name={icon} />
    </button>
  )
  return (
    <div role="toolbar" aria-label="Board tools" className={s.toolbar}>
      {editable && (
        <>
          {TOOLS.map(([tool, label, icon, key]) => button(label, icon, `${label} (${key})`, () => onTool(tool), active === tool, s.tool))}
          {button('Sticky note', 'sticky', 'Sticky note (then Enter to type)', onSticky, undefined, s.tool)}
          {button('Laser pointer', 'zap', 'Laser pointer (K)', () => onTool('laser'), active === 'laser', s.tool)}
          <StyleSwitch mode={mode} onChange={onMode} />
        </>
      )}
      {button('Zoom to fit', 'fit', 'Zoom to fit (Shift+1)', onFit)}
    </div>
  )
}
