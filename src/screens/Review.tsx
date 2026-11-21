import { useEffect, useState } from 'react'
import { Avatar, Button, Card, Empty, ErrorText, Input, Screen, Select, Spinner } from '../components/ui'
import { EQUIPMENT, KINDS, label, resetExercises } from '../lib/exercises'
import { BodyMap } from '../components/BodyMap'
import { intensityForExercise, primaryOptions, secondaryOptions } from '../lib/muscles'
import { timeAgo } from '../lib/format'
import { errMsg, pb, type Exercise, type Kind } from '../lib/pb'
import { ask } from '../components/Dialog'

export default function Review() {
  const [items, setItems] = useState<Exercise[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => {
    pb.collection('exercises').getFullList<Exercise>({ filter: 'review_status = "pending"', sort: 'created', expand: 'owner' })
      .then(setItems).catch((e) => setErr(errMsg(e)))
  }, [])

  const done = (id: string) => { setItems((xs) => xs?.filter((x) => x.id !== id) ?? null); resetExercises() }

  return (
    <Screen title="Review" back>
      <p className="text-muted">Exercises people have suggested for the official library. Fix the details if needed, then approve or reject.</p>
      <ErrorText>{err}</ErrorText>
      {!items ? (!err && <Spinner />) : !items.length ? <Empty title="All caught up" body="No exercises waiting for review." /> : items.map((e) => <ReviewCard key={e.id} e={e} onDone={() => done(e.id)} />)}
    </Screen>
  )
}

function ReviewCard({ e, onDone }: { e: Exercise; onDone: () => void }) {
  const [name, setName] = useState(e.name)
  const [muscle, setMuscle] = useState(e.muscle)
  const [equipment, setEquipment] = useState(e.equipment)
  const [kind, setKind] = useState<Kind>(e.kind)
  const [note, setNote] = useState('')
  const [secondary, setSecondary] = useState<string[]>(e.secondary ?? [])
  const [instructions, setInstructions] = useState(e.instructions ?? '')
  const [logTip, setLogTip] = useState(e.log_tip ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const decide = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !note.trim() && !await ask({ title: 'Reject without a note?', body: 'A short reason helps the submitter.', confirmLabel: 'Reject', danger: true })) return
    setErr(''); setBusy(true)
    try {
      await pb.send(`/api/betterlift/exercises/${e.id}/review`, { method: 'POST', body: { action, note: note.trim(), name: name.trim(), muscle, equipment, kind, secondary: secondary.filter((m) => m !== muscle), instructions: instructions.trim(), log_tip: logTip.trim() } })
      onDone()
    } catch (x) { setErr(errMsg(x)) } finally { setBusy(false) }
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-muted">
        <Avatar user={e.expand?.owner} size={24} />
        <span>@{e.expand?.owner?.username} · {timeAgo(e.created)}</span>
      </div>
      <Input label="Name" value={name} onChange={(x) => setName(x.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <Select label="Muscle" value={muscle} onChange={setMuscle} options={primaryOptions(muscle, label)} />
        <Select label="Equipment" value={equipment} onChange={setEquipment} options={EQUIPMENT.map((m) => [m, label(m)])} />
      </div>
      <Select label="Tracking" value={kind} onChange={(v) => setKind(v as Kind)} options={KINDS} />
      <div>
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Secondary muscles</span>
        <div className="flex flex-wrap gap-1.5">
          {secondaryOptions(muscle, secondary).map((m) => (
            <button key={m} type="button" onClick={() => setSecondary((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))}
              className={`h-8 rounded-full px-3 text-sm font-semibold ${secondary.includes(m) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{label(m)}</button>
          ))}
        </div>
      </div>
      <div className="flex justify-center rounded-2xl bg-surface-2 py-2">
        <BodyMap sex={e.expand?.owner?.sex} intensity={intensityForExercise({ muscle, secondary })} className="h-32" />
      </div>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to perform</span>
        <textarea rows={4} value={instructions} onChange={(x) => setInstructions(x.target.value)} className="w-full rounded-xl border border-line bg-surface-2 p-3 text-base text-ink outline-none focus:border-accent" />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to log it</span>
        <textarea rows={2} value={logTip} onChange={(x) => setLogTip(x.target.value)} className="w-full rounded-xl border border-line bg-surface-2 p-3 text-base text-ink outline-none focus:border-accent" />
      </label>
      <Input label="Note to submitter (optional)" value={note} maxLength={300} onChange={(x) => setNote(x.target.value)} placeholder="e.g. Duplicate of Hip Thrust" />
      <ErrorText>{err}</ErrorText>
      <div className="flex gap-2">
        <Button variant="danger" className="flex-1" disabled={busy} onClick={() => decide('reject')}>Reject</Button>
        <Button className="flex-1" disabled={busy || !name.trim()} onClick={() => decide('approve')}>Approve</Button>
      </div>
    </Card>
  )
}
