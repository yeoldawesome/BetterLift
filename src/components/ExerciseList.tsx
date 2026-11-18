import { useEffect, useMemo, useState } from 'react'
import { EQUIPMENT, KINDS, MUSCLES, defaultLogTip, findDuplicates, guessEquipment, guessKind, guessMuscle, label, loadExercises, loadUsage, mergeExercise, type Usage } from '../lib/exercises'
import { invalidateStats } from '../lib/statsData'
import { clearBestCache } from '../lib/best'
import { timeAgo } from '../lib/format'
import { errMsg, me, pb, type Exercise, type Kind } from '../lib/pb'
import { ExerciseInfo } from './ExerciseInfo'
import { searchExercises } from '../lib/search'
import { Button, Card, Chips, ErrorText, Input, Select, Sheet, Spinner, Toggle } from './ui'
import { InfoIcon, SearchIcon, TrashIcon } from './icons'

type Show = 'all' | 'most' | 'recent'
type Sort = 'name' | 'most' | 'recent'

function status(e: Exercise) {
  const uid = me()
  if (!e.owner) return <>{e.override && <span className="text-accent"> · Edited for you</span>}{e.submitted_by === uid && <span className="text-accent"> · Official — added by you</span>}</>
  if (e.review_status === 'pending') return <span className="text-amber-400"> · In review</span>
  if (e.review_status === 'rejected') return <span className="text-danger"> · Not approved{e.review_note ? `: ${e.review_note}` : ''}</span>
  return ' · Custom'
}

