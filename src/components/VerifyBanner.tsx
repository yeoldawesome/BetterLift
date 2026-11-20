import { useState } from 'react'
import { errMsg, pb, type User } from '../lib/pb'
import { CloseIcon } from './icons'

/** Shown until the account's email is verified. Hiding it lasts until the app is reopened. */
let hidden = false

export function VerifyBanner({ user }: { user: User }) {
  const [gone, setGone] = useState(hidden)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  if (user.verified || gone || !user.email) return null

  const resend = async () => {
    setBusy(true)
    try {
      await pb.collection('users').requestVerification(user.email!)
      setMsg(`Sent! Check ${user.email} (and your spam folder).`)
    } catch (e) {
      setMsg((e as { status?: number }).status === 429 ? 'Already sent a few. Wait a few minutes and try again.' : errMsg(e))
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto flex w-full max-w-lg items-start gap-3 px-safe pb-2">
      <div className="flex flex-1 items-start gap-3 rounded-xl border border-accent/40 bg-surface p-3 text-sm">
        <span className="text-lg leading-none">✉️</span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Verify your email</p>
          <p className="text-muted">{msg || <>Tap the link we sent to <span className="break-all">{user.email}</span>.</>}</p>
          {!msg && <button onClick={resend} disabled={busy} className="mt-1 font-bold text-accent">{busy ? 'Sending…' : 'Resend email'}</button>}
        </div>
        <button onClick={() => { hidden = true; setGone(true) }} aria-label="Hide" className="text-muted"><CloseIcon width={18} height={18} /></button>
      </div>
    </div>
  )
}
