import { useQuery } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { getAttachments, getComments } from '../api/pageExtras'
import Icon from '../ui/Icon'
import Segmented from '../ui/Segmented'
import { Files } from './Files'
import { Comments, Summary } from './PageExtras'
import s from './Panel.module.css'

type Tab = 'comments' | 'files' | 'summary'

/** The page's right panel: Comments, Files and Summary (DESIGN.md section 7). Counts come from the same queries the tabs use. */
export default function PagePanel({ nodeId, spaceId, canEdit, onClose }: { nodeId: string; spaceId: string; canEdit: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('comments')
  const id = useId()
  const comments = useQuery({ queryKey: ['comments', nodeId], queryFn: () => getComments(nodeId) })
  const files = useQuery({ queryKey: ['files', nodeId], queryFn: () => getAttachments(nodeId) })
  return (
    <div className={s.panel}>
      <div className={s.top}>
        <h2 className={s.title}>Details</h2>
        <button type="button" className={s.close} aria-label="Close details" onClick={onClose}><Icon name="panel-right" /></button>
      </div>
      <Segmented<Tab> label="Page details" idPrefix={id} value={tab} onChange={setTab} options={[
        { value: 'comments', label: 'Comments', count: comments.data?.length },
        { value: 'files', label: 'Files', count: files.data?.length },
        { value: 'summary', label: 'Summary' },
      ]} />
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${tab}`} className={s.tabPanel}>
        {tab === 'comments' && <Comments key={nodeId} nodeId={nodeId} />}
        {tab === 'files' && <Files key={nodeId} nodeId={nodeId} canEdit={canEdit} />}
        {tab === 'summary' && <Summary key={nodeId} nodeId={nodeId} spaceId={spaceId} />}
      </div>
    </div>
  )
}
