import { useEffect, type ComponentType, type SVGProps } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useNotifications } from '../lib/notifications'
import { nutritionNew, useUser } from '../lib/pb'
import { TAB_DEFS, userTabs } from '../lib/tabs'
import { BarcodeIcon, BoltIcon, BookIcon, NutritionIcon, PlusIcon, ProfileIcon } from './icons'

type Tab = { to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }
/** Food actions that replace the other tabs while you're in Nutrition. `add` opens that part of the log-food sheet. */
const FOOD_ACTIONS: { add: string; label: string; Icon: Tab['Icon'] }[] = [
  { add: 'search', label: 'Add Food', Icon: PlusIcon },
  { add: 'meals', label: 'Meals', Icon: BookIcon },
  { add: 'scan', label: 'Scan', Icon: BarcodeIcon },
  { add: 'quick', label: 'Quick Add', Icon: BoltIcon },
]
// Where you were before opening Nutrition, so tapping the apple again takes you back.
let lastOutside = ''

/** Bottom bar: the user's chosen tabs (Settings → Bottom bar), with Profile always last. In Nutrition it turns into a food toolbar. */
export default function TabBar() {
  const { count: notes, messageCount } = useNotifications()
  const user = useUser()
  const loc = useLocation()
  const nav = useNavigate()
  const food = !!user?.nutrition_on && loc.pathname.startsWith('/nutrition')
  useEffect(() => { if (!food) lastOutside = loc.pathname + loc.search }, [food, loc.pathname, loc.search])

  const userList: Tab[] = [...userTabs(user).map((id) => TAB_DEFS[id]), { to: '/profile', label: 'Profile', Icon: ProfileIcon }]
  // Nutrition removed from the bar but opened another way: it still gets the apple, tucked in at the left.
  const tabs = food && !userList.some((t) => t.to === '/nutrition') ? [{ to: '/nutrition', label: 'Nutrition', Icon: NutritionIcon }, ...userList] : userList
  const badgeOn = tabs.some((t) => t.to === '/notifications') ? '/notifications' : '/profile'
  const count = badgeOn === '/profile' ? notes + messageCount : notes
  const inBar = userList.some((t) => t.to === '/nutrition')

  const act = (add: string) => {
    if (add === 'meals') return nav('/nutrition/meals')
    const d = loc.pathname === '/nutrition' ? new URLSearchParams(loc.search).get('d') : null
    nav(`/nutrition?${new URLSearchParams({ ...(d ? { d } : {}), add })}`, { replace: loc.pathname === '/nutrition' })
  }
  // Tapping the apple in food mode leaves Nutrition; anywhere else it opens it.
  const leave = () => nav(lastOutside && !lastOutside.startsWith('/nutrition') ? lastOutside : '/')

  // Every item stays mounted and animates its width (flex-grow): the tabs before the apple shrink away so it slides left,
  // the tabs after it shrink away, and the food actions grow in to its right.
  const cell = (show: boolean) => `min-w-0 overflow-hidden transition-[flex-grow,opacity] duration-300 ease-out ${show ? 'grow opacity-100' : 'pointer-events-none grow-0 opacity-0'}`
  const base = 'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition'
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-canvas/90 pb-safe backdrop-blur-xl" data-food-mode={food || undefined}>
      <ul className="mx-auto flex max-w-lg">
        {tabs.map(({ to, label, Icon }) => {
          const apple = to === '/nutrition'
          if (apple && food) return (
            <li key={to} className={`${cell(true)} basis-0`}>
              <button onClick={leave} aria-label="Close Nutrition" className={`${base} w-full text-accent`}>
                <span className="grid size-[26px] place-items-center rounded-full bg-accent/15 ring-1 ring-accent/40"><Icon width={20} height={20} /></span>
                <span className="max-w-full truncate px-0.5">{label}</span>
              </button>
            </li>
          )
          return (
            <li key={to} className={`${cell(!food && (!apple || inBar))} basis-0`} aria-hidden={food || undefined}>
              <NavLink to={to} tabIndex={food ? -1 : undefined} className={({ isActive }) => `${base} ${isActive ? 'text-accent' : 'text-faint'}`}>
                <span className="relative">
                  <Icon />
                  {to === '/profile' && (nutritionNew(user) || (badgeOn !== '/profile' && messageCount > 0)) && !(badgeOn === '/profile' && count > 0) && (
                    <span aria-label="New in Settings" className="absolute -right-1 -top-0.5 size-2.5 rounded-full bg-danger ring-2 ring-canvas" />
                  )}
                  {to === badgeOn && count > 0 && (
                    <span className="num absolute -right-2 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-canvas">{count > 9 ? '9+' : count}</span>
                  )}
                </span>
                <span className="max-w-full truncate px-0.5">{label}</span>
              </NavLink>
            </li>
          )
        }).flatMap((el, i) => tabs[i].to === '/nutrition' ? [el, ...FOOD_ACTIONS.map(({ add, label, Icon }, k) => (
          <li key={add} className={`${cell(food)} basis-0`} style={{ transitionDelay: food ? `${60 + k * 40}ms` : '0ms' }} aria-hidden={!food || undefined}>
            <button onClick={() => act(add)} tabIndex={food ? undefined : -1}
              className={`${base} w-full ${add === 'meals' && loc.pathname === '/nutrition/meals' ? 'text-accent' : 'text-ink'}`}>
              <Icon />
              <span className="max-w-full truncate px-0.5">{label}</span>
            </button>
          </li>
        ))] : [el])}
      </ul>
    </nav>
  )
}
