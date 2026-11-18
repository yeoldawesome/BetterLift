import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ActiveBanner } from './components/ActiveBanner'
import { RestBar } from './components/RestBar'
import { useActive } from './lib/active'
import { Spinner } from './components/ui'
import TabBar from './components/TabBar'
import { pb, useUser } from './lib/pb'
import { applyTheme } from './lib/theme'
import Auth from './screens/Auth'
import Exercises from './screens/Exercises'
import Feed from './screens/Feed'
import Friends from './screens/Friends'
import Profile from './screens/Profile'
import ProfileEdit from './screens/ProfileEdit'
import RoutineEditor from './screens/RoutineEditor'
import Routines from './screens/Routines'
import Activity from './screens/Activity'
import History from './screens/History'
import Recap from './screens/Recap'
import Settings from './screens/Settings'
import Themes from './screens/Themes'
import UserProfile from './screens/UserProfile'
import Compare from './screens/Compare'
import Workout from './screens/Workout'
import WorkoutDetail from './screens/WorkoutDetail'

const Stats = lazy(() => import('./screens/Stats'))
const Import = lazy(() => import('./screens/Import'))
const Review = lazy(() => import('./screens/Review'))
const Admin = lazy(() => import('./screens/Admin'))
const Feedback = lazy(() => import('./screens/Feedback'))
const WorkoutEdit = lazy(() => import('./screens/WorkoutEdit'))
const Notifications = lazy(() => import('./screens/Notifications'))

export default function App() {
  const user = useUser()
  const loc = useLocation()
  const { active } = useActive()

  // Account theme wins over the device copy once logged in.
  const themeKey = JSON.stringify(user?.theme ?? null)
  useEffect(() => { if (user?.theme) applyTheme(user.theme) }, [themeKey])

  useEffect(() => {
    if (pb.authStore.isValid) pb.collection('users').authRefresh().catch((e) => { if (e?.status === 401 || e?.status === 404) pb.authStore.clear() })
  }, [])

  // Hidden admin console: reachable only by typing #/admin, with its own superuser sign-in.
  if (loc.pathname.startsWith('/admin')) return <main className="h-full overflow-y-auto"><Suspense fallback={<Spinner />}><Admin /></Suspense></main>
  if (!user) return <Auth />
  // Running-workout banner everywhere except the Workout tab (which already shows the timer).
  const showBanner = !!active && loc.pathname !== '/workout'

  if (!user.bodyweight_kg || !user.height_cm) return <main className="h-full overflow-y-auto pb-10 pt-safe"><ProfileEdit onboarding /></main>

  return (
    <div className="flex h-full flex-col">
      {showBanner && <ActiveBanner />}
      <main className={`flex-1 overflow-y-auto pb-40 ${showBanner ? 'pt-2' : 'pt-safe'}`}>
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<Feed />} />
          <Route path="/w/:id" element={<WorkoutDetail />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/routines/:id" element={<RoutineEditor />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/profile/edit" element={<ProfileEdit />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/import" element={<Import />} />
          <Route path="/recap/:id" element={<Recap />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/themes" element={<Themes />} />
          <Route path="/u/:id" element={<UserProfile />} />
          <Route path="/compare/:id" element={<Compare />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/w/:id/edit" element={<WorkoutEdit />} />
          <Route path="/history" element={<History />} />
          <Route path="/activity" element={<Activity />} />
          {user.is_moderator && <Route path="/review" element={<Review />} />}
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
        </Suspense>
      </main>
      <RestBar />
      <TabBar />
    </div>
  )
}
