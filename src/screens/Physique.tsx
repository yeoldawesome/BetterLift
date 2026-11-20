import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart } from '../components/LineChart'
import { Spinner } from '../components/ui'
import { ScaleIcon } from '../components/icons'
import { BODY_FIELDS, importBody, loadBody, parseBodyCsv, type BodyKey, type BodyMetric } from '../lib/body'
import { toUnit } from '../lib/format'
import { errMsg, me, pb, useUnit, type User } from '../lib/pb'
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
  const [rows, setRows] = useState<BodyMetric[] | null>(null)
  const [key, setKey] = useState<BodyKey>('weight_kg')
  const [days, setDays] = useState(90)
  const [tod, setTodState] = useState<Tod>(() => { try { const v = localStorage.getItem(TOD_KEY); return v === 'morning' || v === 'night' ? v : 'all' } catch { return 'all' } })
  const setTod = (t: Tod) => { setTodState(t); try { localStorage.setItem(TOD_KEY, t) } catch { /* private mode */ } }
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const self = user.id === me() // a friend's physique is view-only
  useEffect(() => { loadBody(user.id).then(setRows).catch(() => setRows([])) }, [user.id])

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
      v, trend: v.length >= 2 ? trendLine(v) : undefined, times: pts.map((r) => timeOf(r.measured_at)),
      labels: pts.map((r) => new Date(r.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, days, unit, tod])

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
              ? <LineChart className="h-56" labels={chart.labels} values={chart.v} trend={chart.trend} extras={chart.v.map((v, i) => `${v} ${suffix(key)} · ${chart.times[i]}`)} />
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
    </div>
  )
}
