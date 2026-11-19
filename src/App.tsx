import { Suspense, lazy, useEffect, useLayoutEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
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
import MyReactions from './screens/MyReactions'
import History from './screens/History'
import Calendar from './screens/Calendar'
import Recap from './screens/Recap'
import Settings from './screens/Settings'
import Themes from './screens/Themes'
import TabBarSettings from './screens/TabBarSettings'
import { TAB_DEFS, userTabs } from './lib/tabs'
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
const Nutrition = lazy(() => import('./screens/Nutrition'))
const NutritionCalendar = lazy(() => import('./screens/NutritionCalendar'))
const NutritionGoals = lazy(() => import('./screens/NutritionGoals'))

export default function App() {
  const user = useUser()
  const loc = useLocation()
  const { active } = useActive()

  // Every page shares one scrolling <main>, so reset it per page: new pages open at the top, Back returns where you were.
  const mainRef = useRef<HTMLElement>(null)
  const scrolls = useRef(new Map<string, number>())
  const navType = useNavigationType()
  useLayoutEffect(() => {
    const m = mainRef.current
    if (m) m.scrollTop = navType === 'POP' ? scrolls.current.get(loc.key) ?? 0 : 0
  }, [loc.key])

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

  // The app opens on the first tab of the user's bottom bar.
  const home = TAB_DEFS[userTabs(user)[0]].to
  if (!user.bodyweight_kg || !user.height_cm) return <main className="h-full overflow-y-auto pb-10 pt-safe"><ProfileEdit onboarding /></main>

  return (
    <div className="flex h-full flex-col">
      {showBanner && <ActiveBanner />}
      <main ref={mainRef} onScroll={(e) => scrolls.current.set(loc.key, e.currentTarget.scrollTop)} className={`flex-1 overflow-y-auto pb-40 ${showBanner ? 'pt-2' : 'pt-safe'}`}>
        <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Navigate to={home} replace />} />
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
          <Route path="/settings/tab-bar" element={<TabBarSettings />} />
          <Route path="/themes" element={<Themes />} />
          <Route path="/u/:id" element={<UserProfile />} />
          <Route path="/compare/:id" element={<Compare />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/w/:id/edit" element={<WorkoutEdit />} />
          <Route path="/history" element={<History />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/reactions" element={<MyReactions />} />
          {user.nutrition_on && <>
            <Route path="/nutrition" element={<Nutrition />} />
            <Route path="/nutrition/calendar" element={<NutritionCalendar />} />
            <Route path="/nutrition/goals" element={<NutritionGoals />} />
          </>}
          {user.is_moderator && <Route path="/review" element={<Review />} />}
          <Route path="*" element={<Navigate to={home} replace />} />
        </Routes>
        </Suspense>
      </main>
      <RestBar />
      <TabBar />
    </div>
  )
}
