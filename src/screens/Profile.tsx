import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, CommentIcon, FeedIcon, PaletteIcon, PlusIcon, ProfileIcon, RoutinesIcon, SettingsIcon, StatsIcon, TrophyIcon, WorkoutIcon } from '../components/icons'
import { Avatar, Card, ErrorText, Stat } from '../components/ui'
import { resizeImage } from '../lib/image'
import { useNotifications } from '../lib/notifications'
import { loadStreak, type Streak } from '../lib/streak'
import { StreakCard } from './Workout'
import { resetExercises } from '../lib/exercises'
import { fmtHeight, fmtW } from '../lib/format'
import { errMsg, friendIds, me, pb, useUnit, useUser, type Friendship } from '../lib/pb'

type Tile = { to: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>>; badge?: number; dot?: boolean }

export default function Profile() {
  const user = useUser()!
  const unit = useUnit()
  const [total, setTotal] = useState(0)
  const [friends, setFriends] = useState(0)
  const [pending, setPending] = useState(0)
  const [prs, setPrs] = useState(0)
  const [toReview, setToReview] = useState(0)
  const [streak, setStreak] = useState<Streak | null>(null)
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
    pb.collection('workouts').getList(1, 1, { filter: pb.filter('user = {:u}', { u: uid }), fields: 'id' }).then((r) => setTotal(r.totalItems)).catch(() => {})
    loadStreak(uid).then(setStreak).catch(() => {})
    friendIds().then((f) => setFriends(f.length)).catch(() => {})
    pb.collection('friendships').getList<Friendship>(1, 1, { filter: pb.filter('addressee = {:u} && status = "pending"', { u: uid }) }).then((r) => setPending(r.totalItems)).catch(() => {})
    pb.collection('workout_sets').getList(1, 1, { filter: pb.filter('user = {:u} && is_pr = true', { u: uid }), fields: 'id' }).then((r) => setPrs(r.totalItems)).catch(() => {})
    if (pb.authStore.record?.is_moderator) pb.collection('exercises').getList(1, 1, { filter: 'review_status = "pending"' }).then((r) => setToReview(r.totalItems)).catch(() => {})
  }, [])

  const notes = useNotifications()
  const tiles: Tile[] = [
    { to: '/notifications', label: 'Notifications', Icon: BellIcon, badge: notes.count },
    { to: '/routines', label: 'Routines', Icon: RoutinesIcon },
    { to: '/exercises', label: 'Exercises', Icon: WorkoutIcon, dot: notes.has('exercises') },
    { to: '/stats', label: 'Stats', Icon: StatsIcon },
    { to: '/history', label: 'History', Icon: FeedIcon },
    { to: '/activity', label: 'Reactions', Icon: CommentIcon, dot: notes.has('social') },
    { to: '/friends', label: 'Friends', Icon: ProfileIcon, badge: pending, dot: notes.has('friends') },
    { to: '/import', label: 'Import', Icon: PlusIcon },
    { to: '/themes', label: 'Themes', Icon: PaletteIcon },
    { to: '/feedback', label: 'Feedback', Icon: CommentIcon, dot: notes.has('feedback') },
    { to: '/settings', label: 'Settings', Icon: SettingsIcon },
    ...(user.is_moderator ? [{ to: '/review', label: 'Review', Icon: TrophyIcon, badge: toReview }] : []),
  ]

  const logout = () => { pb.authStore.clear(); resetExercises() }

  return (
    <section className="mx-auto max-w-lg space-y-3 px-safe pt-4">
      <header className="mb-2 flex items-end justify-between">
        <h1 className="text-[32px] font-extrabold leading-none tracking-tight">Profile</h1>
        <Link to="/profile/edit" className="text-sm font-bold text-accent">Edit</Link>
      </header>
      <Card className="flex items-center gap-4">
        <button onClick={() => setPhotoMenu(true)} className="relative shrink-0" aria-label="Change profile picture">
          <Avatar user={user} size={64} />
          <span className="absolute -bottom-0.5 -right-0.5 grid size-6 place-items-center rounded-full border-2 border-surface bg-accent text-accent-ink">
            {busy ? <span className="size-3 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" /> : <PlusIcon width={14} height={14} />}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold">{user.name || user.username}</p>
          <p className="text-sm text-muted">@{user.username}</p>
          <p className="num text-xs text-muted">{fmtHeight(user.height_cm, unit)} · {user.bodyweight_kg ? `${fmtW(user.bodyweight_kg, unit)} ${unit}` : '—'}</p>
        </div>
      </Card>
      <ErrorText>{err}</ErrorText>
      {streak && <StreakCard s={streak} />}
      <Card className="grid grid-cols-3 gap-2">
        <Link to="/history"><Stat value={total} label="Workouts" /></Link>
        <Link to="/friends"><Stat value={friends} label="Friends" /></Link>
        <Link to="/stats"><Stat value={prs} label="PRs" /></Link>
      </Card>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map(({ to, label, Icon, badge, dot }) => (
          <Link key={to} to={to} className="relative flex h-[4.5rem] flex-col items-center justify-center gap-1 rounded-xl border border-line bg-surface px-1 active:bg-surface-2">
            <Icon width={20} height={20} className="text-accent" />
            <span className="w-full truncate text-center text-[11px] font-bold leading-tight">{label}</span>
            {!!badge && <span className={`absolute right-1 top-1 min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4 ${to === '/notifications' ? 'bg-danger text-white' : 'bg-accent text-accent-ink'}`}>{badge}</span>}
            {dot && !badge && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" aria-label="New" />}
          </Link>
        ))}
      </div>
      <button onClick={logout} className="w-full py-4 text-sm font-bold text-danger">Log out</button>
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
