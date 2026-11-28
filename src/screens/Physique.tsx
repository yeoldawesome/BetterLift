import { useMemo, useRef, useState } from 'react'
import { LineChart } from '../components/LineChart'
import { useNavigate } from 'react-router-dom'
import { BottomSheet, Button, ErrorText, Spinner } from '../components/ui'
import { ask } from '../components/Dialog'
import { ScaleIcon } from '../components/icons'
import { BODY_FIELDS, importBody, loadBody, parseBodyCsv, useBody, workoutOf, type BodyKey, type BodyMetric } from '../lib/body'
import { fromUnit, num, toUnit } from '../lib/format'
import { loadWeight } from '../lib/nutrition'
import { errMsg, me, pb, useUnit, type Unit, type User } from '../lib/pb'
import { trendLine } from '../lib/stats'

const RANGES: [string, number][] = [['30D', 30], ['90D', 90], ['6M', 180], ['1Y', 365], ['All', 0]]
const r1 = (n: number) => Math.round(n * 10) / 10

/** Time-of-day filter: morning = before 10 AM, night = 10 AM and later (local time). Together they cover every reading. */
type Tod = 'all' | 'morning' | 'night'
const TODS: [Tod, string][] = [['all', 'All'], ['morning', 'Morning'], ['night', 'Night']]
const TOD_KEY = 'bl.physique.tod'
const inTod = (iso: string, tod: Tod) => {
  if (tod === 'all') return true
  const h = new Date(iso).getHours()
  return tod === 'morning' ? h < 10 : h >= 10
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/** Body composition from smart-scale imports: latest readings, change, and a chart per metric. */
export function PhysiqueView({ user }: { user: User }) {
  const unit = useUnit()
  // From the device at once, refreshed behind it (and preloaded after launch / when Stats opens).
  const [rows, setRows] = useBody(user.id)
  const [key, setKey] = useState<BodyKey>('weight_kg')
  const [days, setDays] = useState(90)
  const [tod, setTodState] = useState<Tod>(() => { try { const v = localStorage.getItem(TOD_KEY); return v === 'morning' || v === 'night' ? v : 'all' } catch { return 'all' } })
  const setTod = (t: Tod) => { setTodState(t); try { localStorage.setItem(TOD_KEY, t) } catch { /* private mode */ } }
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<BodyMetric | null>(null)
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const self = user.id === me() // a friend's physique is view-only

  const show = (k: BodyKey, v: number) => {
    const f = BODY_FIELDS.find((x) => x.k === k)!
    return f.kind === 'mass' ? r1(toUnit(v, unit)) : r1(v)
  }
  const suffix = (k: BodyKey) => {
    const f = BODY_FIELDS.find((x) => x.k === k)!
    return f.kind === 'mass' ? unit : f.kind === 'pct' ? '%' : f.suffix ?? ''
  }

  const onFile = async (f?: File) => {
    if (!f || !rows) return
    setBusy(true); setMsg('')
    try {
      const parsed = parseBodyCsv(await f.text())
      if (!parsed.length) throw new Error('No readings found in that file.')
      const added = await importBody(parsed, rows)
      const all = await loadBody()
      setRows(all)
      // Keep profile bodyweight in sync with the newest scale reading.
      const last = all[all.length - 1]
      if (added && last && Math.abs(last.weight_kg - user.bodyweight_kg) > 0.01)
        await pb.collection('users').update(user.id, { bodyweight_kg: Math.round(last.weight_kg * 100) / 100 }).catch(() => {})
      setMsg(added ? `Imported ${added} new reading${added === 1 ? '' : 's'}.` : 'Already up to date.')
    } catch (e) {
      setMsg(errMsg(e))
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const chart = useMemo(() => {
    if (!rows) return null
    const pts = rows.filter((r) => r[key] > 0 && inTod(r.measured_at, tod) && (!days || new Date(r.measured_at).getTime() >= Date.now() - days * 86400000))
    const v = pts.map((r) => show(key, r[key]))
    return {
      pts, v, trend: v.length >= 2 ? trendLine(v) : undefined, times: pts.map((r) => timeOf(r.measured_at)),
      labels: pts.map((r) => new Date(r.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, days, unit, tod])

  /** A reading from a workout opens that workout; any other reading (or one whose workout was deleted) opens the editor. */
  const openPoint = async (r: BodyMetric) => {
    const wid = workoutOf(r)
    if (wid) {
      const exists = await pb.collection('workouts').getOne(wid, { fields: 'id' }).then(() => true).catch(() => false)
      if (exists) return nav(`/w/${wid}`)
    }
    setEditing(r)
  }
  /** After an edit or delete: reload, and keep profile bodyweight on the newest reading. */
  const changed = async () => {
    const all = await loadBody()
    setRows(all)
    const newest = [...all].reverse().find((r) => r.weight_kg > 0)
    if (newest && Math.abs(newest.weight_kg - user.bodyweight_kg) > 0.01)
      await pb.collection('users').update(user.id, { bodyweight_kg: Math.round(newest.weight_kg * 100) / 100 }).catch(() => {})
    loadWeight(true).catch(() => {})
  }

  if (!rows) return <Spinner />

  /** Latest non-zero value and change vs. the newest reading at least 30 days older (labelled with its date). */
  const stat = (k: BodyKey) => {
    const has = rows.filter((r) => r[k] > 0 && inTod(r.measured_at, tod))
    const last = has[has.length - 1]
    if (!last) return null
    const cut = new Date(last.measured_at).getTime() - 30 * 86400000
    const prev = [...has].reverse().find((r) => new Date(r.measured_at).getTime() <= cut)
    return { v: show(k, last[k]), d: prev ? r1(show(k, last[k]) - show(k, prev[k])) : null, since: prev ? new Date(prev.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '' }
  }
  const fields = BODY_FIELDS.filter((f) => rows.some((r) => r[f.k] > 0))
  const latest = rows[rows.length - 1]

  return (
    <div className="space-y-3 pb-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{self ? 'Your' : `${user.name || user.username}'s`} Physique</h1>
          <p className="text-sm text-muted">
            {latest ? `${rows.length} readings · last ${new Date(latest.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}, ${timeOf(latest.measured_at)}` : self ? 'Import your smart scale history' : 'No readings shared yet'}
          </p>
        </div>
        {self && <button onClick={() => file.current?.click()} disabled={busy} className="mt-1 shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink disabled:opacity-50">
          {busy ? 'Importing…' : 'Import CSV'}
        </button>}
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </header>
      {msg && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{msg}</p>}

      {!rows.length ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <ScaleIcon width={40} height={40} className="mx-auto text-faint" aria-hidden />
          <p className="mt-2 font-bold">No body data yet</p>
          {self && <p className="mt-1 text-sm text-muted">In the RENPHO app go to Me → Export Data, then import the CSV here. Re-importing skips readings you already have.</p>}
        </div>
      ) : (
        <>
          {/* Weigh-ins at different times of day differ by a few lb (food, water), so compare like with like. */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" role="group" aria-label="Time of day">
            {TODS.map(([t, l]) => (
              <button key={t} onClick={() => setTod(t)} aria-pressed={tod === t}
                className={`h-8 rounded-lg text-xs font-bold transition ${tod === t ? 'bg-accent text-accent-ink' : 'text-muted'}`}>
                {l} <span className="num font-semibold opacity-70">{rows.filter((r) => inTod(r.measured_at, t)).length}</span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-line bg-surface p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-bold">{BODY_FIELDS.find((f) => f.k === key)!.label}</p>
              <div className="flex gap-1">
                {RANGES.map(([l, d]) => (
                  <button key={l} onClick={() => setDays(d)}
                    className={`h-7 rounded-lg px-2 text-[11px] font-bold ${days === d ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{l}</button>
                ))}
              </div>
            </div>
            {chart && chart.v.length
              ? <LineChart className="h-56" labels={chart.labels} values={chart.v} trend={chart.trend}
                  extras={chart.v.map((v, i) => `${v} ${suffix(key)} · ${chart.times[i]}${workoutOf(chart.pts[i]) ? ' · from a workout' : ''}`)}
                  {...(self ? { onPoint: (i: number) => openPoint(chart.pts[i]), pointAction: (i: number) => (workoutOf(chart.pts[i]) ? 'open workout' : 'edit') } : {})} />
              : <p className="py-10 text-center text-sm text-muted">No {tod === 'all' ? '' : `${tod} `}readings in this range.</p>}
            {tod !== 'all' && <p className="mt-1 text-center text-[11px] text-faint">{tod === 'morning' ? 'Morning: before 10 AM' : 'Night: 10 AM and later'}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {fields.map((f) => {
              const s = stat(f.k)
              if (!s) return null
              const on = key === f.k
              return (
                <button key={f.k} onClick={() => setKey(f.k)}
                  className={`rounded-2xl border p-2.5 text-left transition ${on ? 'border-accent bg-accent/10' : 'border-line bg-surface'}`}>
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted">{f.label}</p>
                  <p className="num text-lg font-black leading-tight">{s.v}<span className="ml-0.5 text-[11px] font-bold text-muted">{suffix(f.k)}</span></p>
                  {s.d !== null && <p className={`text-[11px] font-bold ${s.d === 0 ? 'text-faint' : 'text-muted'}`}>{s.d > 0 ? '+' : ''}{s.d} since {s.since}</p>}
                </button>
              )
            })}
          </div>

        </>
      )}
      {editing && <ReadingEditor r={editing} field={key} unit={unit} onClose={() => setEditing(null)} onChanged={changed} />}
    </div>
  )
}

/** "YYYY-MM-DDTHH:mm" in local time, for a datetime-local input. */
const localInput = (iso: string) => {
  const d = new Date(iso), p = (n: number) => `${n}`.padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Edit one reading's value (for the metric on the chart) and time, or delete it. */
function ReadingEditor({ r, field, unit, onClose, onChanged }: { r: BodyMetric; field: BodyKey; unit: Unit; onClose: () => void; onChanged: () => Promise<void> }) {
  const f = BODY_FIELDS.find((x) => x.k === field)!
  const mass = f.kind === 'mass'
  const [val, setVal] = useState(`${mass ? r1(toUnit(r[field], unit)) : r1(r[field])}`)
  const [when, setWhen] = useState(localInput(r.measured_at))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const v = num(val)
  const at = new Date(when)
  const bad = !(v > 0) || isNaN(at.getTime()) || at.getTime() > Date.now() + 60e3
  const sfx = mass ? unit : f.kind === 'pct' ? '%' : f.suffix ?? ''
  const src = r.source === 'renpho' ? 'Imported from your smart scale' : r.source === 'manual' ? 'Logged weigh-in' : workoutOf(r) ? 'Logged with a workout (since deleted)' : 'Reading'

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('')
    try { await fn(); await onChanged(); onClose() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const save = () => run(() => pb.collection('body_metrics').update(r.id, {
    [field]: Math.round((mass ? fromUnit(v, unit) : v) * 1000) / 1000, measured_at: at.toISOString(),
  }))
  const remove = async () => {
    if (await ask({ title: 'Delete this reading?', body: `${new Date(r.measured_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${r.source === 'renpho' ? ' · removes every metric from this scale reading' : ''}`, confirmLabel: 'Delete', danger: true }))
      run(() => pb.collection('body_metrics').delete(r.id))
  }

  return (
    <BottomSheet title={`Edit ${f.label.toLowerCase()}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-muted">{src}</p>
        <label className="relative block">
          <input autoFocus inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d.,]/g, ''))} aria-label={`${f.label} (${sfx})`}
            className="num h-16 w-full rounded-2xl border border-line bg-surface-2 px-4 pr-14 text-3xl font-black text-ink outline-none focus:border-accent" />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-faint">{sfx}</span>
        </label>
        <label className="flex items-center justify-between gap-3 rounded-xl bg-surface p-2 pl-3">
          <span className="text-sm text-muted">When</span>
          <input type="datetime-local" value={when} max={localInput(new Date().toISOString())} onChange={(e) => setWhen(e.target.value)}
            className="h-10 rounded-lg bg-surface-2 px-2 text-base font-semibold text-ink outline-none" />
        </label>
        <ErrorText>{err}</ErrorText>
        <Button disabled={busy || bad} onClick={save}>{busy ? 'Saving…' : 'Save'}</Button>
        <Button variant="danger" disabled={busy} onClick={remove}>Delete reading</Button>
      </div>
    </BottomSheet>
  )
}
