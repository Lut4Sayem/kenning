import type { ReactNode } from 'react'
import Icon from '../ui/Icon'
import Popover from '../ui/Popover'
import { useCreatePage } from './useCreatePage'
import s from './Sidebar.module.css'

/** A sidebar "new" button: its menu offers a page or a board, created at the top level of the space. */
export default function NewMenu({ spaceId, label, title, className, disabled, children }: {
  spaceId: string
  label: string
  title?: string
  className: string
  disabled?: boolean
  children: ReactNode
}) {
  const { create, message } = useCreatePage(spaceId)
  return (
    <>
      <Popover label={label} menu trigger={(props) => (
        // data-new: right-clicking a row opens its "…" menu, not this one
        <button {...props} type="button" className={className} aria-label={label} title={title} disabled={disabled} data-new>{children}</button>
      )}>
        {(close) => (['PAGE', 'BOARD'] as const).map((type) => (
          <button key={type} type="button" role="menuitem" className={s.menuItem} onClick={() => { close(); void create(null, undefined, type) }}>
            <Icon name={type === 'BOARD' ? 'presentation' : 'edit'} />{type === 'BOARD' ? 'Board' : 'Page'}
          </button>
        ))}
      </Popover>
      {message && <p className={s.note} role="alert">{message}</p>}
    </>
  )
}
