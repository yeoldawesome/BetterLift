// Hidden admin console at #/admin — not linked anywhere. Signs in with a PocketBase superuser account in its own
// session (separate from the normal app login), so the server enforces that only real admins can do any of this.
import PocketBase, { LocalAuthStore } from 'pocketbase'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BodyMap } from '../components/BodyMap'
import { SearchIcon } from '../components/icons'
import { Button, Card, Chips, ErrorText, Input, Segmented, Select, Sheet, Spinner } from '../components/ui'
import { EQUIPMENT, KINDS, MUSCLES, defaultLogTip, label, resetExercises } from '../lib/exercises'
import { timeAgo } from '../lib/format'
import { intensityForExercise } from '../lib/muscles'
import { errMsg, pb as appPb, type Exercise, type Feedback, type Kind } from '../lib/pb'
import { ask } from '../components/Dialog'

const admin = new PocketBase(appPb.baseURL, new LocalAuthStore('bl_admin_auth'))
admin.autoCancellation(false)

const areaCls = 'w-full rounded-xl border border-line bg-surface-2 p-3 text-base text-ink outline-none placeholder:text-faint focus:border-accent'

export default function Admin() {
  const [authed, setAuthed] = useState(admin.authStore.isValid && admin.authStore.isSuperuser)
  const [tab, setTab] = useState<'review' | 'exercises' | 'feedback'>('review')
  if (!authed) return <AdminLogin onDone={() => setAuthed(true)} />
  return (
    <section className="mx-auto max-w-2xl space-y-3 px-safe pb-16 pt-safe">
      <header className="flex items-center justify-between pt-4">
        <h1 className="text-[28px] font-extrabold tracking-tight">Admin</h1>
        <div className="flex gap-2">
          <a href="#/feed" className="rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold">Back to app</a>
          <button onClick={() => { admin.authStore.clear(); setAuthed(false) }} className="rounded-xl bg-danger/15 px-3 py-2 text-sm font-bold text-danger">Sign out</button>
        </div>
      </header>
      <Segmented value={tab} onChange={setTab} options={[['review', 'Review'], ['exercises', 'Exercises'], ['feedback', 'Feedback']]} />
      {tab === 'review' ? <ReviewTab /> : tab === 'exercises' ? <ExercisesTab /> : <FeedbackTab />}
    </section>
  )
}

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('')
    let id = email.trim(), pw = password
    // Local-dev shortcut: admin/admin → the local test superuser from .env.development.local (gitignored, and only
    // loaded by Vite in dev mode, so neither the shortcut nor the credentials exist in production builds).
    const devEmail = import.meta.env.VITE_DEV_ADMIN_EMAIL, devPw = import.meta.env.VITE_DEV_ADMIN_PASSWORD
    if (import.meta.env.DEV && devEmail && devPw && id === 'admin' && pw === 'admin') { id = devEmail; pw = devPw }
    try { await admin.collection('_superusers').authWithPassword(id, pw); onDone() } catch (x) { setErr(errMsg(x)) }
  }
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-safe py-10 pt-safe">
      <h1 className="text-3xl font-black">Admin sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Use your PocketBase admin (superuser) account.</p>
      <form onSubmit={submit} className="space-y-3">
        <Input type="text" inputMode="email" autoCapitalize="none" placeholder={import.meta.env.DEV ? 'Admin email (or "admin" locally)' : 'Admin email'} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <ErrorText>{err}</ErrorText>
        <Button>Sign in</Button>
      </form>
      <a href="#/feed" className="mt-6 text-center text-sm font-bold text-muted">← Back to app</a>
    </div>
  )
}

