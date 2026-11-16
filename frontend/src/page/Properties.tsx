import type { NodeDetail } from '../api/nodes'
import Avatar from '../ui/Avatar'
import Icon from '../ui/Icon'
import Time from '../ui/timeAgo'
import s from './Page.module.css'
import TagEditor from './TagEditor'

/** Status, Tags and Last edited under the title (DESIGN.md section 6). `changes`: the page differs from what was last published. */
export default function Properties({ node, canEdit, changes, canCompare, onCompare }: {
  node: NodeDetail
  canEdit: boolean
  changes: boolean
  canCompare: boolean
  onCompare: () => void
}) {
  const editor = node.updatedBy ?? node.createdBy
  const draft = node.publishState === 'DRAFT'
  return (
    <div className={s.props}>
      <div className={s.k}><Icon name="circle" size={14} />Status</div>
      <div className={s.v}>
        <span className={`${s.pill} ${draft ? s.draft : s.published}`}>{draft ? 'Draft' : 'Published'}</span>
        {draft && <span className={s.hint}>{canEdit ? "Still a draft. Publish it when it’s final." : 'Still a draft.'}</span>}
        {!draft && changes && canEdit && <span className={s.hint}>Edited since it was last published.</span>}
        {changes && canCompare && <button type="button" className={s.link} onClick={onCompare}>Compare</button>}
      </div>

      <div className={s.k}><Icon name="tag" size={14} />Tags</div>
      <div className={s.v}><TagEditor node={node} canEdit={canEdit} /></div>

      <div className={s.k}><Icon name="clock" size={14} />Last edited</div>
      <div className={s.v}>
        {editor ? <><Avatar name={editor.name} /><span>{editor.name}</span></> : <span className={s.hint}>Unknown</span>}
        <Time className={s.when} iso={node.contentUpdatedAt} />
      </div>
    </div>
  )
}
