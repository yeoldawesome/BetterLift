import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ExerciseList, ExercisePicker } from '../components/ExerciseList'
import { ExerciseInfo } from '../components/ExerciseInfo'
import { CheckIcon, ChevronIcon, DotsIcon, DownIcon, FlameIcon, GlobeIcon, LockIcon, PlusIcon, TimerIcon, UpIcon } from '../components/icons'
import { LiftRestSheet, restLabel } from '../components/RestPicker'
import { saveLiftRest } from '../lib/exercises'
import { BottomSheet, Button, Card, ErrorText, Input, Screen, Sheet, Stat, Toggle } from '../components/ui'
import { SET_TYPES, setLabels, type SetType } from '../lib/setTypes'
import { emptySet, finishWorkout, makeEx, repairActive, routineExercises, saveAsRoutine, syncRoutine, useActive, type AEx, type ASet, type Prev } from '../lib/active'
import { prLine, useBest, clearBestCache } from '../lib/best'
import { fmtCountdown, loadStreak, streakText, type Streak } from '../lib/streak'
import { invalidateStats } from '../lib/statsData'
import { distLabel, epley, fmtClock, fmtDist, fmtVol, fmtW, fromDist, fromUnit, num } from '../lib/format'
import { CardioEffort } from '../components/nutrition/CardioEffort'
import { SwipeRow } from '../components/SwipeRow'
import { RoutineUpdatePicker } from '../components/RoutineUpdatePicker'
import { RestInline } from '../components/RestBar'
import { DragList } from '../components/DragList'
import { selectAll } from '../lib/selectAll'
import { isCardio } from '../lib/energy'
import { loadWeight } from '../lib/nutrition'
import { errMsg, me, newId, pb, restFor, routineUpdate, useUnit, useUser, type Exercise, type Routine, type RoutineUpdate, type User, type Visibility, type Workout as W } from '../lib/pb'
import { ask, tell } from '../components/Dialog'

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
    try { start(r.name, r.id, await routineExercises(r.id)) } catch (e) { tell(errMsg(e)) } finally { setBusy('') }
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
  const [open, setOpen] = useState(false)
  const tone = s.atRisk ? 'border-amber-400/50 bg-amber-400/10' : s.days ? 'border-accent/40 bg-accent/10' : 'border-line bg-surface'
  return (
    <div className={`rounded-2xl border ${tone}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
        <FlameIcon width={32} height={32} className={`shrink-0 ${s.days ? 'text-orange-500' : 'text-faint'}`} fill="currentColor" fillOpacity={s.days ? 0.2 : 0} aria-hidden />
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
        <DownIcon width={16} height={16} className={`shrink-0 text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <StreakDetail s={s} />}
    </div>
  )
}

