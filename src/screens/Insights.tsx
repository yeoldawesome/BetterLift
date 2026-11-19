import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { MultiChart, type Series } from '../components/MultiChart'
import { Spinner } from '../components/ui'
import { loadBody, type BodyMetric } from '../lib/body'
import { label } from '../lib/exercises'
import { fromUnit, toUnit } from '../lib/format'
import {
  DAY, LEVELS, LIFT_NAMES, bodyFatBand, bodyStrength, describeR, dots, etaFor, ffmi, ffmiBand, fitAt, improvement, liftSeries,
  predict, standings, weeklyVolume, workoutsPerWeek, type BodyCorrKey, type Prediction,
} from '../lib/insights'
import { useUnit, type Unit, type User } from '../lib/pb'
import { cachedStats, loadStatsRows, type StatRow } from '../lib/statsData'

const n0 = (n: number) => Math.round(n).toLocaleString()
const r1 = (n: number) => Math.round(n * 10) / 10
const mon = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })
const sign = (n: number) => (n > 0 ? '+' : '')

function Card({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-line bg-surface p-4">
      <div>
        <h2 className="font-extrabold">{title}</h2>
        {sub && <p className="text-xs text-muted">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function Callout({ icon, value, text }: { icon: string; value: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 p-3">
      <span className="text-xl">{icon}</span>
      <div className="min-w-0">
        <p className="num font-black leading-snug">{value}</p>
        <p className="text-xs text-muted">{text}</p>
      </div>
    </div>
  )
}

/** Small centred number tile for rows of three. */
function Tile({ value, text }: { value: string; text: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-2.5 text-center">
      <p className="num truncate text-lg font-black">{value}</p>
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted">{text}</p>
    </div>
  )
}

/** "in 6 wks · ~Jan 9" style label for a predicted date. */
function eta(e: number | 'now' | null, progressing: boolean) {
  if (e === 'now') return { main: 'Due now', sub: 'your trend is already past it' }
  if (e === null) return { main: progressing ? '2+ years' : 'Not at this pace', sub: progressing ? 'at the current rate' : 'trend is flat or down' }
  const wks = Math.max(1, Math.round((e - Date.now()) / (7 * DAY)))
  return { main: `~${new Date(e).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(new Date(e).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })}`, sub: wks < 9 ? `in ${wks} week${wks === 1 ? '' : 's'}` : `in ~${Math.round(wks / 4.35)} months` }
}

// Custom 1RM goals are a per-device convenience, stored in kg so a unit switch keeps them right.
const goalKey = (uid: string) => `bl.goals.${uid}`
function readGoals(uid: string): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(goalKey(uid)) || '{}') } catch { return {} }
}

