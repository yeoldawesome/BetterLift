// Exports the user's workouts as a Liftoff-format CSV (the same format the Import screen reads).
// Workouts only — body metrics / physique data are not included.
import { toDist, toUnit } from './format'
import { loadExercises } from './exercises'
import { me, pb, type Unit, type Workout, type WSet } from './pb'

const HEADER = ['Date', 'Duration', 'Workout Name', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'RPE', 'Notes']

const esc = (v: string | number) => {
  const s = String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const r2 = (n: number) => (n ? String(Math.round(n * 100) / 100) : '0')
const pad = (n: number) => String(n).padStart(2, '0')
/** Local "YYYY-MM-DD HH:MM:SS" — parsed back by the importer. */
const fmtDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60)
  return [h && `${h} hours`, m && `${m} minutes`, (sec || (!h && !m)) && `${sec} seconds`].filter(Boolean).join(' ')
}

export async function exportLiftoffCsv(unit: Unit): Promise<{ csv: string; workouts: number; sets: number }> {
  const uid = me()
  const [workouts, sets, lib] = await Promise.all([
    pb.collection('workouts').getFullList<Workout>({ filter: pb.filter('user = {:u}', { u: uid }), fields: 'id,name,started_at,duration_s,source_id', batch: 1000, requestKey: null }),
    pb.collection('workout_sets').getFullList<WSet>({
      filter: pb.filter('user = {:u} && completed = true', { u: uid }), sort: 'performed_at', batch: 1000, requestKey: null,
      fields: 'workout,exercise,position,set_index,weight_kg,reps,seconds,distance_km,rpe,note',
    }),
    loadExercises(),
  ])
  const exName = new Map(lib.map((e) => [e.id, e.name]))
  const byWorkout = new Map<string, WSet[]>()
  for (const s of sets) byWorkout.set(s.workout, [...(byWorkout.get(s.workout) ?? []), s])

  const lines = [HEADER.join(',')]
  let count = 0
  for (const w of [...workouts].sort((a, b) => a.started_at.localeCompare(b.started_at))) {
    const ws = byWorkout.get(w.id)
    if (!ws?.length) continue
    count++
    // Keep a previously imported workout's original timestamp so re-importing it is still recognized as a duplicate.
    const date = w.source_id?.startsWith('liftoff:') ? w.source_id.slice(8) : fmtDate(new Date(w.started_at))
    ws.sort((a, b) => a.position - b.position || a.set_index - b.set_index)
    const order = new Map<string, number>()
    for (const s of ws) {
      const n = (order.get(s.exercise) ?? 0) + 1
      order.set(s.exercise, n)
      lines.push([
        date, fmtDuration(w.duration_s || 0), w.name || 'Workout', exName.get(s.exercise) ?? 'Unknown exercise', n,
        r2(toUnit(s.weight_kg || 0, unit)), s.reps || 0, r2(toDist(s.distance_km || 0, unit)), s.seconds || 0, s.rpe || '', s.note ?? '',
      ].map(esc).join(','))
    }
  }
  return { csv: lines.join('\n') + '\n', workouts: count, sets: lines.length - 1 }
}

export function downloadText(text: string, filename: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Opens the share sheet with the file where supported (phones), otherwise downloads it. Call from a tap. */
export async function shareOrDownload(text: string, filename: string, type = 'text/csv') {
  const file = new File([text], filename, { type })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
    }
  }
  downloadText(text, filename, type)
}
