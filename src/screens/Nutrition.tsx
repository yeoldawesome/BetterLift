import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AddFood, type Tab } from '../components/nutrition/AddFood'
import { fmtK, MACRO_COLORS, MACRO_NAMES, MacroBar, MacroLine, Ring } from '../components/nutrition/bits'
import { LogEditor } from '../components/nutrition/LogEditor'
import { SwipeRow } from '../components/SwipeRow'
import { PaceCard, WeighInSheet, WeightCard } from '../components/nutrition/Weight'
import { BackIcon, BarcodeIcon, CalendarIcon, ChevronIcon, FlameIcon, PlusIcon, SearchIcon, SettingsIcon, SparkIcon } from '../components/icons'
import { Card, ErrorText, Screen, Spinner } from '../components/ui'
import { loadBurn, type DayBurn } from '../lib/energy'
import {
  ACTIVITY, addDays, addLogs, applyPace, computeTargets, dayLabel, deleteLog, goalProgress, isDay, loadLogs, logMacros, mealNow, MEALS, paceCheck, parseDay, saveSettings, sumLogs, today,
  useNutrition, type FoodLog, type Macros, type Meal, type Settings, type Targets,
} from '../lib/nutrition'
import { errMsg, useUser } from '../lib/pb'
import { fmtW } from '../lib/format'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const weekStart = (d: string) => addDays(d, -parseDay(d).getDay())

