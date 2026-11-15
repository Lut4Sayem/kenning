import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getTagged } from '../api/nodes'
import { TopBar } from '../app/ShellSlots'
import s from '../dashboard/Home.module.css'
import PageRow, { SkeletonRows } from '../dashboard/PageRow'
import Icon from '../ui/Icon'

const PAGE = 25

/** /app/tags/:tag: every page with this tag that I can open, across my spaces (25 at a time). */
export default function TagPage() {
  const { tag = '' } = useParams()
  const pages = useQuery({ queryKey: ['tagged', tag], queryFn: () => getTagged(tag), retry: false })
  const [shown, setShown] = useState(PAGE)
  const list = pages.data ?? []

  return (
    <div className={s.wrap} data-bleed>
      <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb"><span className={s.here}><Icon name="tag" />{tag}</span></nav>
      </TopBar>

      <div>
        <h1 className={s.hello}>{tag}</h1>
        <p className={s.sub}>Pages with this tag that you can open.</p>
      </div>

      {pages.isPending ? <SkeletonRows n={6} />
        : pages.isError ? <p className={s.retry} role="alert">Could not load the pages. <button type="button" onClick={() => void pages.refetch()}>Try again</button></p>
        : list.length === 0 ? <p className={s.empty}>No page you can open has this tag. <Link to="/">Go to Home</Link></p>
        : (
          <div>
            <ul className={s.list}>
              {list.slice(0, shown).map((p) => (
                <PageRow key={p.id} id={p.id} title={p.title} location={p.spaceName} status={p.publishState} when={null} />
              ))}
            </ul>
            {list.length > shown && (
              <p className={s.moreRow}><button type="button" className={s.more} onClick={() => setShown((n) => n + PAGE)}>Load more</button></p>
            )}
          </div>
        )}
    </div>
  )
}
