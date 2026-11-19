import type { ComponentType, SVGProps } from 'react'
import { BellIcon, CalendarIcon, ExercisesIcon, FeedIcon, FriendsIcon, HistoryIcon, NutritionIcon, RoutinesIcon, StatsIcon, WorkoutIcon } from '../components/icons'
import type { User } from './pb'

/** Screens that can sit in the bottom bar. Profile is always there (last), so it isn't listed. */
export const TAB_DEFS = {
  feed: { to: '/feed', label: 'Feed', Icon: FeedIcon },
  routines: { to: '/routines', label: 'Routines', Icon: RoutinesIcon },
  workout: { to: '/workout', label: 'Workout', Icon: WorkoutIcon },
  nutrition: { to: '/nutrition', label: 'Nutrition', Icon: NutritionIcon },
  stats: { to: '/stats', label: 'Stats', Icon: StatsIcon },
  history: { to: '/history', label: 'History', Icon: HistoryIcon },
  calendar: { to: '/calendar', label: 'Calendar', Icon: CalendarIcon },
  friends: { to: '/friends', label: 'Friends', Icon: FriendsIcon },
  exercises: { to: '/exercises', label: 'Exercises', Icon: ExercisesIcon },
  notifications: { to: '/notifications', label: 'Alerts', Icon: BellIcon },
} satisfies Record<string, { to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }>

export type TabId = keyof typeof TAB_DEFS
export const ALL_TABS = Object.keys(TAB_DEFS) as TabId[]
export const DEFAULT_TABS: TabId[] = ['feed', 'routines', 'workout', 'nutrition', 'stats']
/** Tabs besides Profile; six across is as many as fit comfortably on a phone. */
export const MAX_TABS = 5

/** The user's saved bar, cleaned up (unknown/duplicate ids dropped, capped); the default layout when unset or empty. */
export function userTabs(user: Pick<User, 'tab_bar'> & Partial<Pick<User, 'nutrition_on'>> | null | undefined): TabId[] {
  const allowed = (t: string): t is TabId => t in TAB_DEFS && (t !== 'nutrition' || !!user?.nutrition_on)
  const saved = Array.isArray(user?.tab_bar) ? user.tab_bar : []
  const ok = [...new Set(saved.filter(allowed))].slice(0, MAX_TABS)
  return ok.length ? ok : DEFAULT_TABS.filter(allowed)
}
/** Tabs that can be added: Nutrition only while nutrition tracking is on. */
export const availableTabs = (user: Partial<Pick<User, 'nutrition_on'>> | null | undefined) => ALL_TABS.filter((t) => t !== 'nutrition' || !!user?.nutrition_on)

export const sameTabs = (a: TabId[], b: TabId[]) => a.length === b.length && a.every((t, i) => t === b[i])
