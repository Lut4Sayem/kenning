import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { uploadAttachment } from '../api/attachments'
import { deleteAttachment, getAttachments, type PageFile } from '../api/pageExtras'
import { safeHttpUrl } from '../editor/BookmarkBlock'
import { confirmDialog } from '../ui/ConfirmDialog'
import Icon from '../ui/Icon'
import s from './Panel.module.css'

const size = (b: number | null) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`)
// Tile tint by kind; the glyph says file or link, the colour is only a hint (the name carries the meaning).
const tintOf = (f: PageFile) => (f.url ? 'sky' : /pdf/.test(f.contentType ?? '') ? 'rose' : /image/.test(f.contentType ?? '') ? 'mint' : /sheet|excel|csv/.test(f.contentType ?? '') ? 'peach' : 'lavender')

/** The Files tab: what is attached to the page (files and links). Editors upload and delete. */
export function Files({ nodeId, canEdit }: { nodeId: string; canEdit: boolean }) {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['files', nodeId], queryFn: () => getAttachments(nodeId) })
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const refresh = () => qc.invalidateQueries({ queryKey: ['files', nodeId] })
  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment(nodeId, file),
    onSuccess: async () => { setError(''); await refresh() },
    onError: (e: Error) => setError(e.message),
  })

  async function remove(f: PageFile) {
    if (!(await confirmDialog({ title: `Delete "${f.originalName}"?`, body: "If a block in the page uses this file, it stops working. This can't be undone.", confirmLabel: 'Delete file', danger: true }))) return
    try { await deleteAttachment(f.id); setError(''); await refresh() } catch (e) { setError((e as Error).message) }
  }

  const files = list.data ?? []
  return (
    <div className={s.tabBody}>
      <div className={s.scroll}>
        {list.isPending && <div aria-hidden="true">{[0, 1].map((i) => <span key={i} className={`${s.skel} ${s.skelRow}`} />)}</div>}
        {list.isError && <p role="alert" className={s.error}>Could not load files. <button type="button" className={s.linkBtn} onClick={() => void list.refetch()}>Try again</button></p>}
        {list.isSuccess && files.length === 0 && <p className={s.empty}>{canEdit ? 'No files yet. Upload one, or drop it into the page.' : 'No files on this page.'}</p>}
        <ul className={s.list}>
          {files.map((f) => {
            const href = f.url ? safeHttpUrl(f.url) : `/api/attachments/${f.id}/download`
            const tint = tintOf(f)
            return (
              <li key={f.id} className={s.file}>
                <span className={s.tile} style={{ background: `var(--tint-${tint}-bg)`, color: `var(--tint-${tint}-fg)` }}><Icon name={f.url ? 'link' : 'file'} /></span>
                <span className={s.fileText}>
                  {href ? <a className={s.fileName} href={href} {...(f.url ? { target: '_blank', rel: 'noopener noreferrer' } : { download: '' })}>{f.originalName}</a> : <span className={s.fileName}>{f.originalName}</span>}
                  <span className={s.fileMeta}>{f.url ? 'Link' : size(f.size)}</span>
                </span>
                {canEdit && <button type="button" className={s.iconBtn} aria-label={`Delete ${f.originalName}`} onClick={() => void remove(f)}><Icon name="close" /></button>}
              </li>
            )
          })}
        </ul>
        {error && <p role="alert" className={s.error}>{error}</p>}
      </div>
      {canEdit && (
        <div className={s.footer}>
          <input ref={input} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f) }} />
          <button type="button" className={s.quietFull} disabled={upload.isPending} onClick={() => input.current?.click()}><Icon name="upload" />{upload.isPending ? 'Uploading…' : 'Upload a file'}</button>
        </div>
      )}
    </div>
  )
}
