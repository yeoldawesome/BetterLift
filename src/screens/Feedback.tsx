import { useClearOnVisit } from '../lib/notifications'
import { useEffect, useState } from 'react'
import { Button, Card, ErrorText, Input, Screen, Segmented, Select, Spinner } from '../components/ui'
import { EQUIPMENT, KINDS, MUSCLES, label, loadExercises } from '../lib/exercises'
import { timeAgo } from '../lib/format'
import { errMsg, me, pb, type Exercise, type Feedback as FB, type FeedbackType, type Kind } from '../lib/pb'

const TYPES: [FeedbackType, string][] = [['general', 'Feedback'], ['exercise_request', 'New exercise'], ['edit_request', 'Edit exercise']]
const TYPE_LABEL: Record<FeedbackType, string> = { general: 'Feedback', exercise_request: 'Exercise request', edit_request: 'Edit request' }
const areaCls = 'w-full rounded-xl border border-line bg-surface-2 p-3 text-base text-ink outline-none placeholder:text-faint focus:border-accent'

/** Send general feedback, request a new exercise, or request an edit to an existing one. */
export default function Feedback() {
  useClearOnVisit('feedback')
  const [tab, setTab] = useState<'send' | 'mine'>('send')
  const [type, setType] = useState<FeedbackType>('general')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('chest')
  const [equipment, setEquipment] = useState('barbell')
  const [kind, setKind] = useState<Kind>('weight')
  const [exId, setExId] = useState('')
  const [lib, setLib] = useState<Exercise[]>([])
  const [mine, setMine] = useState<FB[] | null>(null)
  const [err, setErr] = useState('')
  const [sent, setSent] = useState('')

  const loadMine = () => pb.collection('feedback').getFullList<FB>({ filter: pb.filter('user = {:u}', { u: me() }), sort: '-created', expand: 'exercise' }).then(setMine).catch(() => setMine([]))
  useEffect(() => { loadExercises().then((l) => { setLib(l); if (l[0]) setExId(l[0].id) }).catch(() => {}); loadMine() }, [])

  const ready = type === 'exercise_request' ? name.trim().length > 1 : type === 'edit_request' ? !!exId && message.trim().length > 4 : message.trim().length > 4

  const send = async () => {
    setErr(''); setSent('')
    try {
      const ex = lib.find((e) => e.id === exId)
      await pb.collection('feedback').create({
        user: me(), type,
        exercise: type === 'edit_request' ? exId : '',
        message: type === 'exercise_request' ? (message.trim() || `Please add ${name.trim()}`) : message.trim(),
        proposal: type === 'exercise_request' ? { name: name.trim(), muscle, equipment, kind } : type === 'edit_request' ? { name: ex?.name } : null,
      })
      setMessage(''); setName('')
      setSent('Thanks! Your message was sent.')
      loadMine()
    } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <Screen title="Feedback" back>
      <Segmented value={tab} onChange={setTab} options={[['send', 'Send'], ['mine', `My requests${mine?.length ? ` (${mine.length})` : ''}`]]} />
      {tab === 'send' ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            {TYPES.map(([v, l]) => (
              <button key={v} onClick={() => setType(v)} className={`h-11 rounded-xl text-sm font-bold ${type === v ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{l}</button>
            ))}
          </div>
          {type === 'exercise_request' && (
            <>
              <Input label="Exercise name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Landmine Row" />
              <div className="grid grid-cols-2 gap-2">
                <Select label="Muscle" value={muscle} onChange={setMuscle} options={MUSCLES.map((m) => [m, label(m)])} />
                <Select label="Equipment" value={equipment} onChange={setEquipment} options={EQUIPMENT.map((m) => [m, label(m)])} />
              </div>
              <Select label="Tracking" value={kind} onChange={(v) => setKind(v as Kind)} options={KINDS} />
            </>
          )}
          {type === 'edit_request' && (
            <Select label="Exercise to change" value={exId} onChange={setExId} options={lib.map((e) => [e.id, e.name])} />
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
              {type === 'general' ? 'Your feedback' : type === 'exercise_request' ? 'Anything else? (optional)' : 'What should change?'}
            </span>
            <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={areaCls}
              placeholder={type === 'general' ? 'Ideas, bugs, things you love or hate…' : type === 'exercise_request' ? 'How it’s done, which muscles it hits…' : 'e.g. The instructions should mention keeping elbows tucked'} />
          </label>
          <ErrorText>{err}</ErrorText>
          {sent && <p className="text-sm font-semibold text-accent">{sent}</p>}
          <Button onClick={send} disabled={!ready}>Send</Button>
        </>
      ) : !mine ? <Spinner /> : !mine.length ? <p className="py-8 text-center text-sm text-muted">You haven't sent anything yet.</p> : (
        mine.map((f) => (
          <Card key={f.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">{TYPE_LABEL[f.type]}{f.expand?.exercise ? ` · ${f.expand.exercise.name}` : f.type === 'exercise_request' && f.proposal?.name ? ` · ${f.proposal.name}` : ''}</span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${f.status === 'done' ? 'bg-accent/20 text-accent' : f.status === 'declined' ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted'}`}>
                {f.status === 'done' ? 'Done' : f.status === 'declined' ? 'Declined' : 'Open'}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-sm">{f.message}</p>
            {f.admin_note && <p className="rounded-xl bg-surface-2 p-2 text-sm"><span className="font-bold">Reply: </span>{f.admin_note}</p>}
            <p className="text-xs text-faint">{timeAgo(f.created)}</p>
          </Card>
        ))
      )}
    </Screen>
  )
}
