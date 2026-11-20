import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { LockIcon, SearchIcon, TrophyIcon } from '../components/icons'
import { Avatar, Card, Chips, ErrorText, Input, Screen, Spinner } from '../components/ui'
import { label, loadExercises } from '../lib/exercises'
import { epley, fmtW } from '../lib/format'
import { errMsg, me, pb, useUnit, useUser, type Exercise, type User, type WSet } from '../lib/pb'

type Best = { w: number; r: number; e1: number; reps: number; sec: number }
type Row = { ex: Exercise; mine?: Best; theirs?: Best }

/** Best set per exercise: heaviest by est. 1RM for weighted lifts, most reps / longest hold otherwise. */
async function bests(userId: string): Promise<Map<string, Best>> {
  const sets = await pb.collection('workout_sets').getFullList<WSet>({
    filter: pb.filter('user = {:u} && completed = true', { u: userId }), fields: 'exercise,weight_kg,reps,seconds', batch: 1000,
  })
  const m = new Map<string, Best>()
  for (const s of sets) {
    const b = m.get(s.exercise) ?? { w: 0, r: 0, e1: 0, reps: 0, sec: 0 }
    const e1 = epley(s.weight_kg, s.reps)
    if (e1 > b.e1 || (e1 === b.e1 && s.weight_kg > b.w)) { b.e1 = e1; b.w = s.weight_kg; b.r = s.reps }
    b.reps = Math.max(b.reps, s.reps)
    b.sec = Math.max(b.sec, s.seconds)
    m.set(s.exercise, b)
  }
  return m
}

const score = (ex: Exercise, b?: Best) => (!b ? -1 : ex.kind === 'weight' ? b.e1 : ex.kind === 'duration' ? b.sec : b.reps)

export default function Compare() {
  const { id } = useParams()
  const meUser = useUser()!
  const unit = useUnit()
  const [friend, setFriend] = useState<User | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [show, setShow] = useState('both')
  const [q, setQ] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    ;(async () => {
      const [f, lib, mine, theirs] = await Promise.all([pb.collection('users').getOne<User>(id!), loadExercises(), bests(me()), bests(id!)])
      setFriend(f)
      const exById = new Map(lib.map((e) => [e.id, e]))
      const ids = new Set([...mine.keys(), ...theirs.keys()])
      setRows([...ids].filter((x) => exById.has(x) && exById.get(x)!.kind !== 'cardio')
        .map((x) => ({ ex: exById.get(x)!, mine: mine.get(x), theirs: theirs.get(x) }))
        .sort((a, b) => a.ex.name.localeCompare(b.ex.name)))
    })().catch((e) => setErr(errMsg(e)))
  }, [id])

  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter((r) => (show === 'both' ? r.mine && r.theirs : show === 'mine' ? r.mine : r.theirs) && (!s || r.ex.name.toLowerCase().includes(s)))
  }, [rows, show, q])
  const both = (rows ?? []).filter((r) => r.mine && r.theirs)
  const iLead = both.filter((r) => score(r.ex, r.mine) > score(r.ex, r.theirs)).length
  const theyLead = both.filter((r) => score(r.ex, r.theirs) > score(r.ex, r.mine)).length

  const cell = (ex: Exercise, b?: Best) => {
    if (!b) return <p className="text-sm text-faint">—</p>
    if (ex.kind === 'duration') return <p className="num font-black">{b.sec}s</p>
    if (ex.kind !== 'weight' && !b.w) return <p className="num font-black">{b.reps} reps</p>
    return (
      <>
        <p className="num font-black">{fmtW(b.w, unit)} × {b.r}</p>
        <p className="num text-[11px] text-muted">e1RM {fmtW(b.e1, unit)}</p>
      </>
    )
  }

  if (err) return <Screen title="Compare" back><ErrorText>{err}</ErrorText></Screen>
  if (!friend || !rows) return <Screen title="Compare" back><Spinner /></Screen>

  return (
    <Screen title="Compare" back>
      <Card className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
        <div className="flex flex-col items-center gap-1"><Avatar user={meUser} size={52} /><p className="text-sm font-bold">You</p><p className="num text-2xl font-black text-accent">{iLead}</p></div>
        <p className="text-xs font-bold uppercase tracking-wider text-muted">lifts<br />led</p>
        <div className="flex flex-col items-center gap-1"><Avatar user={friend} size={52} /><p className="truncate text-sm font-bold">@{friend.username}</p><p className="num text-2xl font-black">{theyLead}</p></div>
      </Card>
      {friend.hide_stats ? (
        <Card className="flex items-center gap-3 text-sm text-muted"><LockIcon width={20} height={20} className="shrink-0" />@{friend.username} keeps their lift stats private, so there's nothing to compare.</Card>
      ) : (
        <>
          <Chips value={show} onChange={setShow} options={[['both', `Both did (${both.length})`], ['mine', 'All mine'], ['theirs', 'All theirs']]} />
          <div className="relative">
            <SearchIcon width={18} height={18} className="absolute left-3 top-3.5 text-faint" />
            <Input placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <p className="text-xs text-muted">Best set = your heaviest set by estimated 1RM. Weights in {unit}.</p>
          {list.map((r) => {
            const a = score(r.ex, r.mine), b = score(r.ex, r.theirs)
            const win = r.mine && r.theirs ? (a > b ? 'me' : b > a ? 'them' : 'tie') : null
            return (
              <Card key={r.ex.id} className="p-3">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="truncate font-extrabold">{r.ex.name}</p>
                  <p className="shrink-0 text-[11px] font-semibold uppercase text-muted">{label(r.ex.muscle)}</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-xl p-2 text-center ${win === 'me' ? 'bg-accent/15 ring-1 ring-accent' : 'bg-surface-2'}`}>
                    <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted">You{win === 'me' && <TrophyIcon width={12} height={12} className="text-yellow-500" aria-label="winner" />}</p>{cell(r.ex, r.mine)}
                  </div>
                  <div className={`rounded-xl p-2 text-center ${win === 'them' ? 'bg-accent/15 ring-1 ring-accent' : 'bg-surface-2'}`}>
                    <p className="flex min-w-0 items-center gap-1 text-[10px] font-bold uppercase text-muted"><span className="truncate">@{friend.username}</span>{win === 'them' && <TrophyIcon width={12} height={12} className="shrink-0 text-yellow-500" aria-label="winner" />}</p>{cell(r.ex, r.theirs)}
                  </div>
                </div>
              </Card>
            )
          })}
          {!list.length && <p className="py-6 text-center text-sm text-muted">{show === 'both' ? 'No exercises in common yet.' : 'Nothing here.'}</p>}
        </>
      )}
    </Screen>
  )
}