export default function Nutrition() {
  const user = useUser()!
  const unit = user.unit || 'lb'
  const [params, setParams] = useSearchParams()
  const day = isDay(params.get('d')) ? params.get('d')! : today()
  const setDay = (d: string) => setParams(d === today() ? {} : { d }, { replace: true })
  const { settings, person, weight, err: setErr } = useNutrition(user)
  const tracking = settings?.goal === 'track'

  const ws = weekStart(day)
  const [logs, setLogs] = useState<FoodLog[] | null>(null)
  const [burn, setBurn] = useState<Map<string, DayBurn>>(new Map())
  const [err, setErr2] = useState('')
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  const [adding, setAdding] = useState<{ meal: Meal; tab: Tab } | null>(null)
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const [weighing, setWeighing] = useState(false)
  const [undo, setUndo] = useState<FoodLog | null>(null)
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t) }, [undo])

  // Logs for the visible week (plus the day before, for "copy yesterday").
  useEffect(() => {
    let live = true
    setErr2('')
    // On failure show the error with an empty day rather than spinning forever.
    loadLogs(addDays(ws, -1), addDays(ws, 6)).then((l) => live && setLogs(l)).catch((e) => { if (live) { setErr2(errMsg(e)); setLogs((l) => l ?? []) } })
    return () => { live = false }
  }, [ws, tick])
  // Workouts (lifting + cardio) logged on these days, from the workout tracker.
  useEffect(() => {
    if (!person || !settings) return
    let live = true
    loadBurn(parseDay(ws), parseDay(addDays(ws, 7)), person, settings.countLifting).then((b) => live && setBurn(b)).catch(() => {})
    return () => { live = false }
  }, [ws, tick, person?.kg, person?.age, person?.sex, settings?.countLifting]) // eslint-disable-line react-hooks/exhaustive-deps
  // Pick up changes made elsewhere (another device, a workout just finished) when the app comes back to the foreground.
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [reload])

  const byDay = useMemo(() => {
    const m = new Map<string, FoodLog[]>()
    logs?.forEach((l) => m.set(l.day, [...(m.get(l.day) ?? []), l]))
    return m
  }, [logs])
  const targetFor = (d: string) => (settings && person ? computeTargets(settings, person, burn.get(d)?.total ?? 0) : null)
  const dayLogs = byDay.get(day) ?? []
  const eaten = sumLogs(dayLogs)
  const t = targetFor(day)
  const pace = settings && person ? paceCheck(settings, weight?.weighIns ?? [], person.kg) : { status: 'off' as const }

  const onAdded = (added: FoodLog[]) => setLogs((l) => [...(l ?? []), ...added.filter((a) => a.day >= addDays(ws, -1) && a.day <= addDays(ws, 6))])
  // Swipe-to-delete: remove right away, keep a copy for Undo.
  const swipeDelete = (l: FoodLog) => {
    setLogs((ls) => ls?.filter((x) => x.id !== l.id) ?? ls)
    setUndo(l)
    deleteLog(l.id).catch((e) => { setErr2(errMsg(e)); setUndo(null); reload() })
  }
  const undoDelete = async (l: FoodLog) => {
    setUndo(null)
    try { onAdded(await addLogs([{ name: l.name, detail: l.detail, meal: l.meal, servings: l.servings, base: l.base, macros: logMacros(l), source: l.source, barcode: l.barcode, items: l.items ?? undefined, savedMeal: l.saved_meal }], l.day)) }
    catch (e) { setErr2(errMsg(e)) }
  }
  const open = (tab: Tab, meal: Meal = day === today() ? mealNow() : 'snack') => setAdding({ meal, tab })
  // Food buttons in the bottom bar arrive as ?add=search|scan|quick|describe.
  const addParam = params.get('add')
  useEffect(() => {
    if (!addParam) return
    if (['describe', 'search', 'scan', 'quick'].includes(addParam)) open(addParam as Tab)
    const next = new URLSearchParams(params); next.delete('add')
    setParams(next, { replace: true })
  }, [addParam]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen title="Nutrition" action={
      <div className="flex items-center gap-1">
        <Link to={`/nutrition/calendar?m=${day.slice(0, 7)}`} className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Calendar"><CalendarIcon width={20} height={20} /></Link>
        <Link to="/nutrition/goals" className="grid size-10 place-items-center rounded-full bg-surface-2 text-muted" aria-label="Goals & targets"><SettingsIcon width={20} height={20} /></Link>
      </div>
    }>
      <ErrorText>{err || setErr}</ErrorText>

      {/* Day picker */}
      <div className="flex items-center justify-between">
        <button onClick={() => setDay(addDays(day, -1))} className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2" aria-label="Previous day"><BackIcon width={20} height={20} /></button>
        <button onClick={() => setDay(today())} className="text-base font-extrabold">{dayLabel(day)}{day !== today() && <span className="ml-2 text-xs font-semibold text-accent">Back to today</span>}</button>
        <button onClick={() => setDay(addDays(day, 1))} className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2" aria-label="Next day"><ChevronIcon width={20} height={20} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 7 }, (_, i) => addDays(ws, i)).map((d, i) => {
          const k = sumLogs(byDay.get(d) ?? []).kcal, tt = targetFor(d)
          return (
            <button key={d} onClick={() => setDay(d)} className={`flex flex-col items-center gap-1 rounded-xl py-1.5 ${d === day ? 'bg-surface-2' : ''}`} aria-label={dayLabel(d)}>
              <span className={`text-[11px] font-bold ${d === today() ? 'text-accent' : 'text-faint'}`}>{WEEKDAYS[i]}</span>
              {/* Tracking only: a full ring just marks days with food logged. */}
              <Ring value={tracking ? (k > 0 ? 1 : 0) : k} max={tracking ? 1 : tt?.kcal ?? 0} size={34} stroke={4}><span className="num text-[11px] font-bold">{parseDay(d).getDate()}</span></Ring>
            </button>
          )
        })}
      </div>

      {settings && !settings.setUp && (
        <Link to="/nutrition/goals" className="flex items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-4">
          <span className="min-w-0 flex-1"><span className="block font-bold">Set your goal</span><span className="block text-sm text-muted">Cut, maintain or bulk with daily targets, or just track what you eat.</span></span>
          <ChevronIcon width={20} height={20} className="shrink-0 text-accent" />
        </Link>
      )}

      {day === today() && settings && pace.status === 'adjust' && (
        <PaceCard pace={pace} unit={unit} onApply={() => saveSettings(applyPace(settings, pace.delta)).then(() => {})} onDismiss={() => saveSettings({ lastCheckAt: Date.now() }).then(() => {})} />
      )}

      {/* Calories */}
      {!t || !logs || !settings ? <Spinner /> : tracking ? (
        <TrackSummary eaten={eaten} burned={t.baseline + t.exerciseBurn} />
      ) : (
        <Card>
          <div className="flex items-center gap-4">
            <Ring value={eaten.kcal} max={t.kcal} size={128} stroke={12}>
              <div>
                <p className="num text-[28px] font-black leading-none">{fmtK(Math.abs(t.kcal - eaten.kcal))}</p>
                <p className={`mt-1 text-[11px] font-bold uppercase tracking-wider ${eaten.kcal > t.kcal ? 'text-danger' : 'text-muted'}`}>{eaten.kcal > t.kcal ? 'kcal over' : 'kcal left'}</p>
              </div>
            </Ring>
            <dl className="min-w-0 flex-1 space-y-2 text-sm">
              <Row label="Eaten" value={fmtK(eaten.kcal)} />
              <Row label="Target" value={fmtK(t.kcal)} />
              <Row label="Goal" value={fmtK(t.base)} muted />
              {/* With add-back off (the default), show the burn without adding it. */}
              {settings.eatBack > 0
                ? <Row label={<span className="flex items-center gap-1"><FlameIcon width={13} height={13} />Exercise</span>} value={`+${fmtK(t.exercise)}`} muted />
                : <Row label={<span className="flex items-center gap-1"><FlameIcon width={13} height={13} />Burned</span>} value={fmtK(t.exerciseBurn)} muted />}
            </dl>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-3">
            <MacroBar k="p" eaten={eaten.p} target={t.p} />
            <MacroBar k="c" eaten={eaten.c} target={t.c} />
            <MacroBar k="f" eaten={eaten.f} target={t.f} />
          </div>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-4 gap-2">
        {([['describe', 'Describe', SparkIcon], ['search', 'Search', SearchIcon], ['scan', 'Scan', BarcodeIcon], ['quick', 'Macros', PlusIcon]] as const).map(([tab, label, Icon]) => (
          <button key={tab} onClick={() => open(tab)} className="flex flex-col items-center gap-1 rounded-2xl border border-line bg-surface py-3 text-xs font-bold text-muted active:scale-[0.98]">
            <Icon width={22} height={22} className="text-accent" />{label}
          </button>
        ))}
      </div>

      <WeightCard weight={weight} pace={pace} unit={unit} goal={settings && person ? goalProgress(settings, person.kg) : null} onLog={() => setWeighing(true)} />

      {/* Meals */}
      {logs && MEALS.map(([meal, label]) => {
        const items = dayLogs.filter((l) => l.meal === meal)
        const prev = (byDay.get(addDays(day, -1)) ?? []).filter((l) => l.meal === meal)
        const m = sumLogs(items)
        return (
          <section key={meal} className="rounded-2xl border border-line bg-surface">
            <header className="flex items-center gap-2 px-4 pb-1 pt-3">
              <h2 className="flex-1 font-extrabold">{label}</h2>
              {items.length > 0 && <span className="num text-sm font-bold text-muted">{fmtK(m.kcal)} kcal</span>}
              <button onClick={() => open('describe', meal)} className="grid size-8 place-items-center rounded-full bg-accent/15 text-accent" aria-label={`Add to ${label}`}><PlusIcon width={18} height={18} /></button>
            </header>
            {items.length > 0 ? (
              // One-column grid so each entry can be a SwipeRow: swipe sideways to delete, tap to edit.
              <div className="grid grid-cols-1 px-4 pb-2">
                {items.map((l, i) => (
                  <SwipeRow key={l.id} label={`Delete ${l.name}`} onDelete={() => swipeDelete(l)}>
                    <button onClick={() => setEditing(l)} className={`flex w-full items-center gap-3 py-2.5 text-left active:opacity-70 ${i ? 'border-t border-line' : ''}`}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{l.name}</span>
                        <span className="flex min-w-0 items-center gap-2">
                          {l.detail && <span className="truncate text-xs text-muted">{l.detail}</span>}
                          <MacroLine m={logMacros(l)} className="shrink-0" />
                        </span>
                      </span>
                      <span className="num shrink-0 font-bold">{fmtK(l.kcal)}</span>
                    </button>
                  </SwipeRow>
                ))}
              </div>
            ) : prev.length > 0 ? (
              <div className="px-4 pb-3">
                <button onClick={async () => {
                  try { onAdded(await addLogs(prev.map((p) => ({ name: p.name, detail: p.detail, meal, servings: p.servings, base: p.base, macros: logMacros(p), source: 'recent' as const, barcode: p.barcode, items: p.items ?? undefined })), day)) }
                  catch (e) { setErr2(errMsg(e)) }
                }} className="text-sm font-semibold text-accent">Copy {dayLabel(addDays(day, -1)) === 'Yesterday' ? "yesterday's" : "previous day's"} {label.toLowerCase()} ({prev.length} item{prev.length === 1 ? '' : 's'} · {fmtK(sumLogs(prev).kcal)} kcal)</button>
              </div>
            ) : <p className="px-4 pb-3 text-sm text-faint">Nothing logged</p>}
          </section>
        )
      })}

      {/* Energy out */}
      {t && settings && person && (
        <EnergyCard t={t} s={settings} burn={burn.get(day)} kgText={`${fmtW(person.kg, unit)} ${unit}`} ageKnown={!!person.ageKnown} />
      )}

      {undo && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-40 mx-auto flex max-w-lg px-safe">
          <div className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-2 pl-4 shadow-2xl">
            <span className="min-w-0 flex-1 truncate text-sm">Deleted <span className="font-bold">{undo.name}</span></span>
            <button onClick={() => undoDelete(undo)} className="h-9 shrink-0 rounded-xl px-3 text-sm font-bold text-accent">Undo</button>
          </div>
        </div>
      )}
      {adding && <AddFood day={day} meal={adding.meal} tab={adding.tab} onClose={() => setAdding(null)} onAdded={onAdded} />}
      {editing && <LogEditor log={editing} onClose={() => setEditing(null)} onChanged={reload} />}
      {weighing && <WeighInSheet day={day} unit={unit} lastKg={weight?.weighIns[weight.weighIns.length - 1]?.kg ?? user.bodyweight_kg} onClose={() => setWeighing(false)} />}
    </Screen>
  )
}

