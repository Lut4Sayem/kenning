import { useQuery } from '@tanstack/react-query'
import { dotColour } from '../ui/pageColour'
import { Link } from 'react-router-dom'
import { getDrafts } from '../api/home'
import { getRecent } from '../api/search'
import { getMe, getMySpaces } from '../api/spaces'
import { TopBar } from '../app/ShellSlots'
import Icon from '../ui/Icon'
import { timeShort } from '../ui/timeAgo'
import { useCreatePage } from '../tree/useCreatePage'
import { greetingFor, locationOf, longDate } from './home'
import s from './Home.module.css'
import PageRow, { SkeletonRows } from './PageRow'

const CARDS = 6
const DRAFTS = 5

/** Home (/app/): a greeting, the pages I opened lately, and my own drafts. Nothing that grows with the team. */
export default function Dashboard() {
  const me = useQuery({ queryKey: ['me'], queryFn: getMe })
  const spaces = useQuery({ queryKey: ['spaces'], queryFn: getMySpaces })
  const recent = useQuery({ queryKey: ['home', 'recent'], queryFn: getRecent })
  const drafts = useQuery({ queryKey: ['home', 'drafts'], queryFn: () => getDrafts(DRAFTS) })
  const priv = (spaces.data ?? []).find((sp) => sp.ownerType === 'USER')
  const { create, message } = useCreatePage(priv?.id ?? '')

  const now = new Date()
  const first = me.data?.fullName?.trim().split(/\s+/)[0]
  const greeting = greetingFor(now.getHours())
  const cards = (recent.data ?? []).slice(0, CARDS)

  return (
    <div className={s.wrap} data-bleed>
      <TopBar>
        <nav className={s.crumbs} aria-label="Breadcrumb"><span className={s.here}><Icon name="home" />Home</span></nav>
        {message && <p className={s.notice} role="alert">{message}</p>}
        <button type="button" className={s.newPage} disabled={!priv} onClick={() => void create(null)}><Icon name="plus" />New page</button>
      </TopBar>

      <div>
        <h1 className={s.hello}>
          {me.isPending ? <span className={s.skel} style={{ width: 360, maxWidth: '100%', height: 44 }} role="status" aria-label={greeting} /> : first ? `${greeting}, ${first}` : greeting}
        </h1>
        <p className={s.date}>{longDate(now)}</p>
      </div>

      <section aria-labelledby="recent-h">
        <div className={s.head}><h2 id="recent-h" className={s.sectionTitle}>Recently visited</h2></div>
        {recent.isPending ? (
          <ul className={s.cards} aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <li key={i}><span className={`${s.skel} ${s.skelCard}`} /></li>)}</ul>
        ) : recent.isError ? (
          <p className={s.retry} role="alert">Could not load your recent pages. <button type="button" onClick={() => void recent.refetch()}>Try again</button></p>
        ) : cards.length === 0 ? (
          <p className={s.empty}>Pages you open show up here.</p>
        ) : (
          <ul className={s.cards}>
            {cards.map((p) => (
              <li key={p.nodeId}>
                <Link to={`/p/${p.nodeId}`} className={s.card}>
                  <span className={s.cardDot} style={{ background: dotColour(p.color) }} aria-hidden="true" />
                  <span className={s.cardTitle} title={p.title || 'Untitled'}>{p.title || 'Untitled'}</span>
                  <span className={s.cardMeta}>
                    <span>{p.teamName == null ? 'Private' : p.spaceName}</span>
                    <time dateTime={p.openedAt ?? undefined}>{timeShort(p.openedAt ?? null)}</time>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(drafts.isPending || (drafts.data && drafts.data.total > 0)) && (
        <section aria-labelledby="drafts-h">
          <div className={s.head}>
            <h2 id="drafts-h" className={s.sectionTitle}>Your drafts</h2>
            {drafts.data && <span className={s.count}>{drafts.data.total}</span>}
          </div>
          {drafts.data ? (
            <>
              <ul className={s.list}>
                {drafts.data.items.map((d) => (
                  <PageRow key={d.nodeId} id={d.nodeId} title={d.title} color={d.color} location={locationOf(d.teamName, d.spaceName)}
                    status="DRAFT" avatar={{ name: me.data?.fullName ?? '', me: true }} when={d.updatedAt} />
                ))}
              </ul>
              {drafts.data.total > drafts.data.items.length && (
                <p className={s.moreRow}><Link to="/search?status=DRAFT" className={s.more}>View all drafts →</Link></p>
              )}
            </>
          ) : <SkeletonRows n={2} />}
        </section>
      )}
    </div>
  )
}