function PredictionRow({ p, unit, goalKg, onGoal }: { p: Prediction; unit: Unit; goalKg?: number; onGoal: (kg: number | null) => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const goal = goalKg ? r1(toUnit(goalKg, unit)) : 0
  const goalEta = goal ? (goal <= p.s.best ? 'done' : etaFor(p.fit, goal)) : null
  const prog = p.status === 'progressing'
  const rows: [string, string, { main: string; sub: string }][] = [
    ['Next PR', `${p.nextPr} ${unit}`, eta(p.nextPrEta, prog)],
    ['Milestone', `${p.milestone} ${unit}`, eta(p.milestoneEta, prog)],
  ]
  if (goal) rows.push(['Your goal', `${goal} ${unit}`, goalEta === 'done' ? { main: 'Reached!', sub: 'set a new one' } : eta(goalEta as number | 'now' | null, prog)])

  const chart = useMemo(() => {
    if (!open) return null
    const win = p.s.pts.filter((x) => x.t >= p.fit.from)
    const target = goal > p.s.best ? goal : p.milestone
    const tEta = etaFor(p.fit, target)
    const end = Math.min(typeof tEta === 'number' ? tEta + 14 * DAY : Date.now() + 120 * DAY, Date.now() + 365 * DAY)
    const future: number[] = []
    for (let t = Date.now() + 14 * DAY; t <= end; t += Math.max(14 * DAY, (end - Date.now()) / 8)) future.push(t)
    const ts = [...win.map((x) => x.t), ...future]
    const series: Series[] = [
      { label: 'Est. 1RM', data: [...win.map((x) => r1(x.v)), ...future.map(() => null)], fill: true, suffix: ` ${unit}` },
      { label: 'Trend', data: ts.map((t) => r1(fitAt(p.fit, t))), color: 'muted', dashed: true, suffix: ` ${unit}` },
      { label: goal > p.s.best ? 'Goal' : 'Milestone', data: ts.map(() => target), color: 'ink', dashed: true, suffix: ` ${unit}` },
    ]
    return { labels: ts.map(mon), series }
  }, [open, p, goal, unit])

  const save = () => { const v = parseFloat(draft); if (v > 0) { onGoal(fromUnit(v, unit)); setDraft('') } }
  return (
    <div className="rounded-xl bg-surface-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start justify-between gap-2 p-3 text-left">
        <div className="min-w-0">
          <p className="truncate font-extrabold">{p.s.name}</p>
          <p className="text-xs text-muted">Est. 1RM <span className="num font-bold text-ink">{n0(p.s.best)} {unit}</span> · last PR {p.weeksSincePr ? `${p.weeksSincePr} wk${p.weeksSincePr === 1 ? '' : 's'} ago` : 'this week'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${prog ? 'bg-accent/15 text-accent' : p.status === 'declining' ? 'bg-danger/15 text-danger' : 'bg-canvas/60 text-muted'}`}>
          {prog || p.status === 'declining' ? `${sign(p.perMonth)}${r1(p.perMonth)} ${unit}/mo` : 'Plateau'}
        </span>
      </button>
      <div className={`grid gap-1 px-3 pb-3 ${rows.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {rows.map(([l, target, e]) => (
          <div key={l} className="min-w-0 rounded-lg bg-surface p-2">
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{l} · {target}</p>
            <p className="num truncate text-sm font-black">{e.main}</p>
            <p className="truncate text-[10px] text-faint">{e.sub}</p>
          </div>
        ))}
      </div>
      {open && chart && (
        <div className="space-y-2 border-t border-line px-3 pb-3 pt-2">
          <MultiChart className="h-48" labels={chart.labels} series={chart.series} legend />
          <div className="flex items-center gap-2">
            <input inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={`1RM goal (${unit})`} className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm" />
            <button onClick={save} className="h-9 rounded-lg bg-accent px-3 text-sm font-bold text-accent-ink">Set goal</button>
            {goal > 0 && <button onClick={() => onGoal(null)} className="h-9 rounded-lg bg-surface px-3 text-sm font-bold text-muted">Clear</button>}
          </div>
          <p className="text-[11px] text-faint">
            Straight-line trend of your last {p.fit.n} sessions ({p.confidence} confidence{p.confidence === 'low' ? ' — sessions are noisy' : ''}). Progress usually slows over time, so far-off dates are optimistic.
          </p>
        </div>
      )}
    </div>
  )
}

/** Lifting insights for yourself: predictions, when you improved most, body ↔ strength, and how you compare. */
export function InsightsView({ user }: { user: User }) {
  const unit = useUnit()
  const [rows, setRows] = useState<StatRow[] | null>(() => cachedStats(user.id))
  const [body, setBody] = useState<BodyMetric[] | null>(null)
  const [goals, setGoals] = useState<Record<string, number>>(() => readGoals(user.id))
  const [showAll, setShowAll] = useState(false)
  const [metric, setMetric] = useState<BodyCorrKey>('weight_kg')

  useEffect(() => {
    loadStatsRows(user.id).then(setRows).catch(() => setRows((r) => r ?? []))
    loadBody().then(setBody).catch(() => setBody([]))
  }, [user.id])

  const setGoal = (name: string, kg: number | null) => setGoals((g) => {
    const next = { ...g }
    if (kg === null) delete next[name]; else next[name] = kg
    try { localStorage.setItem(goalKey(user.id), JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })

  const data = useMemo(() => {
    if (!rows || !body) return null
    const series = liftSeries(rows, unit)
    const preds = series.map((s) => predict(s, unit)).filter((p): p is Prediction => !!p)
      .sort((a, b) => (goals[b.s.name] ? 1 : 0) - (goals[a.s.name] ? 1 : 0) || b.fit.n - a.fit.n)
    const lastBody = body[body.length - 1]
    const bwKg = lastBody?.weight_kg || user.bodyweight_kg
    const sex: 'male' | 'female' = user.sex === 'female' ? 'female' : 'male'
    return {
      series, preds, sex, bwKg, lastBody,
      imp: improvement(series),
      bs: bodyStrength(series, body, unit),
      stand: standings(series, toUnit(bwKg, unit), sex),
      vol: weeklyVolume(rows),
      freq: workoutsPerWeek(rows, 8),
    }
  }, [rows, body, unit, user.bodyweight_kg, user.sex, goals])

  if (!data) return <Spinner />
  if (!data.series.length) return <p className="py-10 text-center text-sm text-muted">Log some weighted sets to unlock insights.</p>
  const { preds, imp, bs, stand, vol, freq, sex, bwKg, lastBody } = data

  return (
    <div className="space-y-3 pb-6">
      <header>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Insights</h1>
        <p className="text-sm text-muted">What your training data says, and where it's heading</p>
      </header>

      <Card title="🔮 PR predictions" sub="Based on your est. 1RM trend over the last few months. Tap a lift to see the projection and set a goal.">
        {preds.length ? (
          <>
            {(showAll ? preds : preds.slice(0, 5)).map((p) => (
              <PredictionRow key={p.s.name} p={p} unit={unit} goalKg={goals[p.s.name]} onGoal={(kg) => setGoal(p.s.name, kg)} />
            ))}
            {preds.length > 5 && (
              <button onClick={() => setShowAll((s) => !s)} className="w-full rounded-xl bg-surface-2 py-2 text-sm font-bold text-muted">
                {showAll ? 'Show fewer' : `Show all ${preds.length} lifts`}
              </button>
            )}
          </>
        ) : <p className="text-sm text-muted">Predictions need at least 4 sessions of a weighted lift, with one in the last 2 months.</p>}
      </Card>

      <ImprovementCard imp={imp} unit={unit} />

      <BodyCard bs={bs} unit={unit} metric={metric} setMetric={setMetric} stand={stand} bwKg={bwKg} sex={sex} />

      <Card title="📊 How you compare" sub={`Approximate standards for ${sex === 'female' ? 'women' : 'men'} at your bodyweight (${n0(toUnit(bwKg, unit))} ${unit})${user.sex ? '' : ' — set your sex in your profile for accurate standards'}.`}>
        {!bwKg ? <p className="text-sm text-muted">Add your bodyweight in your profile (or import scale data) to compare your lifts.</p>
          : stand.length ? stand.map((s) => <StandingRow key={s.lift} s={s} unit={unit} />)
            : <p className="text-sm text-muted">Log a squat, bench, deadlift, overhead press or barbell row to see where you stand.</p>}

        <div className="grid gap-2 sm:grid-cols-2">
          <Callout icon="📅" value={`${freq} / week`} text={`Workouts, last 8 weeks. Most lifters who progress well train 3–4×. ${freq < 2.5 ? 'More frequent sessions could speed things up.' : freq > 5.5 ? "That's a lot — make sure you recover." : "You're right in that range."}`} />
          {lastBody?.body_fat_pct ? (() => { const b = bodyFatBand(lastBody.body_fat_pct, sex); return <Callout icon="🧬" value={`${r1(lastBody.body_fat_pct)}% · ${b.name}`} text={`Body fat. Typical ${sex === 'female' ? 'women: 25–31%' : 'men: 18–24%'}.`} /> })() : null}
          {(() => {
            const ffm = lastBody?.fat_free_kg || (lastBody?.body_fat_pct ? lastBody.weight_kg * (1 - lastBody.body_fat_pct / 100) : 0)
            const v = ffmi(ffm, user.height_cm)
            return v ? <Callout icon="💪" value={`${v} FFMI · ${ffmiBand(v, sex)}`} text={`Muscle for your height. Untrained average ≈ ${sex === 'female' ? 15 : 19}; ${sex === 'female' ? '21' : '25'}+ is rare without drugs.`} /> : null
          })()}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Weekly sets per muscle (last 4 weeks)</p>
          {vol.map((v) => {
            const pct = Math.min(100, (v.perWeek / 25) * 100)
            const tone = v.perWeek < 10 ? 'bg-faint' : v.perWeek > 20 ? 'bg-danger' : 'bg-accent'
            return (
              <div key={v.muscle} className="flex items-center gap-2 text-xs">
                <span className="w-20 shrink-0 truncate font-semibold">{label(v.muscle)}</span>
                <div className="relative h-2.5 flex-1 rounded-full bg-surface-2">
                  {/* Recommended 10–20 sets/week band */}
                  <div className="absolute inset-y-0 rounded-full bg-accent/15" style={{ left: '40%', width: '40%' }} />
                  <div className={`absolute inset-y-0 left-0 rounded-full ${tone}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="num w-8 shrink-0 text-right font-bold">{v.perWeek}</span>
              </div>
            )
          })}
          <p className="text-[11px] text-faint">Shaded band = the 10–20 sets/week most research suggests for growth. Secondary muscles count as half a set.</p>
        </div>
      </Card>
      <p className="text-center text-[11px] text-faint">Estimates, not guarantees. Standards and averages are rough population figures.</p>
    </div>
  )
}

function ImprovementCard({ imp, unit }: { imp: ReturnType<typeof improvement>; unit: Unit }) {
  const months = useMemo(() => imp.months.slice(-24), [imp])
  const hi = imp.bestMonth ? months.findIndex((m) => m.key === imp.bestMonth!.key) : -1
  const labels = useMemo(() => months.map((m) => m.label), [months])
  const series = useMemo<Series[]>(() => [{ label: 'Strength gained', data: months.map((m) => m.gainPct), bar: true, suffix: '%' }], [months])
  return (
    <Card title="📈 When you improved most" sub="Average % your est. 1RM went up (from PRs) for each lift you trained that month.">
      <MultiChart className="h-44" labels={labels} series={series} highlight={hi >= 0 ? hi : undefined} />
      <div className="grid gap-2 sm:grid-cols-2">
        {imp.bestMonth && imp.bestMonth.gainPct > 0 && (
          <Callout icon="🏆" value={new Date(imp.bestMonth.t).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            text={`Best month: ${imp.bestMonth.prs} PRs on ${imp.bestMonth.names.size} lift${imp.bestMonth.names.size === 1 ? '' : 's'}, +${imp.bestMonth.gainPct}% per lift on average`} />
        )}
        {imp.bestStretch && (
          <Callout icon="🚀" value={`${imp.bestStretch.from.label} – ${imp.bestStretch.to.label}`} text={`Best 3-month run: +${imp.bestStretch.gainPct}% per lift`} />
        )}
        {imp.earlyPace !== null && imp.recentPace !== null && (
          <Callout icon="⏳" value={`${imp.earlyPace}% → ${imp.recentPace}% / mo`}
            text={imp.recentPace < imp.earlyPace * 0.5 ? 'First 6 months vs. now. Slowing down is normal as you get stronger.' : 'First 6 months vs. now. You are keeping your pace up!'} />
        )}
        {imp.byMuscle[0] && <Callout icon="🎯" value={label(imp.byMuscle[0].muscle)} text={`Your fastest-progressing muscle group (+${imp.byMuscle[0].gainPct}% per lift, all time)`} />}
      </div>
      {imp.recent.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-wider text-muted">Last 90 days vs. your best before</p>
          {[...imp.recent.slice(0, 3), ...imp.recent.slice(3).filter((r) => r.pct < 0).slice(-2)].map((r) => (
            <div key={r.name} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">{r.name}</span>
              <span className={`num shrink-0 font-bold ${r.pct > 0 ? 'text-accent' : r.pct < 0 ? 'text-danger' : 'text-muted'}`}>
                {sign(r.pct)}{r.pct}% <span className="text-xs font-semibold text-muted">({n0(r.from)} → {n0(r.to)} {unit})</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {imp.stalled.length > 0 && (
        <p className="rounded-xl bg-surface-2 p-3 text-xs text-muted">
          <span className="font-bold text-ink">Stuck: </span>
          {imp.stalled.slice(0, 3).map((s) => `${s.name} (no PR in ${s.weeks} wks)`).join(', ')}. Try changing rep ranges, adding a deload, or swapping a variation.
        </p>
      )}
    </Card>
  )
}

function BodyCard({ bs, unit, metric, setMetric, stand, bwKg, sex }: {
  bs: ReturnType<typeof bodyStrength>; unit: Unit; metric: BodyCorrKey; setMetric: (k: BodyCorrKey) => void
  stand: ReturnType<typeof standings>; bwKg: number; sex: 'male' | 'female'
}) {
  const corr = bs.corr.find((c) => c.k === metric) ?? bs.corr[0]
  const k = corr?.k
  const weeks = useMemo(() => {
    const firstBody = bs.weeks.findIndex((w) => Object.keys(w.body).length)
    return firstBody < 0 ? [] : bs.weeks.slice(Math.max(0, firstBody - 4))
  }, [bs])
  const labels = useMemo(() => weeks.map((w) => new Date(w.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })), [weeks])
  const series = useMemo<Series[]>(() => !k ? [] : [
    { label: 'Strength index', data: weeks.map((w) => w.strength), fill: true, suffix: '%' },
    { label: corr.label, data: weeks.map((w) => w.body[k] ?? null), color: 'ink', right: true, suffix: corr.mass ? ` ${unit}` : '%' },
  ], [weeks, k, corr, unit])

  // Powerlifting total from the big three, scaled for bodyweight.
  const big3 = (['squat', 'bench', 'deadlift'] as const).map((l) => stand.find((s) => s.lift === l))
  const total = big3.every(Boolean) ? big3.reduce((t, s) => t + s!.e1rm, 0) : 0

  return (
    <Card title="⚖️ Body & strength" sub="How your physique has moved alongside your lifts. Strength index = your lifts' recent est. 1RMs as a % of their all-time bests.">
      {!bs.corr.length ? (
        <p className="text-sm text-muted">Import smart-scale data on the Physique tab (6+ weeks overlapping your training) to see how your body and strength relate.</p>
      ) : (
        <>
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none]">
            {bs.corr.map((c) => (
              <button key={c.k} onClick={() => setMetric(c.k)} className={`h-8 shrink-0 rounded-lg px-3 text-xs font-bold ${c.k === k ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{c.label}</button>
            ))}
          </div>
          <MultiChart className="h-52" labels={labels} series={series} legend />
          {corr && (
            <div className="rounded-xl bg-surface-2 p-3">
              <p className="font-extrabold">{describeR(corr.r)} <span className="num text-xs font-bold text-muted">r = {corr.r}</span></p>
              <p className="text-xs text-muted">
                {Math.abs(corr.r) < 0.2
                  ? `Your ${corr.label.toLowerCase()} and strength haven't moved together much over ${corr.n} weeks.`
                  : `Over ${corr.n} weeks, when your ${corr.label.toLowerCase()} was ${corr.r > 0 ? 'higher' : 'lower'} you tended to be stronger — about ${r1(Math.abs(corr.slope * (corr.mass ? (unit === 'lb' ? 5 : 2) : 1)))}% strength per ${corr.mass ? (unit === 'lb' ? `5 ${unit}` : `2 ${unit}`) : '1 point'}.`}
                {' '}This shows things moving together, not proof one causes the other.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {bs.corr.filter((c) => c.k !== k).map((c) => (
              <button key={c.k} onClick={() => setMetric(c.k)} className="rounded-xl bg-surface-2 p-2.5 text-left">
                <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{c.label}</p>
                <p className="num text-sm font-black">{c.r > 0 ? '+' : ''}{c.r}</p>
                <p className="truncate text-[10px] text-faint">{describeR(c.r)}</p>
              </button>
            ))}
          </div>
        </>
      )}
      {total > 0 && bwKg > 0 && (
        <div className="grid grid-cols-3 gap-2">
          <Tile value={`${n0(total)}`} text={`Big 3 total (${unit})`} />
          <Tile value={`${r1(total / toUnit(bwKg, unit))}×`} text="Total vs bodyweight" />
          <Tile value={n0(dots(fromUnit(total, unit), bwKg, sex))} text="DOTS · 300+ strong" />
        </div>
      )}
    </Card>
  )
}

function StandingRow({ s, unit }: { s: ReturnType<typeof standings>[number]; unit: Unit }) {
  const max = s.thresholds[4] * 1.15
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`
  const p = useMemo(() => s.next ? predict(s.series, unit) : null, [s, unit])
  const nextEta = p && s.next ? etaFor(p.fit, s.next) : null
  return (
    <div className="space-y-1.5 rounded-xl bg-surface-2 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate font-extrabold">{LIFT_NAMES[s.lift]} <span className="text-xs font-semibold text-muted">· {s.exercise}</span></p>
        <p className="num shrink-0 text-sm font-black">{n0(s.e1rm)} {unit} <span className="text-xs font-semibold text-muted">({s.ratio}× BW)</span></p>
      </div>
      <div className="relative h-3 rounded-full bg-surface">
        {s.thresholds.map((t, i) => <div key={i} className="absolute inset-y-0 w-px bg-line" style={{ left: pos(t) }} />)}
        <div className="absolute inset-y-0 left-0 rounded-full bg-accent/70" style={{ width: pos(s.e1rm) }} />
      </div>
      <div className="flex justify-between text-[10px] font-semibold text-faint">
        {LEVELS.map((l) => <span key={l}>{l}</span>)}
      </div>
      <p className="text-xs text-muted">
        <span className="font-bold text-ink">{s.level < 0 ? 'Below beginner' : LEVELS[s.level]}</span> · stronger than ~{s.percentile}% of regular lifters
        {s.next && <> · {LEVELS[s.level + 1]} at {n0(s.next)} {unit}{nextEta === 'now' ? ' (due now)' : typeof nextEta === 'number' ? ` (est. ${new Date(nextEta).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })})` : ''}</>}
      </p>
    </div>
  )
}
