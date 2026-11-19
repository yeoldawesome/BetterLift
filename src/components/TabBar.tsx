import { NavLink } from 'react-router-dom'
import { useNotifications } from '../lib/notifications'
import { nutritionNew, useUser } from '../lib/pb'
import { TAB_DEFS, userTabs } from '../lib/tabs'
import { ProfileIcon } from './icons'

/** Bottom bar: the user's chosen tabs (Settings → Bottom bar), with Profile always last. */
export default function TabBar() {
  const { count } = useNotifications()
  const user = useUser()
  const tabs = [...userTabs(user).map((id) => TAB_DEFS[id]), { to: '/profile', label: 'Profile', Icon: ProfileIcon }]
  // The unread badge sits on Alerts when it's in the bar, otherwise on Profile.
  const badgeOn = tabs.some((t) => t.to === '/notifications') ? '/notifications' : '/profile'
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas/90 pb-safe backdrop-blur-xl">
      <ul className="mx-auto flex max-w-lg">
        {tabs.map(({ to, label, Icon }) => (
          <li key={to} className="min-w-0 flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${isActive ? 'text-accent' : 'text-faint'}`
              }
            >
              <span className="relative">
                <Icon />
                {/* "New: Nutrition" hint until the user taps it in Settings. */}
                {to === '/profile' && nutritionNew(user) && !(badgeOn === '/profile' && count > 0) && (
                  <span aria-label="New in Settings" className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-danger ring-2 ring-canvas" />
                )}
                {to === badgeOn && count > 0 && (
                  <span className="num absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas">{count > 9 ? '9+' : count}</span>
                )}
              </span>
              <span className="max-w-full truncate px-0.5">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