function Row({ label, value, muted }: { label: ReactNode; value: string; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${muted ? 'text-muted' : ''}`}>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className={`num font-black ${muted ? 'text-sm' : 'text-lg'}`}>{value}</dd>
    </div>
  )
}

/** "Just track" mode: what you ate, with no targets. */
function TrackSummary({ eaten, burned }: { eaten: Macros; burned: number }) {
  const kcalFromMacros = eaten.p * 4 + eaten.c * 4 + eaten.f * 9
  return (
    <Card>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Eaten</p>
          <p className="num text-5xl font-black leading-tight">{fmtK(eaten.kcal)}<span className="ml-1 text-base font-bold text-muted">kcal</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Est. burn</p>
          <p className="num text-lg font-black text-muted">≈ {fmtK(burned)}</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        {(['p', 'c', 'f'] as const).map((k) => (
          <div key={k}>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted"><span className="size-2 rounded-full" style={{ background: MACRO_COLORS[k] }} />{MACRO_NAMES[k]}</p>
            <p className="num text-lg font-black">{Math.round(eaten[k])}g</p>
            <p className="num text-xs text-muted">{kcalFromMacros > 0 ? Math.round(((eaten[k] * (k === 'f' ? 9 : 4)) / kcalFromMacros) * 100) : 0}% of calories</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

/** Where the target comes from: expenditure, goal, and each workout's estimated burn (pulled from your logged workouts). */
function EnergyCard({ t, s, burn, kgText, ageKnown }: { t: Targets; s: Settings; burn?: DayBurn; kgText: string; ageKnown: boolean }) {
  const act = ACTIVITY.find((a) => a.v === s.activity)
  const tracking = s.goal === 'track'
  const line = (label: ReactNode, value: string, strong?: boolean) => (
    <div className={`flex items-baseline justify-between gap-3 py-1 ${strong ? 'font-bold' : 'text-muted'}`}>
      <span className="min-w-0 text-sm">{label}</span><span className={`num shrink-0 ${strong ? 'text-ink' : ''}`}>{value}</span>
    </div>
  )
  return (
    <Card className="space-y-2">
      <h2 className="flex items-center gap-2 font-extrabold"><FlameIcon width={18} height={18} className="text-accent" />{tracking ? 'Energy out (estimate)' : 'Energy & target'}</h2>
      <div className="divide-y divide-line">
        <div className="pb-1">
          {line(<>Resting burn (BMR){!ageKnown && <span className="text-faint"> · age assumed 30</span>}</>, fmtK(t.bmr))}
          {line(`× ${s.activity} ${act ? act.label.toLowerCase() : 'activity'}${s.tdeeAdjust ? `, ${s.tdeeAdjust > 0 ? '+' : ''}${s.tdeeAdjust} pace fix` : ''}`, fmtK(t.baseline))}
          {!tracking && (s.kcalOverride > 0
            ? line('Your fixed calorie target', fmtK(s.kcalOverride))
            : line(s.goal === 'maintain' ? 'Maintain' : `${s.goal === 'cut' ? 'Cut' : 'Bulk'} ${s.rate}% bodyweight/week (${kgText})`, `${t.goalDelta >= 0 ? '+' : '−'}${fmtK(Math.abs(t.goalDelta))}`))}
          {!tracking && t.floorHit && <p className="pb-1 text-xs text-amber-500">Raised to your minimum ({fmtK(t.base)}). Pick a gentler rate to go lower safely.</p>}
          {!tracking && line('Goal calories', fmtK(t.base), true)}
        </div>
        <div className="py-1">
          {burn?.items.length ? burn.items.map((b, i) => (
            <Link key={i} to={`/w/${b.workout}`} className="flex items-baseline justify-between gap-3 py-1 text-muted">
              <span className="min-w-0 truncate text-sm"><span className="font-semibold text-ink">{b.label}</span> · {b.minutes} min · {b.how}</span>
              <span className="num shrink-0">{fmtK(b.kcal)}</span>
            </Link>
          )) : <p className="py-1 text-sm text-faint">No workouts this day. Lifting and cardio from your workouts show up here automatically.</p>}
          {tracking
            ? line('Estimated burn today', `≈ ${fmtK(t.baseline + t.exerciseBurn)}`, true)
            : s.eatBack > 0
              ? line(`Exercise burn ${fmtK(t.exerciseBurn)}${s.eatBack < 1 ? ` × ${Math.round(s.eatBack * 100)}%` : ''} added`, `+${fmtK(t.exercise)}`, true)
              : line('Exercise burn (not added to target)', fmtK(t.exerciseBurn), true)}
        </div>
        {!tracking && <div className="pt-1">{line('Today\'s target', `${fmtK(t.kcal)} kcal`, true)}</div>}
      </div>
      <p className="text-xs text-faint">Burn estimates use each workout's time, distance, heart rate and effort, counting only what's above resting burn.{!tracking && s.eatBack === 0 ? ' Turn on "add back" in Goals to eat some of it back.' : ''}</p>
      <Link to="/nutrition/goals" className="mt-1 flex h-9 items-center justify-center rounded-2xl bg-surface-2 text-sm font-bold">{tracking ? 'Goals & expenditure' : 'Adjust goals & expenditure'}</Link>
    </Card>
  )
}
