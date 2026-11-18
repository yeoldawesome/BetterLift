import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExercisePicker } from '../components/ExerciseList'
import { ExerciseInfo } from '../components/ExerciseInfo'
import { CheckIcon, GlobeIcon, InfoIcon, LockIcon, PlusIcon, TimerIcon, TrashIcon } from '../components/icons'
import { LiftRestSheet, restLabel } from '../components/RestPicker'
import { saveLiftRest } from '../lib/exercises'
import { Button, Card, ErrorText, Input, Screen, Sheet, Stat, Toggle } from '../components/ui'
import { emptySet, finishWorkout, makeEx, repairActive, routineExercises, saveAsRoutine, syncRoutine, useActive, type AEx, type ASet, type Prev } from '../lib/active'
import { prLine, useBest, clearBestCache } from '../lib/best'
import { loadStreak, streakText, type Streak } from '../lib/streak'
import { invalidateStats } from '../lib/statsData'
import { distLabel, epley, fmtClock, fmtDist, fmtVol, fmtW, fromUnit, num } from '../lib/format'
import { errMsg, me, pb, restFor, useUnit, useUser, type Exercise, type Routine, type User, type Visibility, type Workout as W } from '../lib/pb'

export default function Workout() {
  const { active } = useActive()
  return active ? <ActiveWorkout /> : <StartWorkout />
}

function StartWorkout() {
  const { start } = useActive()
  const unit = useUnit()
  const [routines, setRoutines] = useState<Routine[]>([])
  const [week, setWeek] = useState<W[]>([])
  const [busy, setBusy] = useState('')
  const [streak, setStreak] = useState<Streak | null>(null)

  useEffect(() => {
    loadStreak(me()).then(setStreak).catch(() => {})
    pb.collection('routines').getFullList<Routine>({ filter: pb.filter('user = {:u}', { u: me() }), sort: 'position' }).then(setRoutines).catch(() => {})
    const since = new Date(); since.setDate(since.getDate() - since.getDay()); since.setHours(0, 0, 0, 0)
    pb.collection('workouts').getFullList<W>({ filter: pb.filter('user = {:u} && started_at >= {:d}', { u: me(), d: since }), fields: 'id,volume_kg,duration_s' }).then(setWeek).catch(() => {})
  }, [])

  const fromRoutine = async (r: Routine) => {
    setBusy(r.id)
    try { start(r.name, r.id, await routineExercises(r.id)) } catch (e) { alert(errMsg(e)) } finally { setBusy('') }
  }

  return (
    <Screen title="Workout">
      {streak && <StreakCard s={streak} />}
      <Card className="grid grid-cols-3 gap-2">
        <Stat value={week.length} label="This week" />
        <Stat value={fmtVol(week.reduce((t, w) => t + w.volume_kg, 0), unit)} label={`Volume ${unit}`} />
        <Stat value={Math.round(week.reduce((t, w) => t + w.duration_s, 0) / 60)} label="Minutes" />
      </Card>
      <Button onClick={() => start('Workout')}>Start empty workout</Button>
      <div className="flex items-center justify-between pt-3">
        <h2 className="text-lg font-extrabold">Start from routine</h2>
        <Link to="/routines" className="text-sm font-bold text-accent">Manage</Link>
      </div>
      {routines.map((r) => (
        <Card key={r.id} className="flex items-center justify-between">
          <div className="min-w-0"><p className="truncate font-bold">{r.name}</p>{r.notes && <p className="truncate text-xs text-muted">{r.notes}</p>}</div>
          <Button size="sm" onClick={() => fromRoutine(r)} disabled={!!busy}>{busy === r.id ? '…' : 'Start'}</Button>
        </Card>
      ))}
      {!routines.length && <p className="text-sm text-muted">No routines yet. <Link to="/routines" className="font-bold text-accent">Create one</Link>.</p>}
    </Screen>
  )
}

