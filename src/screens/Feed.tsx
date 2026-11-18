import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellIcon, CloseIcon } from '../components/icons'
import { useNotifications } from '../lib/notifications'
import { WorkoutCard } from '../components/WorkoutCard'
import { Avatar, Button, Card, Empty, Screen, Segmented, Spinner } from '../components/ui'
import { timeAgo } from '../lib/format'
import { intensityFromSets, type Intensity } from '../lib/muscles'
import { anyOf, errMsg, friendIds, me, pb, type Comment, type Nudge, type Reaction, type User, type WSet, type Workout } from '../lib/pb'
import { loadStreak, type Streak } from '../lib/streak'
import { useRealtime } from '../lib/useRealtime'

const WEEK_MS = 7 * 86400000
type FeedData = { workouts: Workout[]; intensity: Map<string, Intensity>; reactions: Reaction[]; comments: Comment[] }

function NotificationBell() {
  const { count } = useNotifications()
  return (
    <Link to="/notifications" className="relative grid size-10 place-items-center rounded-full bg-surface-2" aria-label={count ? `Notifications, ${count} new` : 'Notifications'}>
      <BellIcon width={22} height={22} />
      {count > 0 && <span className="absolute right-1.5 top-1.5 size-2.5 rounded-full bg-danger ring-2 ring-canvas" />}
    </Link>
  )
}

export default function FeedScreen() {
  const [tab, setTab] = useState<'feed' | 'friends'>('feed')
  return (
    <Screen title="Feed" action={<NotificationBell />}>
      <NudgeBanner />
      <Segmented value={tab} onChange={setTab} options={[['feed', 'Feed'], ['friends', 'Friends']]} />
      {tab === 'feed' ? <WeekFeed /> : <FriendsTab />}
    </Screen>
  )
}

/** You + all your friends' lifts from the last 7 days, newest first. */
function WeekFeed() {
  const [feed, setFeed] = useState<FeedData | null>(null)

  const load = useCallback(async () => {
    const since = new Date(Date.now() - WEEK_MS)
    const workouts = await pb.collection('workouts').getFullList<Workout>({ filter: pb.filter('started_at >= {:d}', { d: since }), sort: '-started_at', expand: 'user', batch: 200 })
    const f = anyOf('workout', workouts.map((w) => w.id))
    const [sets, reactions, comments] = await Promise.all([
      workouts.length ? pb.collection('workout_sets').getFullList<WSet>({ filter: f, expand: 'exercise', fields: 'workout,position,expand.exercise.name,expand.exercise.muscle,expand.exercise.secondary', batch: 1000 }) : [],
      workouts.length ? pb.collection('reactions').getFullList<Reaction>({ filter: f }) : [],
      workouts.length ? pb.collection('comments').getFullList<Comment>({ filter: f, fields: 'id,workout' }) : [],
    ])
    const byWorkout = new Map<string, WSet[]>()
    for (const s of sets) byWorkout.set(s.workout, [...(byWorkout.get(s.workout) ?? []), s])
    const intensity = new Map<string, Intensity>()
    for (const w of workouts) {
      const ws = byWorkout.get(w.id) ?? []
      intensity.set(w.id, intensityFromSets(ws.map((s) => ({ ex: s.expand?.exercise }))))
    }
    setFeed({ workouts, intensity, reactions, comments })
  }, [])

  useEffect(() => { load().catch(() => setFeed({ workouts: [], intensity: new Map(), reactions: [], comments: [] })) }, [load])
  useRealtime(['workouts', 'reactions', 'comments'], () => { load().catch(() => {}) })

  if (!feed) return <Spinner />
  if (!feed.workouts.length) return (
    <Empty title="No lifts this week" body="Workouts from you and your friends in the last 7 days show up here.">
      <Link to="/workout"><Button>Start a workout</Button></Link>
    </Empty>
  )
  return (
    <>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">Last 7 days · {feed.workouts.length} workout{feed.workouts.length === 1 ? '' : 's'}</p>
      {feed.workouts.map((w) => (
        <WorkoutCard key={w.id} w={w} intensity={feed.intensity.get(w.id) ?? {}} onChange={() => load()}
          reactions={feed.reactions.filter((r) => r.workout === w.id)} comments={feed.comments.filter((c) => c.workout === w.id).length} />
      ))}
    </>
  )
}

type Row = { user: User; streak: Streak | null; nudged: boolean }

