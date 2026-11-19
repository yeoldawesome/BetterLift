import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PasswordField } from '../components/PasswordField'
import { Button, ErrorText } from '../components/ui'
import { checkPassword } from '../lib/password'
import { errMsg, pb } from '../lib/pb'

/** Opened from the reset email: choose a new password. Works signed in or out; every session is signed out after. */
export default function ResetPassword() {
  const { token = '' } = useParams()
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const s = checkPassword(pw)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setErr('')
    if (!s.ok) return setErr(s.problem)
    if (pw !== confirm) return setErr("Passwords don't match.")
    setBusy(true)
    try {
      await pb.collection('users').confirmPasswordReset(token, pw, confirm)
      pb.authStore.clear() // the reset signs out every device, including this one
      setDone(true)
    } catch (x) {
      const st = (x as { status?: number }).status
      setErr(st === 429 ? 'Too many attempts. Wait a few minutes and try again.'
        : st === 400 && /token/i.test(errMsg(x)) ? 'This reset link has expired or was already used. Request a new one from the log-in screen.'
        : errMsg(x))
    } finally { setBusy(false) }
  }

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-safe py-10 pt-safe">
        <img src="/icon.svg" alt="" className="mb-6 size-16 rounded-2xl" />
        {done ? (
          <>
            <h1 className="text-3xl font-black tracking-tight">Password changed</h1>
            <p className="mb-6 mt-2 text-muted">You've been signed out everywhere. Log in with your new password.</p>
            <Link to="/" className="flex h-12 items-center justify-center rounded-2xl bg-accent font-bold text-accent-ink">Go to log in</Link>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-black tracking-tight">Choose a new password</h1>
            <p className="mb-6 mt-2 text-muted">This signs you out on every device.</p>
            <form onSubmit={submit} className="space-y-3">
              <PasswordField value={pw} onChange={setPw} placeholder="New password (10+ characters)" autoComplete="new-password" meter />
              <PasswordField value={confirm} onChange={setConfirm} placeholder="Confirm new password" autoComplete="new-password" />
              <ErrorText>{err}</ErrorText>
              <Button disabled={busy || !s.ok || !confirm}>{busy ? 'Saving…' : 'Save new password'}</Button>
            </form>
            <Link to="/" className="mt-4 text-center text-sm font-semibold text-accent">Back to log in</Link>
          </>
        )}
      </div>
    </main>
  )
}