/** Live countdown to the moment the streak breaks, plus the facts behind it. */
function StreakDetail({ s }: { s: Streak }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])
  if (!s.days || !s.deadline) {
    return <p className="border-t border-line/60 px-3 py-3 text-sm text-muted">Log a workout to start a streak. After each workout you can take up to 2 rest days before you need to lift again.{s.best ? ` Your best so far is ${s.best} days.` : ''}</p>
  }
  const left = s.deadline.getTime() - now
  const lastDay = new Date(s.deadline.getTime() - 1)
  const day = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
  return (
    <div className="space-y-3 border-t border-line/60 px-3 py-3">
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Time left to keep it</p>
        <p className={`num text-3xl font-black ${s.atRisk ? 'text-amber-300' : 'text-accent'}`}>{fmtCountdown(left)}</p>
        <p className="text-xs text-muted">Lift by the end of {day(lastDay)}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="num text-lg font-black">{s.workouts}</p><p className="text-[10px] font-semibold uppercase text-muted">Workouts</p></div>
        <div><p className="num text-lg font-black">{s.restLeft}</p><p className="text-[10px] font-semibold uppercase text-muted">Rest days left</p></div>
        <div><p className="num text-lg font-black">{s.best}</p><p className="text-[10px] font-semibold uppercase text-muted">Best streak</p></div>
      </div>
      {s.lastLift && <p className="text-center text-xs text-muted">Last workout {day(s.lastLift)}</p>}
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

  const [reordering, setReordering] = useState(false)
  const [replacing, setReplacing] = useState<string | null>(null)
  const [supersetFor, setSupersetFor] = useState<string | null>(null)
  const setList = (fn: (xs: AEx[]) => AEx[]) => update((w) => ({ ...w, exercises: tidySupersets(fn(w.exercises)) }))

  const remove = (key: string) => setList((xs) => xs.filter((e) => e.key !== key))
  const move = (key: string, d: -1 | 1) => setList((xs) => {
    const i = xs.findIndex((e) => e.key === key), j = i + d
    if (i < 0 || j < 0 || j >= xs.length) return xs
    const out = [...xs]; [out[i], out[j]] = [out[j], out[i]]
    return out
  })
  const moveTo = (from: number, to: number) => setList((xs) => {
    const out = [...xs]
    const [it] = out.splice(from, 1)
    out.splice(to, 0, it)
    return out
  })
  const leaveSuperset = (key: string) => setList((xs) => xs.map((e) => (e.key === key ? { ...e, superset: undefined } : e)))
  /** Put `src` in the same superset as `tgt` and pull every member together so they sit back-to-back. */
  const joinSuperset = (src: string, tgt: string) => setList((xs) => {
    const a1 = xs.find((e) => e.key === src)!, b1 = xs.find((e) => e.key === tgt)!
    const id = b1.superset || a1.superset || newId()
    const old = a1.superset
    const tagged = xs.map((e) => (e.key === src || e.key === tgt || (old && e.superset === old) ? { ...e, superset: id } : e))
    const first = tagged.findIndex((e) => e.superset === id)
    const members = tagged.filter((e) => e.superset === id)
    const others = tagged.filter((e) => e.superset !== id)
    const before = tagged.slice(0, first).length
    return [...others.slice(0, before), ...members, ...others.slice(before)]
  })
  const replace = async (key: string, ex: Exercise) => {
    setReplacing(null)
    const r = restFor(ex, user)
    const made = await makeEx(ex, 1, r.rest, '', r.after)
    setList((xs) => xs.map((e) => (e.key === key
      ? { ...made, key, note: e.note, superset: e.superset, sets: e.sets.map((s) => ({ ...emptySet(), type: s.type })) }
      : e)))
  }

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
      // The routine's planned weight wins over last session's.
      const plan = x.plan?.[i] ?? x.plan?.[x.plan.length - 1]
      const patch: Partial<ASet> = { done: true }
      if (!s.w && (plan?.w || p?.w)) patch.w = fmtW(plan?.w || p!.w, unit)
      if (!s.r && (plan?.r || x.target || p?.r)) patch.r = plan?.r ? `${plan.r}` : x.target || `${p!.r}`
      if (!s.sec && (plan?.sec || p?.sec)) patch.sec = `${plan?.sec || p!.sec}`
      if (!s.dist && (plan?.dist || p?.dist)) patch.dist = fmtDist(plan?.dist || p!.dist, unit)
      setSet(x.key, i, patch)
      // Supersets: no rest until the last exercise of the group, then that exercise's rest.
      const group = x.superset ? a.exercises.filter((e) => e.superset === x.superset) : [x]
      if (group[group.length - 1].key !== x.key) return
      // Last unchecked set of this exercise (or whole superset) → transition rest before the next exercise.
      const finishing = group.every((e) => e.sets.every((t, j) => (e.key === x.key && j === i) || t.done))
      startRest(finishing ? (x.restAfter ?? x.rest) : x.rest, finishing ? undefined : x.ex.name)
    } else setSet(x.key, i, { done: false })
  }

  return (
    <section className="mx-auto max-w-lg px-safe pb-28">
      {/*
        Sticky, and always below the status bar: on iPhone, taps in the status-bar strip go to iOS (scroll to top), so a
        Finish button that had scrolled up under it would ignore taps. preventDefault on pointer-down keeps a focused set
        box from blurring first (closing the keyboard shifts the layout and the tap would miss).
      */}
      <div className="sticky top-0 z-30 -mx-4 mb-4 mt-[calc(-1*env(safe-area-inset-top))] flex items-center justify-between gap-3 bg-canvas/90 px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1rem)] backdrop-blur-xl" data-workout-header>
        <div className="flex shrink-0 items-center gap-2 text-sm font-bold text-accent"><TimerIcon width={18} height={18} /><Elapsed since={a.startedAt} /></div>
        <RestInline />
        <Button size="sm" onPointerDown={(e) => e.preventDefault()} onClick={() => { (document.activeElement as HTMLElement | null)?.blur(); setFinishing(true) }}>Finish</Button>
      </div>
      <input value={a.name} onChange={(e) => update((w) => ({ ...w, name: e.target.value }))} className="mb-4 w-full bg-transparent text-3xl font-extrabold tracking-tight outline-none" />
      <div className="space-y-3">
        {a.exercises.map((x) => (
          <ExerciseBlock key={x.key} x={x} unit={unit} setEx={setEx} setSet={setSet} toggle={toggle}
            onReorder={() => setReordering(true)} onReplace={() => setReplacing(x.key)} onRemove={() => remove(x.key)}
            onSuperset={() => (x.superset ? leaveSuperset(x.key) : setSupersetFor(x.key))} />
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <Button variant="ghost" onClick={() => setPicking(true)}><PlusIcon width={18} height={18} className="mr-1 inline" />Add exercises</Button>
        {/* Same as the Finish button up top, for when you've scrolled to the end. */}
        {a.exercises.length > 0 && <Button onClick={() => setFinishing(true)}>Finish workout</Button>}
        <Button variant="danger" onClick={async () => { if (await ask({ title: 'Discard this workout?', body: 'Everything you logged in it will be lost.', confirmLabel: 'Discard', danger: true })) discard() }}>Discard workout</Button>
      </div>
      {picking && <ExercisePicker onPick={add} onClose={() => setPicking(false)} />}
      {finishing && <FinishSheet user={user} onClose={() => setFinishing(false)} />}
      {reordering && <ReorderSheet items={a.exercises} move={move} moveTo={moveTo} onClose={() => setReordering(false)} />}
      {replacing && <Sheet title="Replace exercise" onClose={() => setReplacing(null)}><ExerciseList onPick={(exs) => exs[0] && replace(replacing, exs[0])} /></Sheet>}
      {supersetFor && (
        <BottomSheet title="Add to superset" onClose={() => setSupersetFor(null)}>
          {a.exercises.length < 2 && <p className="py-4 text-center text-sm text-muted">Add another exercise first.</p>}
          <div className="space-y-1">
            {a.exercises.filter((e) => e.key !== supersetFor).map((e) => (
              <button key={e.key} onClick={() => { joinSuperset(supersetFor, e.key); setSupersetFor(null) }}
                className="flex w-full items-center justify-between gap-2 rounded-xl p-3 text-left active:bg-surface-2">
                <span className="truncate font-bold">{e.ex.name}</span>
                {e.superset && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Superset</span>}
              </button>
            ))}
          </div>
        </BottomSheet>
      )}
    </section>
  )
}

/** Reorder exercises: drag the grip handle or use the arrows. Shared with the routine editor. */
export function ReorderSheet({ items, move, moveTo, onClose }: { items: AEx[]; move: (key: string, d: -1 | 1) => void; moveTo: (from: number, to: number) => void; onClose: () => void }) {
  return (
    <BottomSheet title="Reorder exercises" onClose={onClose}>
      <div className="space-y-2">
        <p className="text-center text-xs text-muted">Drag the handle or use the arrows.</p>
        <DragList items={items} keyOf={(e) => e.key} onMove={moveTo} render={(e, i, handle) => (
          <div className="flex items-center gap-2 rounded-xl bg-surface-2 p-2 pl-1">
            {handle}
            <span className="min-w-0 flex-1 truncate font-bold">{e.ex.name}</span>
            {e.superset && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">Superset</span>}
            <button disabled={i === 0} onClick={() => move(e.key, -1)} className="grid size-9 place-items-center rounded-lg bg-surface text-muted disabled:opacity-30" aria-label="Move up"><UpIcon width={18} height={18} /></button>
            <button disabled={i === items.length - 1} onClick={() => move(e.key, 1)} className="grid size-9 place-items-center rounded-lg bg-surface text-muted disabled:opacity-30" aria-label="Move down"><DownIcon width={18} height={18} /></button>
          </div>
        )} />
        <Button onClick={onClose}>Done</Button>
      </div>
    </BottomSheet>
  )
}

/** A superset needs at least two exercises; drop the tag from any exercise left on its own. */
function tidySupersets(xs: AEx[]): AEx[] {
  const n = new Map<string, number>()
  xs.forEach((e) => e.superset && n.set(e.superset, (n.get(e.superset) ?? 0) + 1))
  return xs.map((e) => (e.superset && (n.get(e.superset) ?? 0) < 2 ? { ...e, superset: undefined } : e))
}

/** Confirm-and-post step: name, visibility, routine update. Choices are remembered on the user. */
/** Scroll to the first unchecked set and pulse every unchecked set row. */
function showUnchecked() {
  const cells = [...document.querySelectorAll<HTMLElement>('[data-undone]')]
  cells[0]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  for (const c of cells) {
    c.classList.remove('pulse-set'); void c.offsetWidth // restart the animation if tapped again
    c.classList.add('pulse-set')
    setTimeout(() => c.classList.remove('pulse-set'), 2600)
  }
}

function FinishSheet({ user, onClose }: { user: User; onClose: () => void }) {
  const { active, discard } = useActive()
  const unit = useUnit()
  const nav = useNavigate()
  const a = active!
  const [name, setName] = useState(a.name)
  const [notes, setNotes] = useState(a.notes)
  const [visibility, setVisibility] = useState<Visibility>(user.post_visibility || 'public')
  const [updateRoutine, setUpdateRoutine] = useState<RoutineUpdate>(routineUpdate(user))
  const [saveRoutine, setSaveRoutine] = useState(user.save_as_routine)
  const [routineName, setRoutineName] = useState('')
  const [bw, setBw] = useState(user.bodyweight_kg ? fmtW(user.bodyweight_kg, unit) : '')
  // Only a bodyweight you actually typed becomes a Physique reading (the prefilled one is just your last known weight).
  const [bwTouched, setBwTouched] = useState(false)
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
      // A bodyweight you typed here is a weigh-in: it shows on Physique, linked back to this workout.
      if (bwTouched && num(bw) > 0) {
        await pb.collection('body_metrics').create({ user: user.id, measured_at: new Date().toISOString(), weight_kg: Math.round(bwKg * 100) / 100, source: `workout:${id}` })
          .then(() => loadWeight(true)).catch(() => {})
      }
      const prefs: Partial<User> = {}
      // Only write a new bodyweight if it actually changed in the displayed unit (avoids lb↔kg rounding drift).
      if (num(bw) > 0 && bw !== fmtW(user.bodyweight_kg, unit)) prefs.bodyweight_kg = Math.round(bwKg * 100) / 100
      if (visibility !== (user.post_visibility || 'public')) prefs.post_visibility = visibility
      if (a.routine && routineName && updateRoutine !== routineUpdate(user)) { prefs.routine_update = updateRoutine; prefs.update_routine = updateRoutine !== 'none' }
      if (!a.routine && saveRoutine !== user.save_as_routine) prefs.save_as_routine = saveRoutine
      await Promise.all([
        Object.keys(prefs).length ? pb.collection('users').update(user.id, prefs) : null,
        a.routine && routineName && updateRoutine !== 'none' ? syncRoutine(post, a.routine, unit, updateRoutine) : null,
        !a.routine && saveRoutine ? saveAsRoutine(post, post.name, unit) : null,
      ])
      clearBestCache()
      invalidateStats()
      discard()
      nav(`/recap/${id}`, { replace: true })
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <Sheet title="Finish workout" onClose={onClose} back>
      <div className="space-y-4 pb-6">
        {skipped > 0 && (
          // Tap to jump back to the unchecked sets; they pulse so they're easy to spot.
          <button onClick={() => { onClose(); setTimeout(showUnchecked, 60) }} className="flex w-full items-center gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-left active:opacity-80">
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-amber-300">{skipped} set{skipped > 1 ? 's' : ''} not checked off</span>
              <span className="block text-sm text-muted">{done ? "Unchecked sets won't be saved." : 'Check off at least one set to finish.'} Tap to see them.</span>
            </span>
            <ChevronIcon width={18} height={18} className="shrink-0 text-amber-300" />
          </button>
        )}
        <Input label="Post name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        {a.routine && routineName && name.trim() !== routineName && <p className="-mt-2 text-xs text-muted">Only this post is renamed — your routine stays “{routineName}”.</p>}
        <Input label="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="How did it feel?" />
        <div>
          <Input label={`Bodyweight today (${unit})`} inputMode="decimal" value={bw} onChange={(e) => { setBw(e.target.value); setBwTouched(true) }} />
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
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Update “{routineName}”</span>
            <RoutineUpdatePicker value={updateRoutine} onChange={setUpdateRoutine} />
          </div>
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
  if (x.ex.kind === 'duration') return isCardio(x.ex) ? `${Math.round(p.sec / 60)}m` : `${p.sec}s`
  if (x.ex.kind === 'cardio') return `${fmtDist(p.dist, unit)}${distLabel(unit)} ${Math.round(p.sec / 60)}m`
  if (x.ex.kind === 'bodyweight' && !p.w) return `${p.r} reps`
  return `${fmtW(p.w, unit)}×${p.r}`
}

/**
 * One exercise card. `planning` = the routine editor: same sets grid (types, weight/reps or time/distance), but no
 * check-off column, PR line, supersets or cardio effort — the values typed are what the routine plans.
 */
export function ExerciseBlock({ x, unit, setEx, setSet, toggle, onReorder, onReplace, onRemove, onSuperset, planning }: {
  x: AEx; unit: 'kg' | 'lb'
  setEx: (k: string, fn: (x: AEx) => AEx) => void
  setSet: (k: string, i: number, p: Partial<ASet>) => void
  toggle: (x: AEx, i: number) => void
  onReorder: () => void; onReplace: () => void; onRemove: () => void; onSuperset: () => void
  planning?: boolean
}) {
  const [restOpen, setRestOpen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const collapsed = !!x.collapsed
  const [typeFor, setTypeFor] = useState<number | null>(null)
  // Swiped-away set, kept for a few seconds so it can be put back.
  const [undo, setUndo] = useState<{ i: number; set: ASet } | null>(null)
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t) }, [undo])
  const labels = setLabels(x.sets.map((s) => s.type))
  const menu: [string, () => void, boolean?][] = [
    [`Edit Rest (${restLabel(x.rest)}${(x.restAfter ?? x.rest) !== x.rest ? ` · ${restLabel(x.restAfter ?? x.rest)}` : ''})`, () => setRestOpen(true)],
    ['Reorder Exercises', onReorder],
    [x.note !== undefined ? 'Remove Exercise Note' : 'Add Exercise Note', () => setEx(x.key, (e) => ({ ...e, note: e.note !== undefined ? undefined : '' }))],
    ...(planning ? [] : [[x.superset ? 'Remove From Superset' : 'Add To Superset', onSuperset] as [string, () => void]]),
    ['Replace Exercise', onReplace],
    ['Remove Exercise', async () => { if (await ask({ title: `Remove ${x.ex.name}?`, body: planning ? 'It comes out of this routine.' : 'Its sets in this workout are removed too.', confirmLabel: 'Remove', danger: true })) onRemove() }, true],
  ]
  const k = x.ex.kind
  const cardio = isCardio(x.ex)
  // "To PR" line: compare this session's checked-off sets against the all-time best.
  const best = useBest(x.ex.id)
  const done = x.sets.filter((s) => s.done)
  const liveE1 = Math.max(0, ...done.map((s) => epley(fromUnit(num(s.w), unit), Math.round(num(s.r)))))
  const liveReps = Math.max(0, ...done.map((s) => Math.round(num(s.r))))
  const liveSec = Math.max(0, ...done.map((s) => Math.round(num(s.sec))))
  const prReps = parseInt(x.target) || Math.round(num(done[done.length - 1]?.r ?? '')) || x.prev[0]?.r || 5
  const workingW = num(done[done.length - 1]?.w ?? '') || num(x.sets.find((s) => s.w)?.w ?? '') || (x.prev[0]?.w ? Number(fmtW(x.prev[0].w, unit)) : 0) || (best?.w ? Number(fmtW(best.w, unit)) : 0)
  const pr = planning ? null : prLine(x.ex, best, prReps, unit, liveE1, liveReps, liveSec, workingW)
  // Timed cardio (basketball, jump rope…) is entered in minutes; holds like planks stay in seconds.
  const cols = k === 'duration' ? [cardio ? 'Min' : 'Sec'] : k === 'cardio' ? [distLabel(unit), 'Min'] : [k === 'assisted' ? `−${unit}` : k === 'bodyweight' ? `+${unit}` : unit, 'Reps']
  const field = (c: string): keyof ASet => (c === 'Reps' ? 'r' : c === 'Sec' || c === 'Min' ? 'sec' : c === distLabel(unit) ? 'dist' : 'w')
  const placeholder = (p: Prev | undefined, c: string, i: number) => {
    const plan = x.plan?.[i] ?? x.plan?.[x.plan.length - 1]
    if (c === 'Reps') return plan?.r ? `${plan.r}` : x.target || (p?.r ? `${p.r}` : '0')
    const sec = plan?.sec || p?.sec, dist = plan?.dist || p?.dist
    if (c === 'Sec') return sec ? `${sec}` : '0'
    if (c === 'Min') return sec ? `${Math.round(sec / 60)}` : '0'
    if (c === distLabel(unit)) return dist ? fmtDist(dist, unit) : '0'
    return plan?.w ? fmtW(plan.w, unit) : p?.w ? fmtW(p.w, unit) : '0'
  }
  // Cardio minutes are entered as minutes but stored as seconds.
  const getVal = (s: ASet, c: string) => (c === 'Min' ? (s.sec ? `${Math.round((parseFloat(s.sec) / 60) * 10) / 10}` : '') : (s[field(c)] as string))
  const setVal = (i: number, c: string, v: string) => setSet(x.key, i, { [field(c)]: c === 'Min' ? (v ? `${Math.round(parseFloat(v) * 60)}` : '') : v })

  const initials = x.ex.name.replace(/\(.*?\)/g, '').split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
  const head = 'text-xs font-extrabold uppercase tracking-wider text-accent'
  const box = 'h-12 rounded-xl'

  return (
    <Card className={`relative p-0! ${x.superset ? 'mt-5 border-red-600/50' : ''}`}>
      {x.superset && <span className="absolute -top-3 right-12 z-10 rounded-lg bg-red-600 px-2 py-0.5 text-xs font-bold text-white">Superset</span>}
      <div className="flex items-center gap-3 px-3 py-3">
        {/* Tap the icon or name for instructions, history and stats. */}
        <button onClick={() => setInfoOpen(true)} aria-hidden tabIndex={-1}
          className="grid size-12 shrink-0 place-items-center rounded-full border-2 border-accent/35 bg-accent/15 text-base font-extrabold text-accent active:opacity-70">{initials}</button>
        <div className="min-w-0 flex-1">
          <button onClick={() => setInfoOpen(true)} className="block max-w-full text-left text-base font-extrabold leading-snug break-words active:opacity-70">{x.ex.name}</button>
          {collapsed
            ? <p className="num text-xs font-semibold text-muted">{planning ? `${x.sets.length} set${x.sets.length === 1 ? '' : 's'}` : `${done.length}/${x.sets.length} sets done`}</p>
            : <>
              {pr && <p className={`num truncate text-xs font-semibold ${pr.hit ? 'text-accent' : 'text-muted'}`}>{pr.text}</p>}
              {x.target && !x.plan?.length && <p className="text-xs text-faint">Target {x.target} reps</p>}
            </>}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button onClick={() => setEx(x.key, (e) => ({ ...e, collapsed: !e.collapsed }))} className="grid size-9 place-items-center rounded-lg text-accent active:bg-surface-2" aria-label={collapsed ? `Expand ${x.ex.name}` : `Collapse ${x.ex.name}`} aria-expanded={!collapsed}>
            <UpIcon width={22} height={22} strokeWidth={2.5} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen(true)} className="grid size-9 place-items-center rounded-lg text-muted active:bg-surface-2" aria-label={`${x.ex.name} options`}><DotsIcon width={20} height={20} /></button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full z-50 mt-1 w-60 overflow-hidden rounded-2xl border border-line bg-surface-2 py-1 shadow-2xl">
                  {menu.map(([label, fn, danger]) => (
                    <button key={label} onClick={() => { setMenuOpen(false); fn() }}
                      className={`block w-full px-4 py-3 text-left font-semibold active:bg-surface ${danger ? 'text-danger' : ''}`}>{label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {x.note !== undefined && (
        <div className="px-3 pb-3">
          <textarea value={x.note} onChange={(e) => setEx(x.key, (ex) => ({ ...ex, note: e.target.value }))} placeholder="Add a note for this exercise…" rows={Math.min(5, Math.max(1, x.note.split('\n').length))}
            autoFocus={!x.note} maxLength={1000} className="block w-full resize-none rounded-lg bg-surface-2 px-3 py-2 text-sm outline-none placeholder:text-faint focus:ring-2 focus:ring-accent" />
        </div>
      )}
      {!collapsed && <div className="overflow-hidden rounded-b-2xl bg-[color-mix(in_srgb,var(--color-canvas)_35%,var(--color-surface))]">
      <div className="grid gap-x-2 text-center" style={{ gridTemplateColumns: `0 2.75rem minmax(3.5rem,1.4fr) ${cols.map(() => 'minmax(0,1fr)').join(' ')} ${planning ? '0' : '3rem'} 0` }}>
        <div className="col-span-full grid grid-cols-subgrid bg-[color-mix(in_srgb,var(--color-canvas)_55%,var(--color-surface))] py-3">
          <span />
          <span className={head}>Set</span>
          <span className={head}>Prev</span>
          {cols.map((c) => <span key={c} className={head}>{c === 'lb' || c === 'kg' ? `${c}s` : c}</span>)}
          <span /><span />
        </div>
        {/* Each set is one row: swipe it left or right to delete. Checked-off rows light up. */}
        {x.sets.map((s, i) => {
          const p = x.prev[i]
          return <SwipeRow key={`row${i}`} label={`Delete set ${i + 1}`} flush
            rowClass={`py-1.5 ${s.done ? 'bg-[color-mix(in_srgb,var(--color-accent)_13%,var(--color-surface))]' : 'bg-[color-mix(in_srgb,var(--color-canvas)_35%,var(--color-surface))]'}`}
            onDelete={() => { setUndo({ i, set: x.sets[i] }); setEx(x.key, (e) => ({ ...e, sets: e.sets.filter((_, j) => j !== i) })) }}>{[
            <span key={`l${i}`} />,
            <button key={`n${i}`} onClick={() => setTypeFor(i)} className={`num ${box} text-xl font-extrabold active:opacity-70 ${s.done ? 'bg-accent/10' : 'bg-surface-2'} ${labels[i].color || ''}`} aria-label={`Set ${i + 1} type`}>{labels[i].text}</button>,
            // Tap the previous-session value to copy it into this set (doesn't check it off).
            p ? (
              <button key={`p${i}`} type="button" onClick={() => setSet(x.key, i, {
                w: p.w ? fmtW(p.w, unit) : s.w, r: p.r ? `${p.r}` : s.r, sec: p.sec ? `${p.sec}` : s.sec, dist: p.dist ? fmtDist(p.dist, unit) : s.dist,
              })} className={`num ${box} min-w-0 truncate px-1 text-sm font-medium text-muted active:opacity-70 ${s.done ? 'bg-accent/10' : 'bg-surface-2'}`}
                aria-label={`Use previous: ${prevText(p, x, unit)}`}>{prevText(p, x, unit).replace('×', ' × ')}</button>
            ) : <span key={`p${i}`} className={`num grid ${box} place-items-center text-sm text-faint ${s.done ? 'bg-accent/10' : 'bg-surface-2'}`}>–</span>,
            ...cols.map((c) => (
              <input key={`${c}${i}`} data-undone={!s.done || undefined} inputMode={c === 'Reps' || c === 'Sec' ? 'numeric' : 'decimal'} value={getVal(s, c)} placeholder={placeholder(p, c, i)} onFocus={selectAll}
                onChange={(e) => setVal(i, c, c === 'Reps' || c === 'Sec' ? e.target.value.replace(/\D/g, '') : e.target.value)}
                className={`num ${box} w-full min-w-0 text-center text-xl font-extrabold outline-none placeholder:text-faint focus:ring-2 focus:ring-accent ${s.done ? 'bg-accent/10' : 'bg-surface-2'}`} />
            )),
            planning ? <span key={`d${i}`} /> : <div key={`d${i}`} className="grid place-items-center">
              <button data-undone={!s.done || undefined} aria-label={s.done ? `Set ${i + 1} done` : `Mark set ${i + 1} done`} onClick={() => toggle(x, i)}
                className={`grid size-12 place-items-center rounded-full transition-colors active:translate-y-0.5 ${s.done
                  ? 'bg-accent text-accent-ink shadow-[0_3px_0_color-mix(in_srgb,var(--color-accent)_60%,black)]'
                  : 'bg-surface-2 text-muted shadow-[0_3px_0_color-mix(in_srgb,var(--color-surface-2)_50%,black)]'}`}><CheckIcon width={24} height={24} strokeWidth={2.75} /></button>
            </div>,
            <span key={`r${i}`} />,
            // Cardio: effort (RPE / heart rate / watch calories) and the estimated burn, under the set.
            ...(cardio && !planning ? [
              <div key={`e${i}`} style={{ gridColumn: '2 / -2' }} className="-mt-0.5 mb-0.5">
                <CardioEffort name={x.ex.name} kind={x.ex.kind} seconds={num(s.sec)} distanceKm={fromDist(num(s.dist), unit)}
                  effort={{ hr: s.hr, rpe: s.rpe, kcal: s.kcal }} onChange={(e) => setSet(x.key, i, { hr: e.hr, rpe: e.rpe, kcal: e.kcal })} />
              </div>,
            ] : []),
          ]}</SwipeRow>
        })}
      </div>
      <div className="flex gap-2 p-3 pt-1.5">
        <button onClick={() => setEx(x.key, (e) => {
          const last = e.sets[e.sets.length - 1]
          // Planning copies the last set's values (not its type); a workout copies just the weight.
          const next = planning && last ? { ...emptySet(), w: last.w, r: last.r, sec: last.sec, dist: last.dist } : { ...emptySet(), w: last?.w ?? '' }
          return { ...e, sets: [...e.sets, next] }
        })}
          className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-surface-2 text-base font-extrabold uppercase tracking-wider text-muted active:opacity-70"><PlusIcon width={20} height={20} strokeWidth={2.5} />Add set</button>
        {x.sets.length > 1 && <button onClick={() => setEx(x.key, (e) => ({ ...e, sets: e.sets.slice(0, -1) }))} className="h-12 rounded-xl bg-surface-2 px-5 text-lg font-extrabold text-muted active:opacity-70" aria-label="Remove last set">−</button>}
      </div>
      </div>}
      {typeFor !== null && (
        <BottomSheet title="Select Set Type" onClose={() => setTypeFor(null)}>
          {SET_TYPES.map((t) => (
            <button key={t.v} onClick={() => { setSet(x.key, typeFor, { type: t.v as SetType }); setTypeFor(null) }}
              className={`flex w-full items-center gap-5 rounded-xl px-4 py-3.5 text-left text-lg font-semibold active:bg-surface-2 ${(x.sets[typeFor]?.type || 'normal') === t.v ? 'bg-surface-2' : ''}`}>
              <span className={`num w-6 text-center text-xl font-black ${t.color}`}>{t.letter}</span>{t.label}
            </button>
          ))}
          {x.sets.length > 1 && (
            <button onClick={() => { setEx(x.key, (e) => ({ ...e, sets: e.sets.filter((_, j) => j !== typeFor) })); setTypeFor(null) }}
              className="mt-1 flex w-full items-center gap-5 rounded-xl px-4 py-3.5 text-left text-lg font-semibold text-danger active:bg-surface-2">
              <span className="w-6 text-center text-xl font-black">×</span>Remove Set
            </button>
          )}
        </BottomSheet>
      )}
      {undo && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 mx-auto flex max-w-lg px-safe">
          <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-2 pl-4 shadow-2xl">
            <span className="min-w-0 flex-1 truncate text-sm">Deleted set {undo.i + 1} of <span className="font-bold">{x.ex.name}</span></span>
            <button onClick={() => { const u = undo; setUndo(null); setEx(x.key, (e) => ({ ...e, sets: [...e.sets.slice(0, u.i), u.set, ...e.sets.slice(u.i)] })) }}
              className="h-9 shrink-0 rounded-xl px-3 text-sm font-bold text-accent">Undo</button>
          </div>
        </div>
      )}
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