/** Friends with their streaks; remind anyone who lost theirs (or is on their last day). */
function FriendsTab() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const ids = await friendIds()
    if (!ids.length) return setRows([])
    const [users, sent] = await Promise.all([
      pb.collection('users').getFullList<User>({ filter: anyOf('id', ids) }),
      pb.collection('nudges').getFullList<Nudge>({ filter: pb.filter('from = {:u} && created >= {:d}', { u: me(), d: new Date(Date.now() - 20 * 3600000) }) }),
    ])
    const streaks = await Promise.all(users.map((u) => loadStreak(u.id).catch(() => null)))
    const out = users.map((u, i) => ({ user: u, streak: streaks[i], nudged: sent.some((n) => n.to === u.id) }))
    // Lost / at-risk streaks first so reminders are easy to send, then longest streaks.
    const rank = (r: Row) => (!r.streak?.days ? 0 : r.streak.atRisk ? 1 : 2)
    out.sort((a, b) => rank(a) - rank(b) || (b.streak?.days ?? 0) - (a.streak?.days ?? 0))
    setRows(out)
  }, [])
  useEffect(() => { load().catch(() => setRows([])) }, [load])

  const remind = async (u: User) => {
    setMsg('')
    try {
      await pb.collection('nudges').create({ from: me(), to: u.id, message: 'Time to get back in the gym! 💪' })
      setRows((rs) => rs?.map((r) => (r.user.id === u.id ? { ...r, nudged: true } : r)) ?? null)
      setMsg(`Reminder sent to @${u.username}`)
    } catch (e) { setMsg(errMsg(e)) }
  }

  if (!rows) return <Spinner />
  if (!rows.length) return <Empty title="No friends yet" body="Add friends to see their streaks and cheer them on."><Link to="/friends"><Button variant="ghost">Find friends</Button></Link></Empty>
  return (
    <>
      {msg && <p className="text-center text-sm font-semibold text-accent">{msg}</p>}
      <Card className="p-0">
        {rows.map(({ user: u, streak: s, nudged }) => {
          const lost = !s?.days
          return (
            <div key={u.id} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <Link to={`/u/${u.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={u} size={42} />
                <div className="min-w-0">
                  <p className="truncate font-bold">{u.name || u.username}</p>
                  <p className={`text-xs font-semibold ${lost ? 'text-danger' : s?.atRisk ? 'text-amber-300' : 'text-muted'}`}>
                    {lost ? (s?.best ? `Streak lost · best ${s.best} days` : 'No streak yet') : s?.atRisk ? `🔥 ${s.days} days · last day!` : `🔥 ${s?.days} day streak`}
                  </p>
                </div>
              </Link>
              <div className="flex shrink-0 gap-1.5">
                <Link to={`/compare/${u.id}`} className="grid h-9 place-items-center rounded-xl bg-surface-2 px-3 text-xs font-bold">Compare</Link>
                {(lost || s?.atRisk) && (
                  <button disabled={nudged} onClick={() => remind(u)} className="h-9 rounded-xl bg-accent px-3 text-xs font-bold text-accent-ink disabled:bg-surface-2 disabled:text-muted">
                    {nudged ? 'Sent ✓' : 'Remind 💪'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}

/** Reminders friends sent you, shown at the top of the feed until dismissed. */
function NudgeBanner() {
  const [nudges, setNudges] = useState<Nudge[]>([])
  const load = useCallback(() => {
    pb.collection('nudges').getFullList<Nudge>({ filter: pb.filter('to = {:u} && seen = false', { u: me() }), sort: '-created', expand: 'from' }).then(setNudges).catch(() => {})
  }, [])
  useEffect(load, [load])
  useRealtime(['nudges'], load)
  const dismiss = (n: Nudge) => { setNudges((xs) => xs.filter((x) => x.id !== n.id)); pb.collection('nudges').update(n.id, { seen: true }).catch(() => {}) }
  return (
    <>
      {nudges.map((n) => (
        <div key={n.id} className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3">
          <Avatar user={n.expand?.from} size={36} />
          <p className="min-w-0 flex-1 text-sm"><span className="font-bold">@{n.expand?.from?.username}</span> {n.message || 'wants you back in the gym 💪'}
            <span className="block text-xs text-muted">{timeAgo(n.created)}</span></p>
          <Link to="/workout" onClick={() => dismiss(n)} className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-accent-ink">Let’s go</Link>
          <button onClick={() => dismiss(n)} className="p-1 text-faint" aria-label="Dismiss"><CloseIcon width={16} height={16} /></button>
        </div>
      ))}
    </>
  )
}