export function ExerciseList({ onPick, multi, openId }: { onPick?: (ex: Exercise[]) => void; multi?: boolean; openId?: string }) {
  const [all, setAll] = useState<Exercise[] | null>(null)
  const [usage, setUsage] = useState<Usage>(new Map())
  const [usageLoaded, setUsageLoaded] = useState(false)
  const [personal, setPersonal] = useState<Exercise | null>(null)
  const [merging, setMerging] = useState(false)
  const dupes = useMemo(() => (all ? findDuplicates(all) : []), [all])
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  // Adding to a workout or routine opens on your most-performed lifts; browsing the library opens on All.
  const [show, setShow] = useState<Show>(onPick ? 'most' : 'all')
  const [sort, setSort] = useState<Sort>(onPick ? 'most' : 'name')
  const [picked, setPicked] = useState<Exercise[]>([])
  const [form, setForm] = useState<{ ex?: Exercise; review?: boolean } | null>(null)
  const [info, setInfo] = useState<Exercise | null>(null)
  const [err, setErr] = useState('')

  const reload = (force = false) => loadExercises(force).then(setAll).catch((e) => setErr(errMsg(e)))
  useEffect(() => {
    reload()
    loadUsage().then((u) => {
      setUsage(u)
      // Nothing logged yet (new account): "Most performed" would be empty, so show everything instead.
      if (!u.size && onPick) { setShow('all'); setSort('name') }
    }).catch(() => {}).finally(() => setUsageLoaded(true))
  }, [])

  // Deep link (e.g. from a "wasn't approved" notification): open that exercise's form once the library loads.
  const [opened, setOpened] = useState(false)
  useEffect(() => {
    if (!openId || opened || !all) return
    const e = all.find((x) => x.id === openId)
    if (e) { setOpened(true); if (e.owner === me()) setForm({ ex: e, review: e.review_status === 'rejected' }); else setInfo(e) }
  }, [openId, opened, all])

  // Choosing a "show" filter also switches to its natural sort; the sort menu can still override it.
  const pickShow = (v: Show) => { setShow(v); setSort(v === 'all' ? 'name' : v) }

  // Alternative name that matched a search, per exercise id (shown as "aka …" under the result).
  const [via, list] = useMemo(() => {
    const monthAgo = Date.now() - 30 * 86400000
    const count = (e: Exercise) => usage.get(e.id)?.count ?? 0
    const last = (e: Exercise) => usage.get(e.id)?.last ?? 0
    const base = (all ?? []).filter((e) => !muscle || e.muscle === muscle)
    if (q.trim()) {
      // Searching looks through every exercise (not just Most performed / Recent), best match first.
      const hits = searchExercises(base, q)
      return [new Map(hits.filter((h) => h.via).map((h) => [h.item.id, h.via!])), hits.map((h) => h.item)] as const
    }
    let l = base
    if (show === 'most') l = l.filter((e) => count(e) > 0)
    if (show === 'recent') l = l.filter((e) => last(e) >= monthAgo)
    return [new Map<string, string>(), [...l].sort((a, b) =>
      sort === 'most' ? count(b) - count(a) || last(b) - last(a) || a.name.localeCompare(b.name)
        : sort === 'recent' ? last(b) - last(a) || a.name.localeCompare(b.name)
          : a.name.localeCompare(b.name))] as const
  }, [all, q, muscle, show, sort, usage])

  const tap = (e: Exercise) => {
    if (!onPick) return openEdit(e)
    if (!multi) return onPick([e])
    setPicked((p) => (p.some((x) => x.id === e.id) ? p.filter((x) => x.id !== e.id) : [...p, e]))
  }

  // Your own custom exercise: edit it directly. Official ones: save a personal version only you see.
  const openEdit = (e: Exercise) => (e.owner === me() ? setForm({ ex: e }) : setPersonal(e))

  const act = (p: Promise<unknown>) => p.then(() => reload(true)).catch((x) => alert(errMsg(x)))
  const remove = (e: Exercise) => confirm(`Delete "${e.name}"?`) && act(pb.collection('exercises').delete(e.id))
  const submit = (e: Exercise) => {
    if (e.review_status === 'rejected') return setForm({ ex: e, review: true })
    // Submissions need how-to and logging notes; open the form if they're missing.
    if ((e.instructions || '').trim().length < 20 || (e.log_tip || '').trim().length < 10) return setForm({ ex: e, review: true })
    if (confirm(`Submit "${e.name}" for review? If approved it becomes an official exercise everyone can use.`)) act(pb.collection('exercises').update(e.id, { review_status: 'pending' }))
  }
  const withdraw = (e: Exercise) => act(pb.collection('exercises').update(e.id, { review_status: '' }))

  const fmtUse = (e: Exercise) => {
    const u = usage.get(e.id)
    return u ? ` · ${u.count}× · ${timeAgo(new Date(u.last).toISOString())}` : ''
  }

  return (
    <div className="space-y-3 pb-24">
      <div className="relative">
        <SearchIcon width={18} height={18} className="absolute left-3 top-3.5 text-faint" />
        <Input placeholder="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <div className="flex gap-2">
        <div className="flex flex-1 rounded-xl bg-surface-2 p-1">
          {([['all', 'All'], ['most', 'Most performed'], ['recent', 'Recent']] as [Show, string][]).map(([v, l]) => (
            <button key={v} onClick={() => pickShow(v)} className={`h-8 flex-1 rounded-lg text-xs font-bold transition ${show === v ? 'bg-accent text-accent-ink' : 'text-muted'}`}>{l}</button>
          ))}
        </div>
        <label className="sr-only" htmlFor="ex-sort">Sort</label>
        <select id="ex-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-10 rounded-xl border border-line bg-surface-2 px-2 text-xs font-bold text-ink">
          <option value="name">A → Z</option>
          <option value="most">Most performed</option>
          <option value="recent">Recently performed</option>
        </select>
      </div>
      <Chips value={muscle} onChange={setMuscle} options={[['', 'All muscles'], ...MUSCLES.map((m) => [m, label(m)] as [string, string])]} />
      <Button variant="ghost" onClick={() => setForm({})}>+ Create custom exercise</Button>
      {!onPick && dupes.length > 0 && (
        <button onClick={() => setMerging(true)} className="flex w-full items-center gap-3 rounded-2xl border border-accent/40 bg-accent/10 p-3 text-left">
          <span className="text-2xl">🔗</span>
          <span className="min-w-0 flex-1"><span className="block font-bold">{dupes.length} exercise{dupes.length === 1 ? '' : 's'} look like official ones</span>
            <span className="block text-sm text-muted">e.g. “{dupes[0].from.name}” is “{dupes[0].to.name}”. Merge them so your history lives in one place.</span></span>
          <span className="font-bold text-accent">Review</span>
        </button>
      )}
      <ErrorText>{err}</ErrorText>
      {!all || (show !== 'all' && !q.trim() && !usageLoaded) ? <Spinner /> : (
        <Card className="p-0">
          {list.map((e) => {
            const sel = picked.some((x) => x.id === e.id)
            const mine = e.owner === me()
            return (
              <div key={e.id} onClick={() => tap(e)} className={`flex items-center justify-between gap-2 border-b border-line py-3 pl-4 pr-2 last:border-0 active:bg-surface-2 ${sel ? 'bg-accent/10' : ''}`}>
                <div className="min-w-0">
                  <p className={`truncate font-semibold ${sel ? 'text-accent' : ''}`}>{e.name}</p>
                  {via.get(e.id) && <p className="truncate text-xs text-muted">aka {via.get(e.id)}</p>}
                  <p className="text-xs text-muted">{label(e.muscle)} · {label(e.equipment)}{fmtUse(e)}{status(e)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(ev) => ev.stopPropagation()}>
                  {!onPick && mine && (e.review_status === 'pending'
                    ? <button onClick={() => withdraw(e)} className="h-8 rounded-lg bg-surface-2 px-2.5 text-xs font-bold text-muted">Withdraw</button>
                    : <button onClick={() => submit(e)} className="h-8 rounded-lg bg-surface-2 px-2.5 text-xs font-bold text-accent">{e.review_status === 'rejected' ? 'Resubmit' : 'Submit'}</button>)}
                  {!onPick && mine && <button onClick={() => remove(e)} className="p-2 text-faint" aria-label="Delete"><TrashIcon width={18} height={18} /></button>}
                  <button onClick={() => setInfo(e)} className="grid size-9 place-items-center rounded-full text-muted active:bg-surface-2" aria-label={`About ${e.name}`}><InfoIcon width={20} height={20} /></button>
                </div>
              </div>
            )
          })}
          {!list.length && <p className="p-6 text-center text-sm text-muted">{show === 'all' ? 'No matches.' : show === 'most' ? "You haven't logged any of these yet." : 'Nothing logged in the last 30 days.'}</p>}
        </Card>
      )}
      {multi && picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-lg px-safe pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button onClick={() => onPick?.(picked)}>Add {picked.length} exercise{picked.length > 1 ? 's' : ''}</Button>
        </div>
      )}
      {form && <ExerciseForm initial={form.ex} lib={all ?? []} name0={q} review0={form.review} onClose={() => setForm(null)} onSaved={(e) => { setForm(null); reload(true); if (!form.ex) setQ(e.name) }} />}
      {info && <ExerciseInfo ex={info} usage={usage} onClose={() => setInfo(null)} onEdit={() => { const e = info; setInfo(null); openEdit(e) }} />}
      {merging && all && <MergeDuplicates lib={all} usage={usage} onClose={() => setMerging(false)} onDone={() => { setMerging(false); reload(true); loadUsage().then(setUsage).catch(() => {}) }} />}
      {personal && <PersonalEditForm ex={personal} onClose={() => setPersonal(null)} onSaved={() => { setPersonal(null); reload(true) }} />}
    </div>
  )
}

