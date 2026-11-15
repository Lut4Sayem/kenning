import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { getRecent } from '../api/search'
import { TopBar } from '../app/ShellSlots'
import Icon from '../ui/Icon'
import { groupByDay, locationOf } from './home'
import s from './Home.module.css'
import PageRow, { SkeletonRows } from './PageRow'

/** /app/recent: the pages I opened lately (the server keeps 20), newest first, by day. */
export default function Recent() {
  const recent = useQuery({ queryKey: ['home', 'recent'], queryFn: getRecent })
  const groups = groupByDay(recent.data ?? [], (p) => p.openedAt)

  return (
    <div className={s.wrap} data-bleed>
      <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb"><span className={s.here}><Icon name="clock" />Recent</span></nav>
      </TopBar>

      <div>
        <h1 className={s.hello}>Recent</h1>
        <p className={s.sub}>Pages you opened lately.</p>
      </div>

      {recent.isPending ? <SkeletonRows n={6} />
        : recent.isError ? <p className={s.retry} role="alert">Could not load your recent pages. <button type="button" onClick={() => void recent.refetch()}>Try again</button></p>
        : groups.length === 0 ? <p className={s.empty}>Pages you open show up here. <Link to="/">Go to Home</Link></p>
        : (
          <div className={s.groups}>
            {groups.map((g) => (
              <section key={g.label} aria-labelledby={`g-${g.label}`}>
                <h2 id={`g-${g.label}`} className={s.groupLabel}>{g.label}</h2>
                <ul className={s.list}>
                  {g.items.map((p) => (
                    <PageRow key={p.nodeId} id={p.nodeId!} title={p.title} location={locationOf(p.teamName, p.spaceName)}
                      status={p.publishState} when={p.openedAt ?? null} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
    </div>
  )
}
