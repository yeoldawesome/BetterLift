import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, CalendarIcon, ChevronIcon, CommentIcon, DownIcon, ExercisesIcon, FriendsIcon, HistoryIcon, ImportIcon, PaletteIcon, PlusIcon, RoutinesIcon, SettingsIcon, SmileIcon, StatsIcon, TrendIcon, TrophyIcon } from '../components/icons'
import { Avatar, Card, ErrorText } from '../components/ui'
import { resizeImage } from '../lib/image'
import { useNotifications } from '../lib/notifications'
import { calendarLink } from './Calendar'
import { resetExercises } from '../lib/exercises'
import { idbClear } from '../lib/idb'
import { disablePush } from '../lib/push'
import { invalidateStats } from '../lib/statsData'
import { fmtDur, fmtHeight, fmtVol, fmtW } from '../lib/format'
import { errMsg, me,nutritionNew, pb, useUnit, useUser, type Friendship, type Unit, type Workout } from '../lib/pb'

// Commit + build time of this copy of the app (set at build; "dev" when running locally).
const VERSION = (() => {
  const sha = (import.meta.env.VITE_COMMIT as string | undefined)?.slice(0, 7) || 'dev'
  const at = new Date(__BUILD_TIME__).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return `Version ${sha} · built ${at}`
})()

type Tile = { to: string; label: string; icon: typeof StatsIcon; badge?: number; dot?: boolean }
type WRow = Pick<Workout, 'id' | 'started_at' | 'duration_s' | 'volume_kg'>