export function StreakCard({ s }: { s: Streak }) {
  const tone = s.atRisk ? 'border-amber-400/50 bg-amber-400/10' : s.days ? 'border-accent/40 bg-accent/10' : 'border-line bg-surface'
  return (
    <div className={`flex items-center gap-3 rounded-2xl border p-3 ${tone}`}>
      <span className={`text-3xl ${s.days ? '' : 'grayscale opacity-50'}`}>🔥</span>
      <div className="min-w-0 flex-1">
        <p className="num text-xl font-black leading-tight">{s.days ? `${s.days} day streak` : 'No streak yet'}</p>
        <p className={`text-xs font-semibold ${s.atRisk ? 'text-amber-300' : 'text-muted'}`}>{streakText(s)}</p>
      </div>
      {/* Three pips = today + the two rest days you're allowed. */}
      {s.days > 0 && (
        <div className="flex gap-1" aria-label={`${s.restLeft} rest days left`}>
          {[0, 1, 2].map((i) => <span key={i} className={`h-6 w-2 rounded-full ${i < s.restLeft + 1 ? (s.atRisk ? 'bg-amber-400' : 'bg-accent') : 'bg-line'}`} />)}
        </div>
      )}
    </div>
  )
}

function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  return <span className="num">{fmtClock((now - new Date(since).getTime()) / 1000)}</span>
}

