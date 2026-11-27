import { useEffect, useState } from 'react'
import { idbGet, idbSet } from './idb'
import { pb } from './pb'

/**
 * Offline-first writes. Changes are applied on the device right away (the screen updates at once) and queued here;
 * the queue uploads in order whenever there's a connection: on launch, when the app comes back to the screen, when
 * the network returns, and every 30 seconds. It survives closing the app (IndexedDB).
 *
 * New records get their id on the device (PocketBase accepts a client id), so a retried create can't make a
 * duplicate, and later edits/deletes of a not-yet-uploaded record line up with it.
 */
export type Op =
  | { kind: 'create'; coll: string; id: string; body: Record<string, unknown> }
  | { kind: 'update'; coll: string; id: string; body: Record<string, unknown> }
  | { kind: 'delete'; coll: string; id: string }

type Queued = Op & { seq: number; at: number }

let queue: Queued[] = []
let loadedFor = ''
let seq = 0
let flushing: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
const key = (u: string) => `outbox:${u}`
const uid = () => pb.authStore.record?.id ?? ''

// One load per account; everyone waits on the same one, so a change queued mid-load can't be overwritten by it.
let loading: Promise<void> | null = null
let loadingFor = ''
function ensureLoaded(): Promise<void> {
  const u = uid()
  if (!u) return Promise.resolve()
  if (loadingFor !== u || !loading) {
    loadingFor = u
    loading = idbGet<Queued[]>(key(u)).then((saved) => {
      if (loadingFor !== u) return
      queue = (saved ?? []).filter((o) => o && o.coll)
      seq = Math.max(0, ...queue.map((o) => o.seq))
      loadedFor = u
      emit()
    })
  }
  return loading
}
const persist = () => { const u = uid(); if (u) idbSet(key(u), queue) }

/** Queue a change (already applied locally by the caller) and try to upload now. */
export async function enqueue(op: Op) {
  await ensureLoaded()
  // Deleting something that never reached the server: just forget it (and its pending edits).
  if (op.kind === 'delete' && queue.some((q) => q.kind === 'create' && q.coll === op.coll && q.id === op.id)) {
    queue = queue.filter((q) => !(q.coll === op.coll && q.id === op.id))
  } else if (op.kind === 'update') {
    // Fold an edit into a not-yet-sent create/update of the same record.
    const prev = [...queue].reverse().find((q) => q.coll === op.coll && q.id === op.id && (q.kind === 'create' || q.kind === 'update'))
    if (prev && prev.kind !== 'delete' && !Object.keys(op.body).some((k) => /[+-]$/.test(k))) prev.body = { ...prev.body, ...op.body }
    else queue.push({ ...op, seq: ++seq, at: Date.now() })
  } else {
    queue.push({ ...op, seq: ++seq, at: Date.now() })
  }
  persist(); emit()
  flush()
}

/** Changes not uploaded yet for a collection (to lay over what the server returns). */
export async function pending(coll: string) {
  await ensureLoaded()
  return queue.filter((q) => q.coll === coll)
}

const isNetwork = (e: unknown) => { const s = (e as { status?: number })?.status; return s === 0 || s === undefined }
const isGone = (e: unknown) => (e as { status?: number })?.status === 404
const isDuplicate = (e: unknown) => {
  const d = (e as { response?: { data?: Record<string, { code?: string }> } })?.response?.data
  return !!d?.id && /not_unique|unique/i.test(d.id.code ?? '')
}

/** Upload everything queued, oldest first. Stops at the first network failure and tries again later. */
export function flush(): Promise<void> {
  if (flushing) return flushing
  flushing = (async () => {
    await ensureLoaded()
    while (queue.length && pb.authStore.isValid) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) break
      const op = queue[0]
      try {
        const c = pb.collection(op.coll)
        if (op.kind === 'create') await c.create({ ...op.body, id: op.id }, { requestKey: null })
        else if (op.kind === 'update') await c.update(op.id, op.body, { requestKey: null })
        else await c.delete(op.id, { requestKey: null })
      } catch (e) {
        if (isNetwork(e)) break // offline / server unreachable: keep it for later
        const s = (e as { status?: number })?.status
        if (s === 401 || s === 403) break // signed out: wait for sign-in
        // Already there (a retry after a lost response), already gone, or rejected: nothing more to do with it.
        if (!(op.kind === 'create' && isDuplicate(e)) && !isGone(e)) console.warn('Dropped an offline change the server rejected', op, e)
      }
      queue.shift()
      persist(); emit()
    }
  })().finally(() => { flushing = null })
  return flushing
}

/** How many changes are waiting to upload, and whether the device is online. Re-renders as either changes. */
export function useOutbox() {
  const [, tick] = useState(0)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    const f = () => tick((t) => t + 1)
    const on = () => setOnline(navigator.onLine)
    listeners.add(f)
    addEventListener('online', on); addEventListener('offline', on)
    ensureLoaded()
    return () => { listeners.delete(f); removeEventListener('online', on); removeEventListener('offline', on) }
  }, [])
  return { waiting: loadedFor === uid() ? queue.length : 0, online }
}

// Upload whenever there's a chance: launch, network back, app back on screen, and every 30 s.
if (typeof window !== 'undefined') {
  const kick = () => { if (pb.authStore.isValid) flush() }
  addEventListener('online', kick)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick() })
  setInterval(kick, 30_000)
  setTimeout(kick, 1500)
  pb.authStore.onChange(() => { ensureLoaded().then(kick) })
}
