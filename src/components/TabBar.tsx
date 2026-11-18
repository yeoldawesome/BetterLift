import { NavLink } from 'react-router-dom'
import { useNotifications } from '../lib/notifications'
import { FeedIcon, ProfileIcon, RoutinesIcon, StatsIcon, WorkoutIcon } from './icons'

const tabs = [
  { to: '/feed', label: 'Feed', Icon: FeedIcon },
  { to: '/routines', label: 'Routines', Icon: RoutinesIcon },
  { to: '/workout', label: 'Workout', Icon: WorkoutIcon },
  { to: '/stats', label: 'Stats', Icon: StatsIcon },
  { to: '/profile', label: 'Profile', Icon: ProfileIcon },
]

export default function TabBar() {
  const { count } = useNotifications()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas/90 pb-safe backdrop-blur-xl">
      <ul className="mx-auto flex max-w-lg">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${isActive ? 'text-accent' : 'text-faint'}`
              }
            >
              <span className="relative">
                <Icon />
                {to === '/profile' && count > 0 && (
                  <span className="num absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas">{count > 9 ? '9+' : count}</span>
                )}
              </span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
