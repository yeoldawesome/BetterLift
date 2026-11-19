import { useState } from 'react'
import { CloseIcon, DownIcon, LockIcon, PlusIcon, ProfileIcon, UpIcon } from '../components/icons'
import { ErrorText, Screen } from '../components/ui'
import { errMsg, pb, useUser } from '../lib/pb'
import { availableTabs, MAX_TABS, TAB_DEFS, sameTabs, userTabs, type TabId } from '../lib/tabs'

/** Settings → Bottom bar: reorder, add and remove tabs. Profile is fixed at the end. */
export default function TabBarSettings() {
  const user = useUser()!
  const [tabs, setTabs] = useState<TabId[]>(() => userTabs(user))
  // The default bar, minus Nutrition when it's turned off.
  const defaults = userTabs({ tab_bar: [], nutrition_on: user.nutrition_on })
  const [err, setErr] = useState('')

  const commit = (next: TabId[]) => {
    setTabs(next); setErr('')
    // Store [] for the default layout, so future changes to the default reach this user too.
    pb.collection('users').update(user.id, { tab_bar: sameTabs(next, defaults) ? [] : next }).catch((e) => setErr(errMsg(e)))
  }
  const move = (i: number, d: -1 | 1) => { const n = [...tabs]; [n[i], n[i + d]] = [n[i + d], n[i]]; commit(n) }
  const remove = (id: TabId) => commit(tabs.filter((t) => t !== id))
  const add = (id: TabId) => commit([...tabs, id])
  const available = availableTabs(user).filter((t) => !tabs.includes(t))
  const full = tabs.length >= MAX_TABS

  const iconBtn = 'grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted transition active:scale-95 disabled:opacity-30'

  return (
    <Screen title="Bottom bar" back>
      <ErrorText>{err}</ErrorText>

      {/* Live preview */}
      <div className="overflow-hidden rounded-2xl border border-line bg-canvas">
        <ul className="flex">
          {[...tabs.map((id) => TAB_DEFS[id]), { to: '/profile', label: 'Profile', Icon: ProfileIcon }].map(({ to, label, Icon }, i) => (
            <li key={to} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${i === 0 ? 'text-accent' : 'text-faint'}`}>
              <Icon /><span className="max-w-full truncate px-0.5">{label}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-muted">The app opens on your first tab. Up to {MAX_TABS} tabs plus Profile.</p>

      <h2 className="pt-2 text-sm font-bold uppercase tracking-wider text-muted">In your bar</h2>
      <ul className="space-y-2">
        {tabs.map((id, i) => {
          const { label, Icon } = TAB_DEFS[id]
          return (
            <li key={id} className="flex items-center gap-2 rounded-xl border border-line bg-surface p-2 pl-3">
              <Icon width={22} height={22} className="shrink-0 text-accent" />
              <span className="min-w-0 flex-1 truncate font-bold">{label}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} className={iconBtn} aria-label={`Move ${label} earlier`}><UpIcon width={18} height={18} /></button>
              <button onClick={() => move(i, 1)} disabled={i === tabs.length - 1} className={iconBtn} aria-label={`Move ${label} later`}><DownIcon width={18} height={18} /></button>
              <button onClick={() => remove(id)} disabled={tabs.length <= 1} className={`${iconBtn} text-danger`} aria-label={`Remove ${label}`}><CloseIcon width={18} height={18} /></button>
            </li>
          )
        })}
        <li className="flex items-center gap-2 rounded-xl border border-dashed border-line p-2 pl-3 text-muted">
          <ProfileIcon width={22} height={22} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate font-bold">Profile</span>
          <span className="flex items-center gap-1 pr-2 text-xs font-semibold"><LockIcon width={14} height={14} /> Always last</span>
        </li>
      </ul>

      {available.length > 0 && (
        <>
          <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">Add a tab</h2>
          {full && <p className="text-xs text-muted">Your bar is full. Remove a tab to add another.</p>}
          <ul className="space-y-2">
            {available.map((id) => {
              const { label, Icon } = TAB_DEFS[id]
              return (
                <li key={id}>
                  <button onClick={() => add(id)} disabled={full}
                    className="flex w-full items-center gap-2 rounded-xl border border-line bg-surface p-2 pl-3 text-left transition active:scale-[0.99] disabled:opacity-40">
                    <Icon width={22} height={22} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1 truncate font-bold">{label}</span>
                    <span className="grid size-9 place-items-center rounded-lg bg-accent/15 text-accent"><PlusIcon width={18} height={18} /></span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {!sameTabs(tabs, defaults) && (
        <button onClick={() => commit(defaults)} className="mt-2 w-full rounded-xl bg-surface-2 py-3 text-sm font-bold text-muted">Reset to default</button>
      )}
    </Screen>
  )
}
