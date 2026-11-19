import { useEffect, useMemo, useRef, useState } from 'react'
import { LineChart } from '../components/LineChart'
import { Spinner } from '../components/ui'
import { BODY_FIELDS, importBody, loadBody, parseBodyCsv, type BodyKey, type BodyMetric } from '../lib/body'
import { toUnit } from '../lib/format'
import { pb, useUnit, type User } from '../lib/pb'
import { trendLine } from '../lib/stats'

const RANGES: [string, number][] = [['30D', 30], ['90D', 90], ['6M', 180], ['1Y', 365], ['All', 0]]
const r1 = (n: number) => Math.round(n * 10) / 10

/** Body composition from smart-scale imports: latest readings, change, and a chart per metric. */
export function PhysiqueView({ user }: { user: User }) {
  const unit = useUnit()
  const [rows, setRows] = useState<BodyMetric[] | null>(null)
  const [key, setKey] = useState<BodyKey>('weight_kg')
  const [days, setDays] = useState(90)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => { loadBody().then(setRows).catch(() => setRows([])) }, [])

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
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }

  const chart = useMemo(() => {
    if (!rows) return null
    const pts = rows.filter((r) => r[key] > 0 && (!days || new Date(r.measured_at).getTime() >= Date.now() - days * 86400000))
    const v = pts.map((r) => show(key, r[key]))
    return {
      v, trend: v.length >= 2 ? trendLine(v) : undefined,
      labels: pts.map((r) => new Date(r.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: '2-digit' })),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, key, days, unit])

  if (!rows) return <Spinner />

  /** Latest non-zero value and change vs. the newest reading at least 30 days older (labelled with its date). */
  const stat = (k: BodyKey) => {
    const has = rows.filter((r) => r[k] > 0)
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
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">Your Physique</h1>
          <p className="text-sm text-muted">
            {latest ? `${rows.length} readings · last ${new Date(latest.measured_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Import your smart scale history'}
          </p>
        </div>
        <button onClick={() => file.current?.click()} disabled={busy} className="mt-1 shrink-0 rounded-xl bg-accent px-3 py-2 text-sm font-bold text-accent-ink disabled:opacity-50">
          {busy ? 'Importing…' : 'Import CSV'}
        </button>
        <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </header>
      {msg && <p className="rounded-xl bg-surface-2 px-3 py-2 text-sm">{msg}</p>}

      {!rows.length ? (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-4xl">⚖️</p>
          <p className="mt-2 font-bold">No body data yet</p>
          <p className="mt-1 text-sm text-muted">In the RENPHO app go to Me → Export Data, then import the CSV here. Re-importing skips readings you already have.</p>
        </div>
      ) : (
        <>
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
              ? <LineChart className="h-56" labels={chart.labels} values={chart.v} trend={chart.trend} extras={chart.v.map((v) => `${v} ${suffix(key)}`)} />
              : <p className="py-10 text-center text-sm text-muted">No readings in this range.</p>}
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
