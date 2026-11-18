import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { LockIcon } from '../components/icons'
import { Avatar, Button, Card, ErrorText, Screen, Spinner, Stat } from '../components/ui'
import { fmtDate, fmtDur, fmtVol } from '../lib/format'
import { errMsg, me, pb, useUnit, type Friendship, type User, type Workout } from '../lib/pb'
import { loadStreak, type Streak } from '../lib/streak'

const StatsView = lazy(() => import('./Stats').then((m) => ({ default: m.StatsView })))

/** Another lifter's profile. Friends see their streak, workouts and (unless they opted out) full lift stats. */
export default function UserProfile() {
  const { id } = useParams()
  const unit = useUnit()
  const [user, setUser] = useState<User | null>(null)
  const [link, setLink] = useState<Friendship | null | undefined>(undefined)
  const [workouts, setWorkouts] = useState<Workout[]>([])
  const [total, setTotal] = useState(0)
  const [streak, setStreak] = useState<Streak | null>(null)
  const [err, setErr] = useState('')

  const load = async () => {
    const u = await pb.collection('users').getOne<User>(id!)
    setUser(u)
    const f = await pb.collection('friendships').getList<Friendship>(1, 1, {
      filter: pb.filter('(requester = {:a} && addressee = {:b}) || (requester = {:b} && addressee = {:a})', { a: me(), b: id }),
    })
    setLink(f.items[0] ?? null)
    if (f.items[0]?.status === 'accepted') {
      const ws = await pb.collection('workouts').getList<Workout>(1, 10, { filter: pb.filter('user = {:u}', { u: id }), sort: '-started_at' })
      setWorkouts(ws.items); setTotal(ws.totalItems)
      setStreak(await loadStreak(id!))
    }
  }
  useEffect(() => { load().catch((e) => setErr(errMsg(e))) }, [id])

  if (id === me()) return <Navigate to="/profile" replace />
  if (!user || link === undefined) return <Screen title="Profile" back><ErrorText>{err}</ErrorText>{!err && <Spinner />}</Screen>

  const friends = link?.status === 'accepted'
  const run = (p: Promise<unknown>) => p.then(load).catch((e) => setErr(errMsg(e)))

  return (
    <Screen title={user.name || user.username} back>
      <Card className="flex items-center gap-4">
        <Avatar user={user} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold">{user.name || user.username}</p>
          <p className="text-sm text-muted">@{user.username}</p>
        </div>
        {friends && streak && streak.days > 0 && (
          <div className="text-center"><p className="num text-2xl font-black">🔥{streak.days}</p><p className="text-[10px] font-semibold uppercase text-muted">day streak</p></div>
        )}
      </Card>
      <ErrorText>{err}</ErrorText>

      {!friends ? (
        <Card className="space-y-3 text-center">
          <p className="text-sm text-muted">{link?.status === 'pending' ? (link.requester === me() ? 'Friend request sent.' : `@${user.username} sent you a friend request.`) : `Add @${user.username} as a friend to see their workouts and stats.`}</p>
          {!link && <Button onClick={() => run(pb.collection('friendships').create({ requester: me(), addressee: user.id, status: 'pending' }))}>Add friend</Button>}
          {link?.status === 'pending' && link.addressee === me() && <Button onClick={() => run(pb.collection('friendships').update(link.id, { status: 'accepted' }))}>Accept request</Button>}
        </Card>
      ) : (
        <>
          <Link to={`/compare/${user.id}`} className="flex h-12 items-center justify-center rounded-2xl bg-accent font-bold text-accent-ink">Compare lifts with @{user.username}</Link>
          <Card className="grid grid-cols-3 gap-2">
            <Stat value={total} label="Workouts" />
            <Stat value={streak?.days ?? 0} label="Streak days" />
            <Stat value={streak?.best ?? 0} label="Best streak" />
          </Card>
          {user.hide_stats ? (
            <Card className="flex items-center gap-3 text-sm text-muted"><LockIcon width={20} height={20} className="shrink-0" />@{user.username} keeps their lift stats private.</Card>
          ) : (
            <Suspense fallback={<Spinner />}><StatsView user={user} embedded /></Suspense>
          )}
          <h2 className="pt-2 text-lg font-extrabold">Recent workouts</h2>
          {workouts.map((w) => (
            <Link key={w.id} to={`/w/${w.id}`} className="block">
              <Card className="py-3">
                <p className="truncate font-bold">{w.name}</p>
                <p className="text-xs text-muted">{fmtDate(w.started_at)} · {fmtDur(w.duration_s)} · {fmtVol(w.volume_kg, unit)} {unit}{w.pr_count ? ` · ${w.pr_count} PR` : ''}</p>
              </Card>
            </Link>
          ))}
          {!workouts.length && <p className="text-sm text-muted">No public workouts yet.</p>}
        </>
      )}
    </Screen>
  )
}
