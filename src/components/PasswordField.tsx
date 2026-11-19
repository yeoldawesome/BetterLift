import { useState } from 'react'
import { checkPassword } from '../lib/password'

/** Password input with a show/hide toggle; `meter` adds the strength bar + rule message for new passwords. */
export function PasswordField({ value, onChange, placeholder = 'Password', autoComplete = 'current-password', meter, ctx, label }: {
  value: string; onChange: (v: string) => void; placeholder?: string; autoComplete?: 'current-password' | 'new-password'
  meter?: boolean; ctx?: { username?: string; email?: string }; label?: string
}) {
  const [show, setShow] = useState(false)
  const s = checkPassword(value, ctx)
  const colors = ['bg-danger', 'bg-danger', 'bg-amber-500', 'bg-accent', 'bg-accent']
  return (
    <div className="space-y-1.5">
      <label className="block">
        {label && <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>}
        <span className="relative block">
          <input type={show ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
            autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={71} required aria-label={label ?? placeholder}
            className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 pr-16 text-base text-ink outline-none placeholder:text-faint focus:border-accent" />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-lg px-2 text-xs font-bold text-muted"
            aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
        </span>
      </label>
      {meter && value && (
        <div className="space-y-1">
          <div className="flex gap-1" aria-hidden>
            {[1, 2, 3, 4].map((i) => <span key={i} className={`h-1.5 flex-1 rounded-full ${s.score >= i ? colors[s.score] : 'bg-surface-2'}`} />)}
          </div>
          <p className={`text-xs font-semibold ${s.ok ? 'text-muted' : 'text-danger'}`}>{s.ok ? `Strength: ${s.label}` : s.problem}</p>
        </div>
      )}
    </div>
  )
}