function ActiveWorkout() {
  const { active, update, discard, startRest } = useActive()
  const user = useUser()!
  const unit = useUnit()
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const a = active!

  const setEx = (key: string, fn: (x: AEx) => AEx) => update((w) => ({ ...w, exercises: w.exercises.map((x) => (x.key === key ? fn(x) : x)) }))
  const setSet = (key: string, i: number, patch: Partial<ASet>) => setEx(key, (x) => ({ ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))

  const add = async (exs: Exercise[]) => {
    setPicking(false)
    const made = await Promise.all(exs.map((e) => { const r = restFor(e, user); return makeEx(e, 3, r.rest, '', r.after) }))
    update((w) => ({ ...w, exercises: [...w.exercises, ...made] }))
  }

  const toggle = (x: AEx, i: number) => {
    const s = x.sets[i]
    if (!s.done) {
      // Fill blanks from the placeholder (previous session / target) so one tap logs a repeat.
      const p = x.prev[i] ?? x.prev[x.prev.length - 1]
      const patch: Partial<ASet> = { done: true }
      if (!s.w && p?.w) patch.w = fmtW(p.w, unit)
      if (!s.r && (x.target || p?.r)) patch.r = x.target || `${p!.r}`
      if (!s.sec && p?.sec) patch.sec = `${p.sec}`
      if (!s.dist && p?.dist) patch.dist = fmtDist(p.dist, unit)
      setSet(x.key, i, patch)
      // Last unchecked set of this exercise → transition rest before the next exercise.
      const finishing = x.sets.every((t, j) => j === i || t.done)
      startRest(finishing ? (x.restAfter ?? x.rest) : x.rest)
    } else setSet(x.key, i, { done: false })
  }

  return (
    <section className="mx-auto max-w-lg px-safe pb-28 pt-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-bold text-accent"><TimerIcon width={18} height={18} /><Elapsed since={a.startedAt} /></div>
        <Button size="sm" onClick={() => setFinishing(true)}>Finish</Button>
      </div>
      <input value={a.name} onChange={(e) => update((w) => ({ ...w, name: e.target.value }))} className="mb-4 w-full bg-transparent text-3xl font-extrabold tracking-tight outline-none" />
      <div className="space-y-3">
        {a.exercises.map((x) => <ExerciseBlock key={x.key} x={x} unit={unit} setEx={setEx} setSet={setSet} toggle={toggle} />)}
      </div>
      <div className="mt-4 space-y-3">
        <Button variant="ghost" onClick={() => setPicking(true)}><PlusIcon width={18} height={18} className="mr-1 inline" />Add exercises</Button>
        <Button variant="danger" onClick={() => confirm('Discard this workout?') && discard()}>Discard workout</Button>
      </div>
      {picking && <ExercisePicker onPick={add} onClose={() => setPicking(false)} />}
      {finishing && <FinishSheet user={user} onClose={() => setFinishing(false)} />}
    </section>
  )
}

/** Confirm-and-post step: name, visibility, routine update. Choices are remembered on the user. */
function FinishSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const { active, discard } = useActive()
  const unit = useUnit()
  const nav = useNavigate()
  const a = active!
  const [name, setName] = useState(a.name)
  const [notes, setNotes] = useState(a.notes)
  const [visibility, setVisibility] = useState<Visibility>(user.post_visibility || 'public')
  const [updateRoutine, setUpdateRoutine] = useState(user.update_routine)
  const [saveRoutine, setSaveRoutine] = useState(user.save_as_routine)
  const [routineName, setRoutineName] = useState('')
  const [bw, setBw] = useState(user.bodyweight_kg ? fmtW(user.bodyweight_kg, unit) : '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (a.routine) pb.collection('routines').getOne<Routine>(a.routine, { fields: 'name' }).then((r) => setRoutineName(r.name)).catch(() => setRoutineName(''))
  }, [a.routine])

  const all = a.exercises.flatMap((x) => x.sets)
  const done = all.filter((s) => s.done).length
  const skipped = all.length - done

  const finish = async () => {
    setErr(''); setBusy(true)
    try {
      const post = await repairActive({ ...a, name: name.trim() || a.name, notes })
      const bwKg = num(bw) > 0 ? fromUnit(num(bw), unit) : user.bodyweight_kg
      const id = await finishWorkout(post, unit, visibility, Math.round(bwKg * 100) / 100)
      const prefs: Partial<User> = {}
      // Only write a new bodyweight if it actually changed in the displayed unit (avoids lb↔kg rounding drift).
      if (num(bw) > 0 && bw !== fmtW(user.bodyweight_kg, unit)) prefs.bodyweight_kg = Math.round(bwKg * 100) / 100
      if (visibility !== (user.post_visibility || 'public')) prefs.post_visibility = visibility
      if (a.routine && routineName && updateRoutine !== user.update_routine) prefs.update_routine = updateRoutine
      if (!a.routine && saveRoutine !== user.save_as_routine) prefs.save_as_routine = saveRoutine
      await Promise.all([
        Object.keys(prefs).length ? pb.collection('users').update(user.id, prefs) : null,
        a.routine && routineName && updateRoutine ? syncRoutine(post, a.routine) : null,
        !a.routine && saveRoutine ? saveAsRoutine(post, post.name) : null,
      ])
      clearBestCache()
      invalidateStats()
      discard()
      nav(`/recap/${id}`, { replace: true })
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <Sheet title="Finish workout" onClose={onClose}>
      <div className="space-y-4 pb-6">
        {skipped > 0 && (
          <Card className="border-amber-400/40 bg-amber-400/10">
            <p className="font-bold text-amber-300">{skipped} set{skipped > 1 ? 's' : ''} not checked off</p>
            <p className="text-sm text-muted">{done ? "Unchecked sets won't be saved." : 'Check off at least one set to finish.'}</p>
          </Card>
        )}
        <Input label="Post name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        {a.routine && routineName && name.trim() !== routineName && <p className="-mt-2 text-xs text-muted">Only this post is renamed — your routine stays “{routineName}”.</p>}
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
        <div>
          <Input label={`Bodyweight today (${unit})`} inputMode="decimal" value={bw} onChange={(e) => setBw(e.target.value)} />
          <p className="mt-1 text-xs text-muted">Pre-filled with your last weigh-in. Changing it updates your profile.</p>
        </div>
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Who can see this</span>
          <div className="grid grid-cols-2 gap-2">
            {([['public', 'Public', 'Friends see it in their feed', GlobeIcon], ['private', 'Private', 'Only you', LockIcon]] as const).map(([v, t, d, Icon]) => (
              <button key={v} onClick={() => setVisibility(v)} className={`rounded-xl border p-3 text-left ${visibility === v ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
                <Icon width={20} height={20} className={visibility === v ? 'text-accent' : 'text-muted'} />
                <span className="mt-1 block font-bold">{t}</span><span className="block text-xs text-muted">{d}</span>
              </button>
            ))}
          </div>
        </div>
        {a.routine && routineName ? (
          <Toggle on={updateRoutine} onChange={setUpdateRoutine} title={`Update “${routineName}”`} body="Save today's exercises, set counts, reps and rest times to the routine." />
        ) : !a.routine && (
          <Toggle on={saveRoutine} onChange={setSaveRoutine} title="Save as a routine" body="Turn this workout into a routine you can start again." />
        )}
        <ErrorText>{err}</ErrorText>
        <Button onClick={finish} disabled={busy || !done}>{busy ? 'Saving…' : "I'm done — finish workout"}</Button>
        <Button variant="ghost" onClick={onClose}>Keep lifting</Button>
      </div>
    </Sheet>
  )
}

function prevText(p: Prev | undefined, x: AEx, unit: 'kg' | 'lb') {
  if (!p) return '—'
  if (x.ex.kind === 'duration') return `${p.sec}s`
  if (x.ex.kind === 'cardio') return `${fmtDist(p.dist, unit)}${distLabel(unit)} ${Math.round(p.sec / 60)}m`
  if (x.ex.kind === 'bodyweight' && !p.w) return `${p.r} reps`
  return `${fmtW(p.w, unit)}×${p.r}`
}

function ExerciseBlock({ x, unit, setEx, setSet, toggle }: {
  x: AEx; unit: 'kg' | 'lb'
  setEx: (k: string, fn: (x: AEx) => AEx) => void
  setSet: (k: string, i: number, p: Partial<ASet>) => void
  toggle: (x: AEx, i: number) => void
}) {
  const { update } = useActive()
  const [restOpen, setRestOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const k = x.ex.kind
  // "To PR" line: compare this session's checked-off sets against the all-time best.
  const best = useBest(x.ex.id)
  const done = x.sets.filter((s) => s.done)
  const liveE1 = Math.max(0, ...done.map((s) => epley(fromUnit(num(s.w), unit), Math.round(num(s.r)))))
  const liveReps = Math.max(0, ...done.map((s) => Math.round(num(s.r))))
  const liveSec = Math.max(0, ...done.map((s) => Math.round(num(s.sec))))
  const prReps = parseInt(x.target) || Math.round(num(done[done.length - 1]?.r ?? '')) || x.prev[0]?.r || 5
  const workingW = num(done[done.length - 1]?.w ?? '') || num(x.sets.find((s) => s.w)?.w ?? '') || (x.prev[0]?.w ? Number(fmtW(x.prev[0].w, unit)) : 0) || (best?.w ? Number(fmtW(best.w, unit)) : 0)
  const pr = prLine(x.ex, best, prReps, unit, liveE1, liveReps, liveSec, workingW)
  const cols = k === 'duration' ? ['Sec'] : k === 'cardio' ? [distLabel(unit), 'Min'] : [k === 'assisted' ? `−${unit}` : k === 'bodyweight' ? `+${unit}` : unit, 'Reps']
  const field = (c: string): keyof ASet => (c === 'Reps' ? 'r' : c === 'Sec' || c === 'Min' ? 'sec' : c === distLabel(unit) ? 'dist' : 'w')
  const placeholder = (p: Prev | undefined, c: string) => {
    if (c === 'Reps') return x.target || (p?.r ? `${p.r}` : '0')
    if (c === 'Sec') return p?.sec ? `${p.sec}` : '0'
    if (c === 'Min') return p?.sec ? `${Math.round(p.sec / 60)}` : '0'
    if (c === distLabel(unit)) return p?.dist ? fmtDist(p.dist, unit) : '0'
    return p?.w ? fmtW(p.w, unit) : '0'
  }
  // Cardio minutes are entered as minutes but stored as seconds.
  const getVal = (s: ASet, c: string) => (c === 'Min' ? (s.sec ? `${Math.round((parseFloat(s.sec) / 60) * 10) / 10}` : '') : (s[field(c)] as string))
  const setVal = (i: number, c: string, v: string) => setSet(x.key, i, { [field(c)]: c === 'Min' ? (v ? `${Math.round(parseFloat(v) * 60)}` : '') : v })

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="truncate font-extrabold text-accent">{x.ex.name}</p>
            <button onClick={() => setInfoOpen(true)} className="grid size-7 shrink-0 place-items-center rounded-full text-muted active:bg-surface-2" aria-label={`About ${x.ex.name}`}>
              <InfoIcon width={18} height={18} />
            </button>
          </div>
          {pr && <p className={`num truncate text-xs font-semibold ${pr.hit ? 'text-accent' : 'text-muted'}`}>{pr.text}</p>}
          {x.target && <p className="text-xs text-faint">Target {x.target} reps</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button onClick={() => setRestOpen(true)} className="flex h-8 items-center gap-1 rounded-lg bg-surface-2 px-2.5 text-xs font-bold text-muted">
            <TimerIcon width={14} height={14} /><span className="num">{restLabel(x.rest)}{(x.restAfter ?? x.rest) !== x.rest ? ` · ${restLabel(x.restAfter ?? x.rest)}` : ''}</span>
          </button>
          <button onClick={() => confirm(`Remove ${x.ex.name}?`) && update((w) => ({ ...w, exercises: w.exercises.filter((e) => e.key !== x.key) }))} className="p-2 text-faint"><TrashIcon width={18} height={18} /></button>
        </div>
      </div>
      <div className="grid gap-x-2 gap-y-1.5 text-center text-sm" style={{ gridTemplateColumns: `1.5rem minmax(3.5rem,1fr) ${cols.map(() => 'minmax(0,1fr)').join(' ')} 2.75rem` }}>
        <span className="text-[11px] font-bold uppercase text-faint">Set</span>
        <span className="text-[11px] font-bold uppercase text-faint">Prev</span>
        {cols.map((c) => <span key={c} className="text-[11px] font-bold uppercase text-faint">{c}</span>)}
        <span />
        {x.sets.map((s, i) => {
          const p = x.prev[i]
          return [
            <span key={`n${i}`} className="num self-center font-bold text-muted">{i + 1}</span>,
            // Tap the previous-session value to copy it into this set (doesn't check it off).
            p ? (
              <button key={`p${i}`} type="button" onClick={() => setSet(x.key, i, {
                w: p.w ? fmtW(p.w, unit) : s.w, r: p.r ? `${p.r}` : s.r, sec: p.sec ? `${p.sec}` : s.sec, dist: p.dist ? fmtDist(p.dist, unit) : s.dist,
              })} className="num h-10 min-w-0 truncate rounded-lg text-xs font-semibold text-muted underline decoration-dotted underline-offset-2 active:bg-surface-2"
                aria-label={`Use previous: ${prevText(p, x, unit)}`}>{prevText(p, x, unit)}</button>
            ) : <span key={`p${i}`} className="num self-center text-xs text-faint">—</span>,
            ...cols.map((c) => (
              <input key={`${c}${i}`} inputMode={c === 'Reps' || c === 'Sec' ? 'numeric' : 'decimal'} value={getVal(s, c)} placeholder={placeholder(p, c)}
                onChange={(e) => setVal(i, c, c === 'Reps' || c === 'Sec' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                className={`num h-10 w-full min-w-0 rounded-lg text-center font-bold outline-none placeholder:text-faint focus:ring-2 focus:ring-accent ${s.done ? 'bg-accent/15' : 'bg-surface-2'}`} />
            )),
            <button key={`d${i}`} onClick={() => toggle(x, i)} className={`grid h-10 place-items-center rounded-lg ${s.done ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-faint'}`}><CheckIcon width={20} height={20} /></button>,
          ]
        })}
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => setEx(x.key, (e) => ({ ...e, sets: [...e.sets, { ...emptySet(), w: e.sets[e.sets.length - 1]?.w ?? '' }] }))} className="h-9 flex-1 rounded-lg bg-surface-2 text-sm font-bold">+ Add set</button>
        {x.sets.length > 1 && <button onClick={() => setEx(x.key, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))} className="h-9 rounded-lg bg-surface-2 px-4 text-sm font-bold text-muted">−</button>}
      </div>
      {infoOpen && <ExerciseInfo ex={x.ex} initialTab="stats" onClose={() => setInfoOpen(false)} />}
      {restOpen && (
        <LiftRestSheet name={x.ex.name} rest={x.rest} after={x.restAfter ?? x.rest} onClose={() => setRestOpen(false)}
          onSave={(rest, after, remember) => {
            setEx(x.key, (e) => ({ ...e, rest, restAfter: after }))
            // Stored as -1 when "Off" so it isn't confused with "use my default".
            if (remember) saveLiftRest(x.ex, { rest_s: rest || -1, rest_after_s: after || -1 }).catch(() => {})
          }} />
      )}
    </Card>
  )
}
