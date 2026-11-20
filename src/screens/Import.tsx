import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, ErrorText, Screen, Segmented, Stat } from '../components/ui'
import { alreadyImported, isImported, runImport } from '../lib/importer'
import { importLiftoff, looksLikeLiftoff, type ImpResult } from '../lib/liftoff'
import { exportLiftoffCsv, downloadText, shareOrDownload } from '../lib/exporter'
import { errMsg, useUnit, type Unit } from '../lib/pb'

export default function Import() {
  const [parsed, setParsed] = useState<ImpResult | null>(null)
  const [existing, setExisting] = useState<Set<string>>(new Set())
  const [unit, setUnit] = useState<Unit>('lb')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState('')
  const [err, setErr] = useState('')
  const userUnit = useUnit()
  const [exUnit, setExUnit] = useState<Unit>(userUnit)
  const [exp, setExp] = useState<{ csv: string; workouts: number; sets: number; name: string } | null>(null)
  const [exporting, setExporting] = useState(false)
  const [expErr, setExpErr] = useState('')
  const buildExport = async () => {
    setExpErr(''); setExp(null); setExporting(true)
    try {
      const r = await exportLiftoffCsv(exUnit)
      const d = new Date()
      setExp({ ...r, name: `betterlift_workout_data_${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.csv` })
    } catch (e) { setExpErr(errMsg(e)) } finally { setExporting(false) }
  }

  const pick = async (f?: File) => {
    if (!f) return
    setErr(''); setResult(''); setParsed(null)
    try {
      const text = await f.text()
      if (!looksLikeLiftoff(text)) throw new Error("This doesn't look like a Liftoff export CSV.")
      const r = importLiftoff(text)
      setExisting(await alreadyImported())
      setParsed(r)
    } catch (e) { setErr(errMsg(e)) }
  }

  const fresh = parsed?.workouts.filter((w) => !isImported(existing, w)).length ?? 0
  const totalSets = parsed?.workouts.reduce((t, w) => t + w.exercises.reduce((u, x) => u + x.sets.length, 0), 0) ?? 0

  const run = async () => {
    if (!parsed) return
    setErr('')
    try {
      const r = await runImport(parsed, unit, (done, total) => setProgress({ done, total }))
      setResult(`Imported ${r.imported} workouts${r.createdExercises ? ` and created ${r.createdExercises} custom exercises` : ''}.`)
      setParsed(null)
    } catch (e) { setErr(`${errMsg(e)} — already-imported workouts are skipped, so you can safely retry.`) }
    finally { setProgress(null) }
  }

  return (
    <Screen title="Import / Export" back>
      <h2 className="text-lg font-extrabold">Import</h2>
      <p className="text-muted">In Liftoff, go to Settings → Export Workouts, save <span className="font-mono text-ink">liftoff_workout_data.csv</span>, then choose it here. Re-importing the same file never creates duplicates.</p>
      <label className="flex h-12 cursor-pointer items-center justify-center rounded-2xl bg-surface-2 font-bold">
        Choose CSV file
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
      </label>
      <ErrorText>{err}</ErrorText>
      {result && <Card className="border-accent/40 bg-accent/10"><p className="font-bold">{result}</p><Link to="/stats" className="text-sm font-bold text-accent">See your stats →</Link></Card>}
      {parsed && (
        <>
          <Card className="grid grid-cols-3 gap-2">
            <Stat value={parsed.workouts.length} label="Workouts" />
            <Stat value={totalSets} label="Sets" />
            <Stat value={fresh} label="New" />
          </Card>
          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Weights in this file are in</span>
            <Segmented value={unit} onChange={setUnit} options={[['lb', 'Pounds (lb) / miles'], ['kg', 'Kilograms (kg) / km']]} />
          </div>
          {progress ? (
            <Card>
              <p className="mb-2 text-sm font-bold">Importing… {progress.done}/{progress.total}</p>
              <div className="h-2 rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} /></div>
            </Card>
          ) : (
            <Button onClick={run} disabled={!fresh}>{fresh ? `Import ${fresh} workouts` : 'Everything is already imported'}</Button>
          )}
        </>
      )}
      <h2 className="pt-4 text-lg font-extrabold">Export</h2>
      <p className="text-muted">Download all your workouts as a Liftoff-format CSV (same format as the import above). Body / physique data is not included.</p>
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Export weights in</span>
        <Segmented value={exUnit} onChange={(u) => { setExUnit(u); setExp(null) }} options={[['lb', 'Pounds (lb) / miles'], ['kg', 'Kilograms (kg) / km']]} />
      </div>
      {!exp ? (
        <Button variant="ghost" onClick={buildExport} disabled={exporting}>{exporting ? 'Preparing…' : 'Export workouts'}</Button>
      ) : (
        <Card>
          <p className="mb-3 text-sm font-bold">{exp.workouts} workouts · {exp.sets} sets ready</p>
          {exp.workouts ? (
            <div className="grid grid-cols-2 gap-2">
              <Button onClick={() => shareOrDownload(exp.csv, exp.name)}>Save / Share</Button>
              <Button variant="ghost" onClick={() => downloadText(exp.csv, exp.name)}>Download</Button>
            </div>
          ) : <p className="text-sm text-muted">Nothing to export yet.</p>}
        </Card>
      )}
      <ErrorText>{expErr}</ErrorText>
      <p className="pt-4 text-center text-xs text-faint">Liftoff import adapted from LiftX by JacobG122503.</p>
    </Screen>
  )
}