/** Edit any exercise field (admin). `onAction` adds review buttons for pending submissions. */
function ExerciseEditor({ ex, mode, onClose, onSaved }: { ex: Partial<Exercise>; mode: 'edit' | 'create' | 'review'; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: ex.name ?? '', muscle: ex.muscle ?? 'chest', equipment: ex.equipment ?? 'barbell', kind: (ex.kind ?? 'weight') as Kind,
    secondary: ex.secondary ?? [], instructions: ex.instructions ?? '', log_tip: ex.log_tip ?? '',
  })
  const [note, setNote] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }))
  const data = { ...f, name: f.name.trim(), secondary: f.secondary.filter((m) => m !== f.muscle), instructions: f.instructions.trim(), log_tip: f.log_tip.trim() || defaultLogTip(f.kind, f.equipment) }

  const run = async (p: () => Promise<unknown>) => {
    setErr(''); setBusy(true)
    try { await p(); resetExercises(); onSaved() } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const save = () => run(() => (mode === 'create' ? admin.collection('exercises').create({ ...data, owner: '' }) : admin.collection('exercises').update(ex.id!, data)))
  const decide = (action: 'approve' | 'reject') => run(() => admin.send(`/api/betterlift/exercises/${ex.id}/review`, { method: 'POST', body: { action, note: note.trim(), ...data } }))
  const remove = async () => { if (await ask({ title: `Delete “${ex.name}” for everyone?`, body: 'This fails if anyone has logged it.', confirmLabel: 'Delete', danger: true })) run(() => admin.collection('exercises').delete(ex.id!)) }

  return (
    <Sheet title={mode === 'create' ? 'New official exercise' : mode === 'review' ? 'Review submission' : 'Edit exercise'} onClose={onClose}>
      <div className="space-y-3 pb-10">
        {ex.owner && mode !== 'review' && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-300">This is a user's custom exercise (@{ex.expand?.owner?.username ?? ex.owner}).</p>}
        <Input label="Name" value={f.name} onChange={(e) => set({ name: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Select label="Primary muscle" value={f.muscle} onChange={(muscle) => set({ muscle })} options={MUSCLES.map((m) => [m, label(m)])} />
          <Select label="Equipment" value={f.equipment} onChange={(equipment) => set({ equipment })} options={EQUIPMENT.map((m) => [m, label(m)])} />
        </div>
        <Select label="Tracking" value={f.kind} onChange={(v) => set({ kind: v as Kind })} options={KINDS} />
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Secondary muscles</span>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.filter((m) => m !== f.muscle && m !== 'cardio' && m !== 'full_body').map((m) => (
              <button key={m} type="button" onClick={() => set({ secondary: f.secondary.includes(m) ? f.secondary.filter((x) => x !== m) : [...f.secondary, m] })}
                className={`h-8 rounded-full px-3 text-sm font-semibold ${f.secondary.includes(m) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{label(m)}</button>
            ))}
          </div>
        </div>
        <div className="flex justify-center rounded-2xl bg-surface-2 py-2"><BodyMap intensity={intensityForExercise(f)} className="h-32" /></div>
        <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to perform (one step per line)</span>
          <textarea rows={5} value={f.instructions} onChange={(e) => set({ instructions: e.target.value })} className={areaCls} /></label>
        <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to log it</span>
          <textarea rows={2} value={f.log_tip} onChange={(e) => set({ log_tip: e.target.value })} placeholder={defaultLogTip(f.kind, f.equipment)} className={areaCls} /></label>
        <ErrorText>{err}</ErrorText>
        {mode === 'review' ? (
          <>
            <Input label="Note to submitter (optional)" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Duplicate of Hip Thrust" />
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" disabled={busy} onClick={() => decide('reject')}>Deny</Button>
              <Button className="flex-1" disabled={busy || !f.name.trim()} onClick={() => decide('approve')}>Approve</Button>
            </div>
          </>
        ) : (
          <>
            <Button onClick={save} disabled={busy || !f.name.trim()}>{mode === 'create' ? 'Create for everyone' : 'Save changes'}</Button>
            {mode === 'edit' && <Button variant="danger" onClick={remove} disabled={busy}>Delete exercise</Button>}
          </>
        )}
      </div>
    </Sheet>
  )
}

function ReviewTab() {
  const [items, setItems] = useState<Exercise[] | null>(null)
  const [open, setOpen] = useState<Exercise | null>(null)
  const load = () => admin.collection('exercises').getFullList<Exercise>({ filter: 'review_status = "pending"', sort: 'created', expand: 'owner' }).then(setItems).catch(() => setItems([]))
  useEffect(() => { load() }, [])
  if (!items) return <Spinner />
  return (
    <>
      {!items.length && <Card className="py-8 text-center text-sm text-muted">No exercises waiting for review.</Card>}
      {items.map((e) => (
        <Card key={e.id} onClick={() => setOpen(e)} className="cursor-pointer active:bg-surface-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-extrabold">{e.name}</p>
              <p className="text-xs text-muted">{label(e.muscle)} · {label(e.equipment)} · by @{e.expand?.owner?.username} · {timeAgo(e.created)}</p>
              <p className="mt-1 line-clamp-2 text-sm text-muted">{e.instructions}</p>
            </div>
            <span className="shrink-0 rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-accent-ink">Review</span>
          </div>
        </Card>
      ))}
      {open && <ExerciseEditor ex={open} mode="review" onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </>
  )
}

function ExercisesTab() {
  const [all, setAll] = useState<Exercise[] | null>(null)
  const [scope, setScope] = useState('official')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<{ ex: Partial<Exercise>; mode: 'edit' | 'create' } | null>(null)
  const load = () => admin.collection('exercises').getFullList<Exercise>({ sort: 'name', expand: 'owner', batch: 1000 }).then(setAll).catch(() => setAll([]))
  useEffect(() => { load() }, [])
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (all ?? []).filter((e) => (scope === 'official' ? !e.owner : !!e.owner) && (!s || e.name.toLowerCase().includes(s)))
  }, [all, scope, q])
  if (!all) return <Spinner />
  return (
    <>
      <Button onClick={() => setOpen({ ex: {}, mode: 'create' })}>+ New official exercise</Button>
      <Chips value={scope} onChange={setScope} options={[['official', `Official (${all.filter((e) => !e.owner).length})`], ['custom', `User custom (${all.filter((e) => e.owner).length})`]]} />
      <div className="relative">
        <SearchIcon width={18} height={18} className="absolute left-3 top-3.5 text-faint" />
        <Input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <Card className="p-0">
        {list.map((e) => (
          <button key={e.id} onClick={() => setOpen({ ex: e, mode: 'edit' })} className="flex w-full items-center justify-between gap-2 border-b border-line px-4 py-3 text-left last:border-0 active:bg-surface-2">
            <span className="min-w-0">
              <span className="block truncate font-semibold">{e.name}</span>
              <span className="block text-xs text-muted">{label(e.muscle)} · {label(e.equipment)}{e.owner ? ` · @${e.expand?.owner?.username}` : ''}{!e.instructions ? ' · no instructions' : ''}</span>
            </span>
            <span className="text-faint">›</span>
          </button>
        ))}
      </Card>
      {open && <ExerciseEditor ex={open.ex} mode={open.mode} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </>
  )
}

function FeedbackTab() {
  const [items, setItems] = useState<Feedback[] | null>(null)
  const [status, setStatus] = useState('open')
  const [editing, setEditing] = useState<{ ex: Partial<Exercise>; mode: 'edit' | 'create'; fb: Feedback } | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [err, setErr] = useState('')
  const load = () => admin.collection('feedback').getFullList<Feedback>({ sort: '-created', expand: 'user,exercise' }).then(setItems).catch(() => setItems([]))
  useEffect(() => { load() }, [])
  const close = async (f: Feedback, s: 'done' | 'declined') => {
    try { await admin.collection('feedback').update(f.id, { status: s, admin_note: (notes[f.id] ?? '').trim() }); load() } catch (e) { setErr(errMsg(e)) }
  }
  if (!items) return <Spinner />
  const list = items.filter((f) => (status === 'open' ? !f.status || f.status === 'open' : status === 'all' ? true : f.status === status))
  return (
    <>
      <Chips value={status} onChange={setStatus} options={[['open', `Open (${items.filter((f) => !f.status || f.status === 'open').length})`], ['done', 'Done'], ['declined', 'Declined'], ['all', 'All']]} />
      <ErrorText>{err}</ErrorText>
      {!list.length && <Card className="py-8 text-center text-sm text-muted">Nothing here.</Card>}
      {list.map((f) => {
        const p = (f.proposal ?? {}) as Partial<Exercise>
        const isOpen = !f.status || f.status === 'open'
        return (
          <Card key={f.id} className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-bold uppercase tracking-wider text-muted">{f.type === 'general' ? 'Feedback' : f.type === 'exercise_request' ? 'Exercise request' : 'Edit request'} · @{f.expand?.user?.username}</span>
              <span className="text-faint">{timeAgo(f.created)}</span>
            </div>
            {f.type === 'exercise_request' && p.name && <p className="font-extrabold">{p.name} <span className="text-xs font-semibold text-muted">{p.muscle && label(p.muscle)} · {p.equipment && label(p.equipment)}</span></p>}
            {f.type === 'edit_request' && f.expand?.exercise && <p className="font-extrabold">{f.expand.exercise.name}</p>}
            <p className="whitespace-pre-wrap text-sm">{f.message}</p>
            {f.type === 'edit_request' && p.instructions && <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-2 text-xs text-muted">Proposed: {p.name} · {p.muscle && label(p.muscle)}{'\n'}{p.instructions}</p>}
            {f.admin_note && !isOpen && <p className="text-sm"><span className="font-bold">Your reply: </span>{f.admin_note}</p>}
            {isOpen && (
              <>
                <Input placeholder="Reply to the user (optional)" value={notes[f.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [f.id]: e.target.value }))} />
                <div className="flex flex-wrap gap-2">
                  {f.type === 'exercise_request' && <Button size="sm" onClick={() => setEditing({ ex: p, mode: 'create', fb: f })}>Create exercise</Button>}
                  {f.type === 'edit_request' && f.expand?.exercise && (
                    <Button size="sm" onClick={() => setEditing({ ex: { ...f.expand!.exercise!, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) }, mode: 'edit', fb: f })}>Open & apply edit</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => close(f, 'done')}>Mark done</Button>
                  <Button size="sm" variant="danger" onClick={() => close(f, 'declined')}>Decline</Button>
                </div>
              </>
            )}
          </Card>
        )
      })}
      {editing && (
        <ExerciseEditor ex={editing.ex} mode={editing.mode} onClose={() => setEditing(null)}
          onSaved={() => { const fb = editing.fb; setEditing(null); close(fb, 'done') }} />
      )}
    </>
  )
}
