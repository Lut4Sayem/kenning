import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { addComment, ask, deleteComment, getComments, summarize } from '../api/pageExtras'
import { getMe, getMySpaces } from '../api/spaces'
import Avatar from '../ui/Avatar'
import { confirmDialog } from '../ui/ConfirmDialog'
import Icon from '../ui/Icon'
import Markdown from '../ui/Markdown'
import { timeAgo } from '../ui/timeAgo'
import s from './Panel.module.css'

// "AI is not configured on this server" (503): the AI controls disappear instead of failing on every click.
const NOT_CONFIGURED = /not configured/i
const SHOWN = 20 // DESIGN.md section 8: the panel shows the 20 newest, the rest loads on request

/** Page-level comments. Viewers may comment too. */
export function Comments({ nodeId }: { nodeId: string }) {
  const qc = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })
  const list = useQuery({ queryKey: ['comments', nodeId], queryFn: () => getComments(nodeId) })
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  const refresh = () => qc.invalidateQueries({ queryKey: ['comments', nodeId] })
  const add = useMutation({
    mutationFn: () => addComment(nodeId, text.trim()),
    onSuccess: async () => { setText(''); setError(''); await refresh() },
    onError: (e: Error) => setError(e.message),
  })

  async function remove(id: string) {
    if (!(await confirmDialog({ title: 'Delete your comment?', body: "This can't be undone.", confirmLabel: 'Delete comment', danger: true }))) return
    try { await deleteComment(id); setError(''); await refresh() } catch (e) { setError((e as Error).message) }
  }

  const comments = list.data ?? []
  const shown = all ? comments : comments.slice(-SHOWN)
  const send = () => { if (text.trim() && !add.isPending) add.mutate() }

  return (
    <div className={s.tabBody}>
      <div className={s.scroll}>
        {list.isPending && <div aria-hidden="true">{[0, 1].map((i) => <span key={i} className={`${s.skel} ${s.skelBubble}`} />)}</div>}
        {list.isError && <p role="alert" className={s.error}>Could not load comments. <button type="button" className={s.linkBtn} onClick={() => void list.refetch()}>Try again</button></p>}
        {list.isSuccess && comments.length === 0 && <p className={s.empty}>No comments yet. Questions and suggestions go here.</p>}
        {comments.length > shown.length && <button type="button" className={s.more} onClick={() => setAll(true)}>Load earlier comments</button>}
        <ul className={s.list}>
          {shown.map((c) => {
            const name = c.createdByFullName || c.createdByEmail
            const mine = c.createdByUserId === me.data?.id
            return (
              <li key={c.id} className={s.bubble}>
                <div className={s.who}>
                  <Avatar name={name} me={mine} />
                  <strong className={s.name}>{name}</strong>
                  <time className={s.time} dateTime={c.createdAt} title={new Date(c.createdAt).toLocaleString()}>{timeAgo(c.createdAt)}</time>
                  {mine && <button type="button" className={s.iconBtn} aria-label="Delete comment" onClick={() => void remove(c.id)}><Icon name="trash" /></button>}
                </div>
                <p className={s.text}>{c.content}</p>
              </li>
            )
          })}
        </ul>
      </div>
      <form className={s.composer} onSubmit={(e) => { e.preventDefault(); send() }}>
        {error && <p role="alert" className={s.error}>{error}</p>}
        <div className={s.composerRow}>
          <textarea
            className={s.input} aria-label="Write a comment" placeholder="Write a comment…" rows={1} maxLength={2000} value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          />
          <button type="submit" className={s.send} aria-label="Send comment" disabled={!text.trim() || add.isPending}><Icon name="send" /></button>
        </div>
      </form>
    </div>
  )
}

/** The Summary tab: summarize this page, then ask a question across the project (space) it is in. */
export function Summary({ nodeId, spaceId }: { nodeId: string; spaceId: string }) {
  return (
    <div className={s.tabBody}>
      <div className={s.scroll}>
        <Summarize nodeId={nodeId} />
        <AskPanel spaceId={spaceId} />
      </div>
    </div>
  )
}

function Summarize({ nodeId }: { nodeId: string }) {
  const run = useMutation({ mutationFn: () => summarize(nodeId) })
  if (run.error && NOT_CONFIGURED.test(run.error.message)) return <p className={s.empty}>Summaries are not set up on this server.</p>
  return (
    <section aria-label="Summary" className={s.block}>
      <button type="button" className={s.quiet} onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? 'Summarizing…' : 'Summarize this page'}</button>
      {run.isPending && <div aria-hidden="true"><span className={`${s.skel} ${s.skelLine}`} /><span className={`${s.skel} ${s.skelLine}`} /></div>}
      {run.data && <div className={s.answer}><Markdown text={run.data.summary} />{run.data.trimmed && <p><em className={s.muted}>Only the start of the page was used.</em></p>}</div>}
      {run.error && <p role="alert" className={s.error}>{run.error.message}</p>}
    </section>
  )
}

/** Ask a question across the pages of the space this page is in. */
export function AskPanel({ spaceId }: { spaceId: string }) {
  const [q, setQ] = useState('')
  const run = useMutation({ mutationFn: () => ask(spaceId, q.trim()) })
  // QA-30: it reads the whole space, not just this page, so it names the space.
  const space = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces }).data?.find((x) => x.id === spaceId)
  if (run.error && NOT_CONFIGURED.test(run.error.message)) return null
  return (
    <section aria-label="Ask" className={s.block}>
      <h3 className={`ui-label ${s.blockHead}`}>{!space ? 'Ask this space' : space.ownerType === 'USER' ? 'Ask your private pages' : `Ask ${space.name}`}</h3>
      <form className={s.askRow} onSubmit={(e) => { e.preventDefault(); if (q.trim()) run.mutate() }}>
        <input className={s.field} aria-label="Question" placeholder="What do you want to know?" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} />
        <button type="submit" className={s.quiet} disabled={!q.trim() || run.isPending}>{run.isPending ? 'Asking…' : 'Ask'}</button>
      </form>
      {run.data && (
        <>
          <Markdown className={s.answer} text={run.data.answer} sources={run.data.sources} />
          {run.data.sources.length > 0 && (
            <ol className={s.sources} aria-label="Pages used">{run.data.sources.map((src) => <li key={src.id} value={src.n}><Link to={`/p/${src.id}`} className={s.link}>{src.title}</Link></li>)}</ol>
          )}
        </>
      )}
      {run.error && <p role="alert" className={s.error}>{run.error.message}</p>}
    </section>
  )
}