export default function Profile() {
  const user = useUser()!
  const unit = useUnit()
  const [pending, setPending] = useState(0)
  const [toReview, setToReview] = useState(0)
  const [ws, setWs] = useState<WRow[]>([])
  const [photoMenu, setPhotoMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const setPhoto = async (f?: File) => {
    setPhotoMenu(false)
    if (!f) return
    setErr(''); setBusy(true)
    try { await pb.collection('users').update(user.id, { avatar: await resizeImage(f) }) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }
  const removePhoto = async () => {
    setPhotoMenu(false); setBusy(true)
    try { await pb.collection('users').update(user.id, { avatar: null }) } catch (e) { setErr(errMsg(e)) } finally { setBusy(false) }
  }

  useEffect(() => {
    const uid = me()
    pb.collection('workouts').getFullList<WRow>({ filter: pb.filter('user = {:u}', { u: uid }), fields: 'id,started_at,duration_s,volume_kg', sort: 'started_at' })
      .then(setWs).catch(() => {})
    pb.collection('friendships').getList<Friendship>(1, 1, { filter: pb.filter('addressee = {:u} && status = "pending"', { u: uid }) }).then((r) => setPending(r.totalItems)).catch(() => {})
    if (pb.authStore.record?.is_moderator) pb.collection('exercises').getList(1, 1, { filter: 'review_status = "pending"' }).then((r) => setToReview(r.totalItems)).catch(() => {})
  }, [])

  const notes = useNotifications()
  const tiles: Tile[] = [
    { to: '/routines', label: 'Routines', icon: RoutinesIcon },
    { to: '/exercises', label: 'Exercises', icon: ExercisesIcon, dot: notes.has('exercises') },
    { to: '/stats', label: 'Stats', icon: StatsIcon },
    { to: '/history', label: 'History', icon: HistoryIcon },
    { to: '/reactions', label: 'Reactions', icon: SmileIcon },
    { to: notes.messageCount && !pending ? '/friends?tab=messages' : '/friends', label: 'Friends', icon: FriendsIcon, badge: pending + notes.messageCount, dot: notes.has('friends') },
    { to: '/import', label: 'Import / Export', icon: ImportIcon },
    { to: '/themes', label: 'Themes', icon: PaletteIcon },
    { to: '/feedback', label: 'Feedback', icon: CommentIcon, dot: notes.has('feedback') },
    { to: '/settings', label: 'Settings', icon: SettingsIcon, dot: nutritionNew(user) },
    ...(user.is_moderator ? [{ to: '/review', label: 'Review', icon: TrophyIcon, badge: toReview }] : []),
  ]

  // Stop this phone's pushes first (needs the login), then wipe on-device caches.
  const logout = async () => { await disablePush().catch(() => {}); resetExercises(); idbClear(); invalidateStats(); pb.authStore.clear() }

  return (
    <section className="mx-auto max-w-lg space-y-3 px-safe pb-4">
      {/* Hero: photo + name top-left (tap the photo to change it), notifications + settings top-right. */}
      <div className="relative mt-2 overflow-hidden rounded-3xl border border-line px-5 pb-12 pt-4"
        style={{ background: 'radial-gradient(120% 70% at 50% 100%, color-mix(in srgb, var(--color-accent) 40%, transparent), transparent 70%), linear-gradient(180deg, color-mix(in srgb, var(--color-accent) 22%, var(--color-surface)) 0%, color-mix(in srgb, var(--color-accent) 10%, var(--color-surface)) 55%, var(--color-surface) 100%)' }}>
        <div className="flex items-start justify-between gap-3">
          <button onClick={() => setPhotoMenu(true)} className="relative shrink-0 rounded-full ring-2 ring-accent/60" aria-label="Change profile picture">
            <Avatar user={user} size={64} />
            <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-canvas bg-accent text-accent-ink">
              {busy ? <span className="size-2.5 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" /> : <PlusIcon width={12} height={12} />}
            </span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-2xl font-extrabold">{user.name || user.username}</p>
            <p className="truncate text-sm font-bold text-accent">@{user.username}</p>
            <p className="num mt-0.5 text-xs text-muted">{fmtHeight(user.height_cm, unit)} · {user.bodyweight_kg ? `${fmtW(user.bodyweight_kg, unit)} ${unit}` : '—'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Link to="/notifications" className="relative grid size-10 place-items-center rounded-full bg-black/30" aria-label="Notifications">
              <BellIcon width={22} height={22} />
              {notes.count > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{notes.count > 9 ? '9+' : notes.count}</span>}
            </Link>
            <Link to="/settings" className="relative grid size-10 place-items-center rounded-full bg-black/30" aria-label="Settings"><SettingsIcon width={22} height={22} />{nutritionNew(user) && <span className="absolute right-0.5 top-0.5 size-2.5 rounded-full bg-danger ring-2 ring-canvas" />}</Link>
          </div>
        </div>
        <Link to="/profile/edit" className="absolute bottom-3 right-4 rounded-full bg-black/30 px-3 py-1 text-xs font-bold">Edit</Link>
      </div>
      <ErrorText>{err}</ErrorText>
      <div className="grid grid-cols-5 gap-y-4 py-2">
        {tiles.map(({ to, label, icon: Icon, badge, dot }) => (
          <Link key={to} to={to} className="relative flex flex-col items-center gap-1 active:opacity-70">
            <span className="grid size-12 place-items-center rounded-2xl bg-surface-2 text-accent"><Icon width={26} height={26} /></span>
            <span className="w-full truncate text-center text-[11px] font-bold">{label}</span>
            {!!badge && <span className="num absolute right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{badge}</span>}
            {dot && !badge && <span className="absolute right-3 top-0 size-2 rounded-full bg-danger" aria-label="New" />}
          </Link>
        ))}
      </div>
      <Memories ws={ws} />
      <TotalCard ws={ws} unit={unit} />
      <button onClick={logout} className="w-full py-4 text-sm font-bold text-danger">Log out</button>
      <p className="num -mt-2 pb-2 text-center text-[11px] text-faint">{VERSION}</p>
      {photoMenu && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60" onClick={() => setPhotoMenu(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg space-y-2 rounded-t-3xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <h2 className="pb-1 text-lg font-extrabold">Profile picture</h2>
            {/* A plain image/* input lets iPhone offer Photo Library, Take Photo or Files. */}
            <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-accent font-bold text-accent-ink">
              Choose photo
              <input type="file" accept="image/*" className="hidden" onChange={(e) => { setPhoto(e.target.files?.[0]); e.target.value = '' }} />
            </label>
            {user.avatar && <button onClick={removePhoto} className="h-12 w-full rounded-2xl bg-danger/15 font-bold text-danger">Remove photo</button>}
            <button onClick={() => setPhotoMenu(false)} className="h-12 w-full rounded-2xl bg-surface-2 font-bold">Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}

const DAY = 86400000
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** Last two weeks (Sun–Sat) as a calendar; days you trained are lit, with a count when there was more than one. */
function Memories({ ws }: { ws: WRow[] }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const start = new Date(today); start.setDate(today.getDate() - today.getDay() - 7)
  const byDay = new Map<string, WRow[]>()
  ws.forEach((w) => { const k = dayKey(new Date(w.started_at)); byDay.set(k, [...(byDay.get(k) ?? []), w]) })
  const days = Array.from({ length: 14 }, (_, i) => new Date(start.getTime() + i * DAY + 3600000)).map((d) => { d.setHours(0, 0, 0, 0); return d })
  return (
    <Link to="/calendar" className="block space-y-3 rounded-2xl border border-line bg-surface p-4 active:opacity-80">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-extrabold"><CalendarIcon width={24} height={24} className="text-accent" />Memories</h2>
        <span className="flex items-center text-sm font-bold text-accent">Calendar<ChevronIcon width={16} height={16} /></span>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => <span key={d} className="text-xs font-semibold text-faint">{d}</span>)}
        {days.map((d) => {
          const list = byDay.get(dayKey(d)) ?? []
          const isToday = d.getTime() === today.getTime(), future = d > today
          const cls = `relative grid aspect-square place-items-center rounded-xl text-sm font-bold ${list.length ? 'bg-accent/25 text-ink ring-1 ring-accent/60' : 'bg-surface-2 text-muted'} ${isToday ? 'ring-2 ring-accent' : ''} ${future ? 'opacity-40' : ''}`
          const inner = <><span className="relative num">{d.getDate()}</span>{list.length > 0 && <span className="absolute bottom-1.5 left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-accent" />}
            {list.length > 1 && <span className="num absolute bottom-0.5 right-1 text-[10px] text-accent">{list.length}</span>}</>
          return <span key={d.getTime()} className={cls}>{inner}</span>
        })}
      </div>
    </Link>
  )
}

type Range = '1W' | '2W' | '1M' | '3M' | '6M' | '12M' | 'All'
const RANGES: [Range, number][] = [['1W', 7], ['2W', 14], ['1M', 30], ['3M', 91], ['6M', 182], ['12M', 365], ['All', 0]]
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Total training time or volume over a chosen range, bucketed by day, week or month depending on span. */
function TotalCard({ ws, unit }: { ws: WRow[]; unit: Unit }) {
  const [metric, setMetric] = useState<'dur' | 'vol'>('dur')
  const [range, setRange] = useState<Range>('1W')
  const [open, setOpen] = useState(false)
  const chart = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const daysBack = RANGES.find(([r]) => r === range)![1]
    const first = ws[0] ? new Date(ws[0].started_at) : today
    const from = daysBack ? new Date(today.getTime() - (daysBack - 1) * DAY) : new Date(first.getFullYear(), first.getMonth(), 1)
    const span = (today.getTime() - from.getTime()) / DAY + 1
    const unitOf: 'day' | 'week' | 'month' = span <= 14 ? 'day' : span <= 91 ? 'week' : 'month'
    const bucketStart = (d: Date) => {
      const x = new Date(d); x.setHours(0, 0, 0, 0)
      if (unitOf === 'week') x.setDate(x.getDate() - x.getDay())
      if (unitOf === 'month') x.setDate(1)
      return x
    }
    const out: { key: number; label: string; v: number }[] = []
    for (let c = bucketStart(from); c <= today;) {
      out.push({ key: c.getTime(), label: unitOf === 'month' ? MON[c.getMonth()] : `${c.getMonth() + 1}-${c.getDate()}`, v: 0 })
      c = new Date(c); if (unitOf === 'day') c.setDate(c.getDate() + 1); else if (unitOf === 'week') c.setDate(c.getDate() + 7); else c.setMonth(c.getMonth() + 1)
    }
    const idx = new Map(out.map((b, i) => [b.key, i]))
    ws.forEach((w) => {
      const d = new Date(w.started_at); if (d < from) return
      const i = idx.get(bucketStart(d).getTime()); if (i !== undefined) out[i].v += metric === 'dur' ? w.duration_s : w.volume_kg
    })
    return { list: out, unitOf }
  }, [ws, range, metric])
  const { list: bars, unitOf } = chart
  const sum = bars.reduce((t, b) => t + b.v, 0)
  const max = Math.max(1, ...bars.map((b) => b.v))
  const fmt = (v: number) => (metric === 'dur' ? fmtDur(v) : `${fmtVol(v, unit)} ${unit}`)
  const every = Math.ceil(bars.length / 7)
  return (
    <Card className="space-y-3">
      <div className="relative flex items-center justify-between gap-2">
        <h2 className="flex min-w-0 items-center gap-2 text-lg font-extrabold"><TrendIcon width={24} height={24} className="shrink-0 text-accent" /><span className="num truncate">Total {fmt(sum)}</span></h2>
        <button onClick={() => setOpen((v) => !v)} className="flex shrink-0 items-center gap-0.5 rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-bold text-accent">{range}<DownIcon width={14} height={14} /></button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-2xl border border-line bg-surface-2 py-1 shadow-2xl">
              {RANGES.map(([r]) => (
                <button key={r} onClick={() => { setRange(r); setOpen(false) }} className={`block w-full px-4 py-2.5 text-left font-semibold active:bg-surface ${r === range ? 'text-accent' : ''}`}>{r === 'All' ? 'All Time' : r}</button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        {([['dur', 'Duration'], ['vol', 'Volume']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setMetric(k)} className={`rounded-lg py-1.5 text-sm font-bold ${metric === k ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{l}</button>
        ))}
      </div>
      <div>
        <p className="num mb-1 text-[11px] text-faint">{fmt(max === 1 && !sum ? 0 : max)}</p>
        <div className="flex h-36 items-end gap-1 border-b border-dashed border-line">
          {/* Each column (not just the bar) is tappable and opens that day / week / month in the calendar. */}
          {bars.map((b) => (
            <Link key={b.key} to={calendarLink(new Date(b.key), unitOf)} title={`${b.label}: ${fmt(b.v)}`} aria-label={`${b.label}: ${fmt(b.v)}`} className="group flex h-full min-w-0 flex-1 items-end">
              <span className="w-full rounded-t-md bg-accent group-active:opacity-70" style={{ height: `${(b.v / max) * 100}%`, minHeight: b.v ? 4 : 0 }} />
            </Link>
          ))}
        </div>
        <div className="mt-1 flex gap-1">
          {bars.map((b, i) => <span key={b.key} className="num min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[10px] text-faint">{i % every === 0 ? b.label : ''}</span>)}
        </div>
      </div>
    </Card>
  )
}
