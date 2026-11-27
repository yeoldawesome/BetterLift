import { useEffect, useState } from 'react'
import { useOutbox } from '../lib/outbox'

/**
 * Small pill at the top while you're offline or changes are waiting to upload ("Offline · 2 changes saved on this
 * phone"). Hidden when everything is uploaded. Brief upload blips (under 2 s) never show.
 */
export function SyncPill() {
  const { waiting, online } = useOutbox()
  const [show, setShow] = useState(false)
  const need = !online || waiting > 0
  useEffect(() => {
    if (!need) { setShow(false); return }
    const t = setTimeout(() => setShow(true), online ? 2000 : 0)
    return () => clearTimeout(t)
  }, [need, online])
  if (!show) return null
  const text = !online
    ? `Offline${waiting ? ` · ${waiting} change${waiting === 1 ? '' : 's'} saved on this phone` : ' · changes save on this phone'}`
    : `Uploading ${waiting} change${waiting === 1 ? '' : 's'}…`
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+0.25rem)] z-[80] flex justify-center px-safe" role="status" aria-live="polite" data-sync-pill>
      <span className="flex items-center gap-1.5 rounded-full border border-line bg-surface-2/95 px-3 py-1 text-xs font-semibold text-muted shadow-lg backdrop-blur">
        <span className={`size-2 rounded-full ${online ? 'animate-pulse bg-accent' : 'bg-amber-400'}`} />{text}
      </span>
    </div>
  )
}
