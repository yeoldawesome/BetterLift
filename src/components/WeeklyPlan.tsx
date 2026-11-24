import { useEffect, useState } from 'react'
import { BedIcon, CloseIcon, DownIcon, RepeatIcon, UpIcon } from './icons'
import { BottomSheet, Button, Card, ErrorText } from './ui'
import { errMsg, me, pb, useUser, type Routine, type Workout } from '../lib/pb'
import { nextUp, REST, savePlan, userPlan, type PlanStep } from '../lib/plan'

const stepName = (s: PlanStep, byId: Map<string, Routine>) => (s === REST ? 'Rest' : byId.get(s)?.name ?? '')

/** Routines → the repeating order you train in (Push, Pull, Legs, Rest…), with today's spot highlighted. */
export function WeeklyPlan({ routines }: { routines: Routine[] }) {
  const user = useUser()!
  const plan = userPlan(user)
  const byId = new Map(routines.map((r) => [r.id, r]))
  const cycle = plan.cycle.filter((s) => s === REST || byId.has(s))
  const [recent, setRecent] = useState<Workout[] | null>(null)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    pb.collection('workouts').getList<Workout>(1, 20, { filter: pb.filter('user = {:u} && routine != ""', { u: me() }), sort: '-started_at', fields: 'routine,started_at' })
      .then((r) => setRecent(r.items)).catch(() => setRecent([]))
  }, [])
  const up = recent ? nextUp(plan, routines, recent) : null
  const current = up && up.status !== 'none' ? (up.status === 'done' ? up.nextStep : up.step) : -1

  return (
    <Card className="space-y-3" data-weekly-plan>
      <div className="flex items-center gap-2">
        <RepeatIcon width={18} height={18} className="text-accent" />
        <h2 className="flex-1 font-extrabold">Weekly plan</h2>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>{cycle.length ? 'Edit' : 'Set up'}</Button>
      </div>
      {cycle.length ? (
        <div className="bleed-x flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {cycle.map((s, i) => (
            <div key={i} className={`flex shrink-0 flex-col items-center gap-1 rounded-xl border px-3 py-2 ${i === current ? 'border-accent bg-accent/15' : 'border-line bg-surface-2'}`}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-faint">Day {i + 1}</span>
              <span className={`flex items-center gap-1 text-sm font-bold ${s === REST ? 'text-muted' : ''} ${i === current ? 'text-accent' : ''}`}>
                {s === REST && <BedIcon width={14} height={14} />}{stepName(s, byId)}
              </span>
              {i === current && <span className="text-[10px] font-bold uppercase text-accent">{up?.status === 'rest' ? 'Today' : 'Next'}</span>}
            </div>
          ))}
          <div className="flex shrink-0 items-center px-1 text-faint"><RepeatIcon width={18} height={18} /></div>
        </div>
      ) : <p className="text-sm text-muted">Set the order you train in, like Push → Pull → Legs → Rest, and it repeats. Your Feed shows what's next.</p>}
      {editing && <PlanEditor initial={cycle} routines={routines} onClose={() => setEditing(false)} />}
    </Card>
  )
}

function PlanEditor({ initial, routines, onClose }: { initial: PlanStep[]; routines: Routine[]; onClose: () => void }) {
  const byId = new Map(routines.map((r) => [r.id, r]))
  const [cycle, setCycle] = useState<PlanStep[]>(initial)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const move = (i: number, d: -1 | 1) => setCycle((c) => { const n = [...c]; [n[i], n[i + d]] = [n[i + d], n[i]]; return n })
  const save = async () => {
    setBusy(true); setErr('')
    try { await savePlan(me(), { cycle }); await pb.collection('users').authRefresh(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <BottomSheet title="Weekly plan" onClose={onClose}>
      <div className="space-y-3">
        {cycle.length ? (
          <ol className="divide-y divide-line rounded-xl bg-surface">
            {cycle.map((s, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 pl-3 pr-1.5">
                <span className="num w-12 shrink-0 text-xs font-bold uppercase text-faint">Day {i + 1}</span>
                <span className={`flex min-w-0 flex-1 items-center gap-1.5 truncate font-semibold ${s === REST ? 'text-muted' : ''}`}>{s === REST && <BedIcon width={16} height={16} />}{stepName(s, byId)}</span>
                <button disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25" aria-label="Move up"><UpIcon width={18} height={18} /></button>
                <button disabled={i === cycle.length - 1} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-lg text-muted disabled:opacity-25" aria-label="Move down"><DownIcon width={18} height={18} /></button>
                <button onClick={() => setCycle((c) => c.filter((_, k) => k !== i))} className="grid size-8 place-items-center rounded-lg text-danger" aria-label={`Remove day ${i + 1}`}><CloseIcon width={16} height={16} /></button>
              </li>
            ))}
          </ol>
        ) : <p className="rounded-xl bg-surface p-3 text-sm text-muted">Tap routines below in the order you do them. Add rest days where you take them.</p>}
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Add a day</p>
        <div className="flex flex-wrap gap-2">
          {routines.map((r) => (
            <button key={r.id} disabled={cycle.length >= 21} onClick={() => setCycle((c) => [...c, r.id])} className="h-9 rounded-full bg-surface-2 px-3 text-sm font-semibold active:scale-95">+ {r.name}</button>
          ))}
          <button disabled={cycle.length >= 21} onClick={() => setCycle((c) => [...c, REST])} className="flex h-9 items-center gap-1 rounded-full bg-surface-2 px-3 text-sm font-semibold text-muted active:scale-95"><BedIcon width={15} height={15} />+ Rest</button>
        </div>
        <p className="text-xs text-faint">The plan repeats after the last day. Missing a day doesn't skip a workout: the next one is whatever follows your last planned session.</p>
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save plan'}</Button>
      </div>
    </BottomSheet>
  )
}
