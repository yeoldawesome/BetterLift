import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircleIcon } from '../components/icons'
import { Button, Spinner } from '../components/ui'
import { errMsg, pb } from '../lib/pb'

/** Opened from the verification email. Works signed in or out. */
export default function VerifyEmail() {
  const { token = '' } = useParams()
  const [state, setState] = useState<'busy' | 'done' | string>('busy')

  useEffect(() => {
    pb.collection('users').confirmVerification(token)
      .then(async () => {
        // Signed in on this device: pick up verified = true so the banner goes away.
        if (pb.authStore.isValid) await pb.collection('users').authRefresh().catch(() => {})
        setState('done')
      })
      .catch((x) => {
        const st = (x as { status?: number }).status
        setState(st === 400 ? 'This link has expired or was already used. If the banner in the app still asks you to verify, tap Resend there.' : errMsg(x))
      })
  }, [token])

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center gap-4 px-safe py-10 pt-safe text-center">
        <img src="/icon.svg" alt="" className="mx-auto size-16 rounded-2xl" />
        {state === 'busy' ? <Spinner /> : state === 'done' ? (
          <>
            <CheckCircleIcon width={44} height={44} className="mx-auto text-accent" aria-hidden />
            <h1 className="text-2xl font-black">Email verified</h1>
            <p className="text-muted">Thanks! Your account is all set.</p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black">Couldn't verify</h1>
            <p className="text-muted">{state}</p>
          </>
        )}
        {state !== 'busy' && <Link to="/"><Button>Open Better Lift</Button></Link>}
      </div>
    </main>
  )
}