const areaCls = 'w-full rounded-xl border border-line bg-surface-2 p-3 text-base text-ink outline-none placeholder:text-faint focus:border-accent'

/** Create or edit a custom exercise. Submitting for review requires how-to + logging notes. */
function ExerciseForm({ initial, lib, name0, review0, onClose, onSaved }: { initial?: Exercise; lib: Exercise[]; name0: string; review0?: boolean; onClose: () => void; onSaved: (e: Exercise) => void }) {
  const [mergeTo, setMergeTo] = useState('')
  const [mergeMsg, setMergeMsg] = useState('')
  const n0 = initial?.name ?? name0
  const [name, setName] = useState(n0)
  const [muscle, setMuscle] = useState(initial?.muscle ?? guessMuscle(n0))
  const [secondary, setSecondary] = useState<string[]>(initial?.secondary ?? [])
  const [equipment, setEquipment] = useState(initial?.equipment ?? guessEquipment(n0))
  const [kind, setKind] = useState<Kind>(initial?.kind ?? guessKind(n0))
  const [instructions, setInstructions] = useState(initial?.instructions ?? '')
  const [logTip, setLogTip] = useState(initial?.log_tip || '')
  const [review, setReview] = useState(review0 ?? initial?.review_status === 'pending')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const tip = logTip || defaultLogTip(kind, equipment)
  const instrOk = instructions.trim().length >= 20
  const tipOk = tip.trim().length >= 10
  const toggleSec = (m: string) => setSecondary((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))

  const save = async () => {
    if (review && (!instrOk || !tipOk)) return setErr('To submit for review, describe how to perform it (20+ characters) and how to log it.')
    setErr(''); setBusy(true)
    const data = {
      name: name.trim(), muscle, secondary: secondary.filter((m) => m !== muscle), equipment, kind,
      instructions: instructions.trim(), log_tip: tip.trim(), review_status: review ? 'pending' : initial?.review_status === 'pending' ? '' : (initial?.review_status ?? ''),
    }
    try {
      onSaved(initial ? await pb.collection('exercises').update<Exercise>(initial.id, data) : await pb.collection('exercises').create<Exercise>({ ...data, owner: me() }))
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <Sheet title={initial ? (initial.review_status === 'rejected' ? 'Edit & resubmit' : 'Edit exercise') : 'New exercise'} onClose={onClose}>
      <div className="space-y-3 pb-8">
        {initial?.review_status === 'rejected' && (
          <div className="rounded-2xl border border-danger/40 bg-danger/10 p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-danger">Not approved — note from the admin</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{initial.review_note || 'No note was left. Check the details below and try again.'}</p>
            <p className="mt-2 text-xs text-muted">Fix what's mentioned, then save to resubmit it for review.</p>
          </div>
        )}
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!initial} />
        <Select label="Primary muscle" value={muscle} onChange={setMuscle} options={MUSCLES.map((m) => [m, label(m)])} />
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Secondary muscles</span>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.filter((m) => m !== muscle && m !== 'cardio' && m !== 'full_body').map((m) => (
              <button key={m} type="button" onClick={() => toggleSec(m)} className={`h-8 rounded-full px-3 text-sm font-semibold ${secondary.includes(m) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{label(m)}</button>
            ))}
          </div>
        </div>
        <Select label="Equipment" value={equipment} onChange={setEquipment} options={EQUIPMENT.map((m) => [m, label(m)])} />
        <Select label="Tracking (how sets are logged)" value={kind} onChange={(v) => setKind(v as Kind)} options={KINDS} />
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to perform {review && <span className="text-danger">*</span>}</span>
          <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={areaCls}
            placeholder={'One step per line, e.g.\nSet up with…\nLower the weight…\nPress back up…'} />
          {review && !instrOk && <span className="text-xs text-muted">{20 - instructions.trim().length} more characters needed</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to log it {review && <span className="text-danger">*</span>}</span>
          <textarea rows={2} value={logTip} onChange={(e) => setLogTip(e.target.value)} className={areaCls} placeholder={defaultLogTip(kind, equipment)} />
        </label>
        <Toggle on={review} onChange={setReview} title="Submit for review"
          body="Suggest this as an official exercise for everyone. You can use it right away while it's reviewed." />
        <ErrorText>{err}</ErrorText>
        <Button onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : review ? 'Save & submit' : 'Save exercise'}</Button>
        {initial && (
          <div className="space-y-2 border-t border-line pt-4">
            <p className="text-sm font-bold">Merge into another exercise</p>
            <p className="text-xs text-muted">Same movement as one you already have? Moves all of this exercise's history and routine entries there, then deletes this custom exercise.</p>
            <Select value={mergeTo} onChange={setMergeTo} options={[['', 'Choose an exercise…'], ...lib.filter((e) => e.id !== initial.id && e.kind === initial.kind).map((e) => [e.id, `${e.name}${e.owner ? ' (custom)' : ''}`] as [string, string])]} />
            {mergeMsg && <p className="text-xs font-semibold text-muted">{mergeMsg}</p>}
            <Button variant="ghost" disabled={!mergeTo || busy} onClick={async () => {
              const to = lib.find((e) => e.id === mergeTo)
              if (!to || !confirm(`Merge “${initial.name}” into “${to.name}”? All its sets move over and it gets deleted. This can’t be undone.`)) return
              setBusy(true); setErr('')
              try { const n = await mergeExercise(initial.id, to.id, setMergeMsg); invalidateStats(); clearBestCache(); setMergeMsg(`Moved ${n} sets.`); onSaved(to) }
              catch (e) { setErr(errMsg(e)); setBusy(false) }
            }}>Merge</Button>
          </div>
        )}
      </div>
    </Sheet>
  )
}

export function ExercisePicker({ onPick, onClose }: { onPick: (ex: Exercise[]) => void; onClose: () => void }) {
  return <Sheet title="Add exercises" onClose={onClose}><ExerciseList onPick={onPick} multi /></Sheet>
}

/** Edit an official exercise just for yourself (stored as a personal override). Optionally suggest it to everyone. */
function PersonalEditForm({ ex, onClose, onSaved }: { ex: Exercise; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(ex.name)
  const [muscle, setMuscle] = useState(ex.muscle)
  const [secondary, setSecondary] = useState<string[]>(ex.secondary ?? [])
  const [equipment, setEquipment] = useState(ex.equipment)
  const [instructions, setInstructions] = useState(ex.instructions ?? '')
  const [logTip, setLogTip] = useState(ex.log_tip ?? '')
  const [suggest, setSuggest] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const toggleSec = (m: string) => setSecondary((s) => (s.includes(m) ? s.filter((x) => x !== m) : [...s, m]))

  const save = async () => {
    setErr(''); setBusy(true)
    const data = { name: name.trim(), muscle, secondary: secondary.filter((m) => m !== muscle), equipment, instructions: instructions.trim(), log_tip: logTip.trim() }
    try {
      if (ex.override) await pb.collection('exercise_overrides').update(ex.override, data)
      else await pb.collection('exercise_overrides').create({ ...data, user: me(), exercise: ex.id })
      if (suggest) await pb.collection('feedback').create({ user: me(), type: 'edit_request', exercise: ex.id, message: `Suggested edit for ${ex.name}`, proposal: data })
      onSaved()
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const reset = async () => {
    if (!ex.override || !confirm('Reset this exercise to the official version?')) return
    try { await pb.collection('exercise_overrides').delete(ex.override); onSaved() } catch (e) { setErr(errMsg(e)) }
  }

  return (
    <Sheet title="Edit exercise" onClose={onClose}>
      <div className="space-y-3 pb-8">
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">This is an official exercise. Your changes only apply to <span className="font-bold text-ink">you</span> — everyone else keeps the original. Your logged sets aren't affected.</p>
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Primary muscle" value={muscle} onChange={setMuscle} options={MUSCLES.map((m) => [m, label(m)])} />
        <div>
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Secondary muscles</span>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.filter((m) => m !== muscle && m !== 'cardio' && m !== 'full_body').map((m) => (
              <button key={m} type="button" onClick={() => toggleSec(m)} className={`h-8 rounded-full px-3 text-sm font-semibold ${secondary.includes(m) ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{label(m)}</button>
            ))}
          </div>
        </div>
        <Select label="Equipment" value={equipment} onChange={setEquipment} options={EQUIPMENT.map((m) => [m, label(m)])} />
        <p className="text-xs text-muted">Tracking type: {KINDS.find(([k]) => k === ex.kind)?.[1]} (can't change on official exercises — it would mix up your logged sets)</p>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to perform</span>
          <textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={areaCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">How to log it</span>
          <textarea rows={2} value={logTip} onChange={(e) => setLogTip(e.target.value)} className={areaCls} />
        </label>
        <Toggle on={suggest} onChange={setSuggest} title="Also suggest this to everyone" body="Sends your edit for review. If accepted, the official exercise is updated for all users." />
        <ErrorText>{err}</ErrorText>
        <Button onClick={save} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save for me'}</Button>
        {ex.override && <Button variant="ghost" onClick={reset}>Reset to official version</Button>}
      </div>
    </Sheet>
  )
}

/** Review and merge custom exercises that duplicate an official one (e.g. imported "Bench Press"). */
function MergeDuplicates({ lib, usage, onClose, onDone }: { lib: Exercise[]; usage: Usage; onClose: () => void; onDone: () => void }) {
  const pairs = useMemo(() => findDuplicates(lib), [lib])
  const [on, setOn] = useState<Set<string>>(() => new Set(pairs.map((p) => p.from.id)))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const toggle = (id: string) => setOn((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const run = async () => {
    setBusy(true); setErr('')
    let moved = 0
    try {
      for (const p of pairs.filter((x) => on.has(x.from.id))) {
        moved += await mergeExercise(p.from.id, p.to.id, (m) => setMsg(`${p.from.name} → ${p.to.name}: ${m}`))
      }
      invalidateStats(); clearBestCache()
      setMsg(`Done — merged ${on.size} exercise${on.size === 1 ? '' : 's'} (${moved} sets).`)
      setTimeout(onDone, 900)
    } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  return (
    <Sheet title="Merge duplicates" onClose={() => { if (!busy) onClose() }}>
      <div className="space-y-3 pb-8">
        <p className="text-sm text-muted">These custom exercises (mostly from your Liftoff import) look like official ones. Merging moves all their sets and routine entries to the official exercise and deletes the duplicate. Untick any that are actually a different movement.</p>
        <Card className="p-0">
          {pairs.map((p) => (
            <label key={p.from.id} className="flex cursor-pointer items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <input type="checkbox" checked={on.has(p.from.id)} onChange={() => toggle(p.from.id)} disabled={busy} className="size-5 shrink-0 accent-[var(--color-accent)]" />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">{p.from.name}</span> <span className="text-muted">→</span> <span className="font-semibold text-accent">{p.to.name}</span>
                <span className="block text-xs text-muted">{usage.get(p.from.id)?.count ?? 0} workouts</span>
              </span>
            </label>
          ))}
        </Card>
        {msg && <p className="text-sm font-semibold text-muted">{msg}</p>}
        <ErrorText>{err}</ErrorText>
        <Button onClick={run} disabled={busy || !on.size}>{busy ? 'Merging…' : `Merge ${on.size} exercise${on.size === 1 ? '' : 's'}`}</Button>
      </div>
    </Sheet>
  )
}
