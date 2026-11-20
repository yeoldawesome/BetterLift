import { useEffect, useState } from 'react'
import { MailIcon } from '../components/icons'
import { Button, ErrorText } from '../components/ui'
import { errMsg, pb, type User } from '../lib/pb'

const refresh = () => pb.collection('users').authRefresh()

/** New accounts land here until they tap the link in their verification email. */
export default function VerifyGate({ user }: { user: User }) {
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<'' | 'send' | 'check'>('')

  // Verifying usually happens in the mail app / another tab: re-check when they come back, and every few seconds.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') refresh().catch(() => {}) }
    const t = setInterval(check, 5000)
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check) }
  }, [])

  const resend = async () => {
    setBusy('send'); setErr(''); setMsg('')
    try {
      await pb.collection('users').requestVerification(user.email!)
      setMsg(`Sent! Check ${user.email} (and your spam folder).`)
    } catch (e) {
      setErr((e as { status?: number }).status === 429 ? 'Already sent a few. Wait a few minutes and try again.' : errMsg(e))
    } finally { setBusy('') }
  }

  const check = async () => {
    setBusy('check'); setErr(''); setMsg('')
    try {
      const r = await refresh()
      if (!(r.record as User).verified) setErr("Not verified yet. Tap the link in the email, then try again.")
    } catch (e) { setErr(errMsg(e)) } finally { setBusy('') }
  }

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 px-safe py-10 pt-safe text-center">
        <MailIcon width={44} height={44} className="mx-auto text-accent" aria-hidden />
        <h1 className="text-2xl font-black">Verify your email</h1>
        <p className="text-muted">We sent a link to <span className="break-all font-bold text-ink">{user.email}</span>. Tap it to finish setting up your account.</p>
        <Button onClick={check} disabled={!!busy}>{busy === 'check' ? 'Checking…' : "I've verified"}</Button>
        <Button variant="ghost" onClick={resend} disabled={!!busy}>{busy === 'send' ? 'Sending…' : 'Resend email'}</Button>
        {msg && <p className="text-sm font-semibold text-accent">{msg}</p>}
        <ErrorText>{err}</ErrorText>
        <button onClick={() => pb.authStore.clear()} className="text-sm font-semibold text-muted">Use a different account</button>
      </div>
    </main>
  )
}
