import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import Dashboard from '../dashboard/Dashboard'
import Recent from '../dashboard/Recent'
import Join from '../pages/Join'
import Login from '../pages/Login'
import Logout from '../pages/Logout'
import Register from '../pages/Register'
import { ConfirmHost } from '../ui/ConfirmDialog'
import { NotFound, ScreenSkeleton } from '../ui/States'
import { ToastHost } from '../ui/Toast'
import Shell from './Shell'

// The block editor is most of the bundle: keep it out of the login and register pages.
const PageView = lazy(() => import('../page/PageView'))
const BoardView = lazy(() => import('../board/BoardView'))
const TrashPage = lazy(() => import('../trash/TrashPage'))
const TagPage = lazy(() => import('../page/TagPage'))
const SpaceHome = lazy(() => import('../page/SpaceHome'))
const Search = lazy(() => import('../pages/Search'))
const TeamLayout = lazy(() => import('../team/TeamLayout'))
const TeamOverview = lazy(() => import('../team/TeamOverview'))
const TeamPages = lazy(() => import('../team/TeamPages'))
const TeamMembers = lazy(() => import('../team/TeamMembers'))
const TeamRequests = lazy(() => import('../team/TeamMembers').then((m) => ({ default: m.TeamRequests })))
const Profile = lazy(() => import('../profile/Profile'))

export default function App() {
  return (
    <>
      <ConfirmHost />
      <ToastHost />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/register" element={<Register />} />
        <Route path="/join/:code" element={<Join />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/recent" element={<Recent />} />
          <Route path="/teams/:teamId" element={<Suspense fallback={<ScreenSkeleton />}><TeamLayout /></Suspense>}>
            <Route index element={<Suspense fallback={null}><TeamOverview /></Suspense>} />
            <Route path="pages" element={<Suspense fallback={null}><TeamPages /></Suspense>} />
            <Route path="members" element={<Suspense fallback={null}><TeamMembers /></Suspense>} />
            <Route path="requests" element={<Suspense fallback={null}><TeamRequests /></Suspense>} />
            <Route path="trash" element={<Suspense fallback={null}><TrashPage /></Suspense>} />
          </Route>
          <Route path="/profile" element={<Suspense fallback={<ScreenSkeleton />}><Profile /></Suspense>} />
          <Route path="/p/:nodeId" element={<Suspense fallback={<ScreenSkeleton />}><PageView /></Suspense>} />
          <Route path="/b/:nodeId" element={<Suspense fallback={<ScreenSkeleton />}><BoardView /></Suspense>} />
          <Route path="/s/:spaceId" element={<Suspense fallback={<ScreenSkeleton />}><SpaceHome /></Suspense>} />
          <Route path="/s/:spaceId/trash" element={<Suspense fallback={<ScreenSkeleton />}><TrashPage /></Suspense>} />
          <Route path="/tags/:tag" element={<Suspense fallback={<ScreenSkeleton />}><TagPage /></Suspense>} />
          <Route path="/search" element={<Suspense fallback={<ScreenSkeleton />}><Search /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </>
  )
}
