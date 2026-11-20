import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HeightInput } from '../components/HeightInput'
import { fmtK, MACRO_COLORS } from '../components/nutrition/bits'
import { WeighInSheet } from '../components/nutrition/Weight'
import { Button, Card, ErrorText, Input, Screen, Segmented, Spinner, Toggle } from '../components/ui'
import { loadBurn, type BurnItem } from '../lib/energy'
import { fmtW, fromUnit, KG_LB, num } from '../lib/format'
import {
  ACTIVITY, addDays, ageOf, computeTargets, dayLabel, fmtEta, goalProgress, GOALS, KCAL_PER_KG, paceCheck, parseDay, personFor, PROTEIN, proteinDefault, RATES, saveSettings, today, useNutrition,
  weeklyChangeKg, type Goal, type Settings,
} from '../lib/nutrition'
import { errMsg, pb, useUser } from '../lib/pb'

const H = ({ children }: { children: string }) => <h2 className="pt-3 text-sm font-bold uppercase tracking-wider text-muted">{children}</h2>
type Draft = Settings & { cm: number; sex: '' | 'male' | 'female' }

/** Goals: edit a draft, then confirm at the bottom. Nothing is saved until you do. */
export default function NutritionGoals() {
  const user = useUser()!
  const unit = user.unit || 'lb'
  const nav = useNavigate()
  const { settings: s, weight } = useNutrition(user)
  const [d, setD] = useState<Draft | null>(null)
  const [age, setAge] = useState('')
  const [override, setOverride] = useState('')
  const [goalTxt, setGoalTxt] = useState('')
  const [avgBurn, setAvgBurn] = useState<number | null>(null)
  const [lifts, setLifts] = useState<BurnItem[] | null>(null)
  const [weighing, setWeighing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!s || d) return
    setD({ ...s, cm: user.height_cm, sex: user.sex })
    setAge(ageOf(s) ? `${ageOf(s)}` : '')
    setOverride(s.kcalOverride ? `${s.kcalOverride}` : '')
    setGoalTxt(s.goalKg ? fmtW(s.goalKg, unit) : '')
  }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  const person = d ? personFor({ bodyweight_kg: user.bodyweight_kg, height_cm: d.cm, sex: d.sex }, d) : null
  // Average exercise burn over the last week, for the expenditure summary.
  useEffect(() => {
    if (!person || !d) return
    let live = true
    // Always load lifting so the list below can show what it would add, even while the toggle is off.
    loadBurn(parseDay(addDays(today(), -6)), parseDay(addDays(today(), 1)), person, true).then((b) => {
      if (!live) return
      const all = [...b.values()].flatMap((x) => x.items)
      setLifts(all.filter((i) => i.kind === 'lifting').reverse())
      setAvgBurn(Math.round(all.filter((i) => d.countLifting || i.kind === 'cardio').reduce((t, i) => t + i.kcal, 0) / 7))
    }).catch(() => {})
    return () => { live = false }
  }, [person?.kg, d?.countLifting]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!s || !d || !person) return <Screen title="Goals" back><ErrorText>{err}</ErrorText><Spinner /></Screen>

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x!, ...patch }))
  const { cm, sex, ...draftSettings } = d
  const dirty = !s.setUp || JSON.stringify(draftSettings) !== JSON.stringify(s) || cm !== user.height_cm || sex !== user.sex
  const ov = parseInt(override) || 0
  const ovBad = ov !== 0 && (ov < 800 || ov > 10000)
  const tracking = d.goal === 'track'
  const t = computeTargets(d, person, 0)
  const tWorkout = computeTargets(d, person, 300) // example training day
  const wk = weeklyChangeKg(d, person.kg)
  const perLb = unit === 'lb'
  const proteinLabel = (gkg: number) => perLb ? `${Math.round((gkg / KG_LB) * 100) / 100} g/lb` : `${gkg} g/kg`
  const setGoal = (g: Goal) => set({ goal: g, rate: g === 'cut' ? 0.5 : g === 'bulk' ? 0.25 : d.rate, proteinPerKg: g === 'track' ? d.proteinPerKg : proteinDefault(g) })
  const pace = paceCheck(s, weight?.weighIns ?? [], person.kg)
  const gp = goalProgress(d, person.kg)

  const confirm = async () => {
    setBusy(true); setErr('')
    try {
      await saveSettings(draftSettings)
      if (cm !== user.height_cm || sex !== user.sex) await pb.collection('users').update(user.id, { height_cm: cm, sex })
      nav('/nutrition')
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <Screen title="Goals" back>
      {/* Plan summary (updates live as you edit) */}
      <Card className="space-y-3 border-accent/40">
        {tracking ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">Just tracking</p>
            <p className="text-sm">No daily targets. Log what you eat and see your calories, macro split, and an estimate of what you burn (about <span className="num font-bold">{fmtK(t.baseline)}</span> kcal on a rest day, plus workouts).</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-muted">Daily target, rest day</p>
              <p className="text-xs font-semibold text-muted">{d.goal === 'maintain' ? 'Maintain' : `${d.goal === 'cut' ? 'Lose' : 'Gain'} ${fmtW(Math.abs(wk), unit)} ${unit}/week`}</p>
            </div>
            <p className="num text-4xl font-black">{fmtK(t.kcal)} <span className="text-base font-bold text-muted">kcal</span></p>
            <div className="grid grid-cols-3 gap-2">
              {(['p', 'c', 'f'] as const).map((k) => (
                <div key={k} className="rounded-xl bg-surface-2 p-2">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted"><span className="size-2 rounded-full" style={{ background: MACRO_COLORS[k] }} />{{ p: 'Protein', c: 'Carbs', f: 'Fat' }[k]}</p>
                  <p className="num text-xl font-black">{t[k]}g</p>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">
              {d.eatBack > 0
                ? `On training days, ${d.eatBack < 1 ? `${Math.round(d.eatBack * 100)}% of ` : ''}the calories you burn are added on top, mostly as carbs: e.g. a 300 kcal session makes it ${fmtK(tWorkout.kcal)} kcal.`
                : 'Your target stays the same on training days (exercise calories aren\'t added back). You can change that below.'}
            </p>
            {t.floorHit && <p className="text-xs font-semibold text-amber-500">Your goal would put you below your minimum ({fmtK(t.base)} kcal), so the target was raised. Choose a gentler pace.</p>}
          </>
        )}
      </Card>

      <H>Goal</H>
      <Segmented value={d.goal} onChange={setGoal} options={GOALS} />
      {(d.goal === 'cut' || d.goal === 'bulk') && (
        <div className="space-y-2">
          {RATES[d.goal].map((r) => {
            const kg = (r.v / 100) * person.kg
            const sel = d.rate === r.v
            const sign = d.goal === 'cut' ? '−' : '+'
            return (
              <button key={r.v} onClick={() => set({ rate: r.v })} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${sel ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{r.label} <span className="text-sm font-semibold text-muted">· {r.v}% / week</span></span>
                  <span className="block text-sm text-muted">{r.hint}</span>
                </span>
                <span className="num shrink-0 text-right">
                  <span className="block font-black">{sign}{fmtW(kg, unit)} {unit}/wk</span>
                  <span className="block text-xs text-muted">{sign}{fmtK((kg * KCAL_PER_KG) / 7)} kcal/day</span>
                </span>
              </button>
            )
          })}
          <Input label={`Goal weight (${unit}, optional)`} inputMode="decimal" value={goalTxt} placeholder={`e.g. ${fmtW(person.kg + (d.goal === 'cut' ? -5 : 5), unit)}`}
            onChange={(e) => {
              const v = e.target.value.replace(/[^\d.,]/g, '').slice(0, 6)
              setGoalTxt(v)
              const kg = fromUnit(num(v), unit)
              if (!v) set({ goalKg: 0 })
              else if (kg >= 25 && kg <= 320) set({ goalKg: Math.round(kg * 100) / 100 })
            }} />
          {gp && (
            <p className={`text-xs ${gp.wrongWay ? 'font-semibold text-amber-500' : 'text-muted'}`}>
              {gp.wrongWay ? `That's ${d.goal === 'cut' ? 'above' : 'below'} your current weight (${fmtW(person.kg, unit)} ${unit}). ${d.goal === 'cut' ? 'Bulk' : 'Cut'} instead?`
                : gp.reached ? `You're already at ${fmtW(gp.goalKg, unit)} ${unit}.`
                : `${fmtW(gp.leftKg, unit)} ${unit} to ${d.goal === 'cut' ? 'lose' : 'gain'}: about ${gp.weeks} week${gp.weeks === 1 ? '' : 's'} at this pace, around ${fmtEta(gp.eta)}.`}
            </p>
          )}
        </div>
      )}
      {!tracking && (
        <p className="text-xs text-muted">
          Each week, your weigh-ins are compared with this pace. If you're gaining or losing too slowly or too quickly, you'll get a suggestion to adjust your calories on the Nutrition page.
          {pace.status === 'on-track' ? ' Right now you\'re on pace.' : pace.status === 'waiting' ? ` ${pace.reason}` : ''}
        </p>
      )}

      <H>You</H>
      <HeightInput key={unit} cm={d.cm} unit={unit} onChange={(v) => v >= 120 && set({ cm: v })} />
      <div className="grid grid-cols-2 gap-2">
        <Input label="Age" inputMode="numeric" value={age} placeholder="e.g. 30" onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 3)
          setAge(v)
          const a = parseInt(v)
          if (a >= 13 && a <= 100) set({ birthYear: new Date().getFullYear() - a })
        }} />
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Sex</span>
          <Segmented value={d.sex || ('' as 'male')} onChange={(v) => set({ sex: v })} options={[['male', 'Male'], ['female', 'Female']]} />
        </div>
      </div>
      <Card className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="num font-black">{fmtW(person.kg, unit)} {unit}</p>
          <p className="text-xs text-muted">{weight?.from === 'scale' ? 'Average of your weigh-ins from the last week.' : 'From your profile. Log weigh-ins to keep this current.'}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => setWeighing(true)}>Log weight</Button>
      </Card>

      <H>Daily activity (outside workouts)</H>
      <div className="space-y-2">
        {ACTIVITY.map((a) => (
          <button key={a.v} onClick={() => set({ activity: a.v })} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${d.activity === a.v ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
            <span className="min-w-0 flex-1"><span className="block font-bold">{a.label}</span><span className="block text-sm text-muted">{a.hint}</span></span>
            <span className="num shrink-0 text-sm font-bold text-muted">×{a.v}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">Don't count your workouts here. Lifting and cardio from your logged workouts are estimated on the day you do them.</p>

      <H>Expenditure</H>
      <Card className="space-y-1.5 text-sm">
        <Line label={`Resting burn (BMR)${person.ageKnown ? '' : ' · age assumed 30'}`} value={fmtK(t.bmr)} />
        <Line label={`× ${d.activity} daily activity`} value={fmtK(Math.round(t.bmr * d.activity))} />
        {d.tdeeAdjust !== 0 && (
          <div className="flex items-baseline justify-between gap-3 text-muted">
            <span>Pace corrections <button onClick={() => set({ tdeeAdjust: 0 })} className="ml-1 font-semibold text-accent">Reset</button></span>
            <span className="num">{d.tdeeAdjust > 0 ? '+' : '−'}{fmtK(Math.abs(d.tdeeAdjust))}</span>
          </div>
        )}
        <Line label="Baseline (rest day)" value={fmtK(t.baseline)} strong />
        {avgBurn !== null && <Line label="+ workouts, average of last 7 days" value={`+${fmtK(avgBurn)}`} />}
        {avgBurn !== null && <Line label="Average daily expenditure" value={`≈ ${fmtK(t.baseline + avgBurn)}`} strong />}
        <p className="pt-1 text-xs text-faint">BMR uses the Mifflin-St Jeor equation from your height, weight, age and sex.</p>
      </Card>
      <Toggle on={d.countLifting} onChange={(countLifting) => set({ countLifting })} title="Count lifting sessions"
        body="Each workout's lifting is estimated from how long it took (minus any cardio in it) and how many sets you did: more sets in less time means less rest and a higher burn." />
      <Card className="space-y-1 p-3">
        <p className="text-xs font-bold uppercase tracking-wider text-muted">Your lifting, last 7 days</p>
        {!lifts ? <Spinner /> : lifts.length ? lifts.map((l) => (
          <div key={l.workout} className={`flex items-baseline justify-between gap-3 text-sm ${d.countLifting ? '' : 'opacity-50'}`}>
            <span className="min-w-0 truncate"><span className="font-semibold">{dayLabel(l.day)}</span> <span className="text-muted">· {l.label} · {l.minutes} min · {l.how}</span></span>
            <span className="num shrink-0 font-bold">{fmtK(l.kcal)}</span>
          </div>
        )) : <p className="text-sm text-muted">No lifting workouts in the last 7 days.</p>}
        {lifts && lifts.length > 0 && !d.countLifting && <p className="pt-1 text-xs text-muted">Not counted while this is off.</p>}
      </Card>

      {!tracking && (
        <>
          <H>Macros</H>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Protein · {Math.round(d.proteinPerKg * person.kg)} g/day</span>
            <div className="grid grid-cols-5 gap-1 rounded-xl bg-surface-2 p-1">
              {PROTEIN.map((g) => (
                <button key={g} onClick={() => set({ proteinPerKg: g })} className={`num h-9 rounded-lg text-xs font-bold ${d.proteinPerKg === g ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{proteinLabel(g)}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-muted">{proteinLabel(1.6)} covers muscle growth for most lifters; higher helps hold on to muscle while cutting.</p>
          </div>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Fat · {t.f} g/day</span>
            <Segmented value={`${d.fatPct}`} onChange={(v) => set({ fatPct: parseFloat(v) })} options={[['0.2', '20%'], ['0.27', '27%'], ['0.35', '35%']]} />
            <p className="mt-1 text-xs text-muted">Share of calories from fat (never below {Math.round(0.6 * person.kg)} g). Carbs fill the rest.</p>
          </div>

          <H>Exercise calories</H>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Add back to your target</span>
            <Segmented value={`${d.eatBack}`} onChange={(v) => set({ eatBack: parseFloat(v) })} options={[['0', 'None'], ['0.5', '50%'], ['0.75', '75%'], ['1', 'All']]} />
            <p className="mt-1 text-xs text-muted">None keeps the same target every day; your workouts still count toward the weekly pace check. Burn estimates can run high, so if you add them back, 50–75% is safer.</p>
          </div>

          <H>Fixed calories (optional)</H>
          <Input inputMode="numeric" placeholder={`Auto: ${fmtK(computeTargets({ ...d, kcalOverride: 0 }, person, 0).base)} kcal`} value={override}
            onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 5); setOverride(v); const n = parseInt(v) || 0; if (n === 0 || (n >= 800 && n <= 10000)) set({ kcalOverride: n }) }} />
          {ovBad ? <p className="text-xs font-semibold text-danger">Fixed calories must be between 800 and 10,000.</p>
            : <p className="text-xs text-muted">Replaces expenditure ± goal with a number you choose (e.g. from a coach). Leave blank for automatic.</p>}
        </>
      )}

      {/* Confirm: sticks just above the tab bar while there are unsaved changes, and sits at the end of the page otherwise.
          (Sticky offsets are measured inside <main>'s 10rem bottom padding, hence the subtraction.) */}
      <div className={`${dirty ? 'sticky bottom-[calc(env(safe-area-inset-bottom)-5.25rem)]' : ''} z-10 space-y-2 pt-3`}>
        <ErrorText>{err}</ErrorText>
        <Button className="shadow-lg shadow-black/40" disabled={busy || !dirty || ovBad} onClick={confirm}>
          {busy ? 'Saving…' : dirty ? (s.setUp ? 'Save goals' : 'Confirm goals') : 'Goals saved'}
        </Button>
      </div>
      {weighing && <WeighInSheet day={today()} unit={unit} lastKg={person.kg} onClose={() => setWeighing(false)} />}
    </Screen>
  )
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-bold' : 'text-muted'}`}><span>{label}</span><span className={`num shrink-0 ${strong ? 'text-ink' : ''}`}>{value}</span></div>
}
