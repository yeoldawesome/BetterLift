import { useEffect, useState } from 'react'

/**
 * In-app replacements for the browser's confirm() / alert(): themed, centred over a blurred backdrop, and they look the
 * same in the installed iPhone app (where the browser ones show the page's address). Call from anywhere:
 *   if (await ask({ title: 'Discard this workout?', confirmLabel: 'Discard', danger: true })) …
 *   tell('Something went wrong')
 */

type Ask = { title: string; body?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean; alert?: boolean }
type Open = Ask & { resolve: (ok: boolean) => void }

let push: ((d: Open) => void) | null = null
const queue: Open[] = []

/** Ask a yes/no question. Resolves true when confirmed. */
export function ask(opts: Ask | string): Promise<boolean> {
  const o = typeof opts === 'string' ? { title: opts } : opts
  return new Promise((resolve) => {
    const d = { ...o, resolve }
    if (push) push(d)
    else queue.push(d)
  })
}

/** Show a message with a single OK button. */
export function tell(title: string, body?: string): Promise<void> {
  return ask({ title, body, confirmLabel: 'OK', alert: true }).then(() => undefined)
}

/** Mount once near the app root; renders whichever dialog is open. */
export function DialogHost() {
  const [list, setList] = useState<Open[]>([])
  useEffect(() => {
    push = (d) => setList((l) => [...l, d])
    if (queue.length) setList((l) => [...l, ...queue.splice(0)])
    return () => { push = null }
  }, [])
  const d = list[0]
  useEffect(() => {
    if (!d) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); if (e.key === 'Enter') close(true) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  if (!d) return null
  const close = (ok: boolean) => { d.resolve(ok); setList((l) => l.slice(1)) }
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm" onClick={() => close(false)} role="dialog" aria-modal="true" aria-label={d.title}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm animate-[pop_.16s_ease-out] rounded-3xl border border-line bg-surface p-5 shadow-2xl">
        <h2 className="text-lg font-extrabold leading-snug">{d.title}</h2>
        {d.body && <p className="mt-1.5 text-sm text-muted">{d.body}</p>}
        <div className={`mt-5 grid gap-2 ${d.alert ? '' : 'grid-cols-2'}`}>
          {!d.alert && <button onClick={() => close(false)} className="h-12 rounded-2xl bg-surface-2 font-bold">{d.cancelLabel ?? 'Cancel'}</button>}
          <button autoFocus onClick={() => close(true)} className={`h-12 rounded-2xl font-bold ${d.danger ? 'bg-danger text-white' : 'bg-accent text-accent-ink'}`}>{d.confirmLabel ?? 'OK'}</button>
        </div>
      </div>
    </div>
  )
}
