import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { avatarUrl, type User } from '../lib/pb'
import { BackIcon, ChevronIcon, CloseIcon } from './icons'

export function Screen({ title, action, back, children }: { title: string; action?: ReactNode; back?: boolean; children: ReactNode }) {
  const nav = useNavigate()
  return (
    <section className="mx-auto max-w-lg px-safe pt-4">
      {back && (
        <button onClick={() => nav(-1)} className="-ml-1 mb-2 flex items-center gap-1 text-sm font-semibold text-accent">
          <BackIcon width={20} height={20} /> Back
        </button>
      )}
      <header className="mb-5 flex items-end justify-between gap-3">
        <h1 className="truncate text-[32px] font-extrabold leading-none tracking-tight">{title}</h1>
        {action}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

export function Card({ className = '', children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  return <div onClick={onClick} className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</div>
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger'; size?: 'md' | 'sm' }
export function Button({ variant = 'primary', size = 'md', className = '', ...p }: BtnProps) {
  const v = { primary: 'bg-accent text-accent-ink', ghost: 'bg-surface-2 text-ink', danger: 'bg-danger/15 text-danger' }[variant]
  const s = size === 'md' ? 'h-12 w-full px-4 text-base' : 'h-9 px-3 text-sm'
  return <button {...p} className={`shrink-0 rounded-2xl font-bold transition active:scale-[0.98] disabled:opacity-40 ${s} ${v} ${className}`} />
}

export function Input({ label, className = '', ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const input = <input {...p} className={`h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-ink outline-none placeholder:text-faint focus:border-accent ${className}`} />
  return label ? <label className="block"><span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>{input}</label> : input
}

export function Select({ label, value, onChange, options }: { label?: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block">
      {label && <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-ink outline-none focus:border-accent">
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-surface-2 p-1">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`h-9 flex-1 rounded-lg text-sm font-bold transition ${value === v ? 'bg-ink text-canvas' : 'text-muted'}`}>{l}</button>
      ))}
    </div>
  )
}

export function Chips({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`h-8 shrink-0 rounded-full px-3 text-sm font-semibold ${value === v ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-muted'}`}>{l}</button>
      ))}
    </div>
  )
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="min-w-0">
      <div className="num truncate text-2xl font-black">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</div>
    </div>
  )
}

export function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  return (
    <Card className="py-10 text-center">
      <p className="text-lg font-bold">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
      {children && <div className="mt-4">{children}</div>}
    </Card>
  )
}

export function Avatar({ user, size = 40 }: { user?: User | null; size?: number }) {
  const src = avatarUrl(user)
  return src
    ? <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <div className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-bold text-muted" style={{ width: size, height: size, fontSize: size * 0.42 }}>{(user?.username || '?')[0].toUpperCase()}</div>
}

export function ListLink({ to, children, badge }: { to: string; children: ReactNode; badge?: ReactNode }) {
  return (
    <Link to={to} className="flex items-center justify-between border-b border-line px-4 py-3.5 last:border-0 active:bg-surface-2">
      <span className="font-semibold">{children}</span>
      <span className="flex items-center gap-2 text-faint">{badge}<ChevronIcon width={18} height={18} /></span>
    </Link>
  )
}

export function Sheet({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-canvas pt-safe">
      <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-3 px-safe py-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold">{title}</h2>
          {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
        </div>
        <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2"><CloseIcon width={18} height={18} /></button>
      </div>
      <div className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-safe pb-safe">{children}</div>
    </div>
  )
}

/** Short sheet that slides up from the bottom over a dimmed backdrop (for pick-one menus). */
export function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])
  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60" onClick={onClose}>
      <div className="mx-auto w-full max-w-lg rounded-t-3xl border-t border-line bg-canvas pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
        <div className="relative px-safe py-3 text-center">
          <h2 className="text-lg font-extrabold">{title}</h2>
          <button onClick={onClose} className="absolute right-3 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-muted" aria-label="Close"><CloseIcon width={18} height={18} /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-safe pb-4">{children}</div>
      </div>
    </div>
  )
}

export function Toggle({ on, onChange, title, body }: { on: boolean; onChange: (v: boolean) => void; title: string; body?: string }) {
  return (
    <button onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface p-3 text-left">
      <span className="min-w-0 flex-1"><span className="block font-bold">{title}</span>{body && <span className="block text-sm text-muted">{body}</span>}</span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-accent' : 'bg-surface-2'}`}>
        <span className={`absolute top-1 size-5 rounded-full bg-ink transition-all ${on ? 'left-6' : 'left-1'}`} />
      </span>
    </button>
  )
}

/** Bottom-sheet confirmation for destructive actions. `typeToConfirm` requires the user to type a word first. */
export function ConfirmSheet({ title, body, confirmLabel = 'Delete', typeToConfirm, onConfirm, onClose }: {
  title: string; body: ReactNode; confirmLabel?: string; typeToConfirm?: string; onConfirm: () => Promise<unknown>; onClose: () => void
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ready = !typeToConfirm || typed.trim().toUpperCase() === typeToConfirm.toUpperCase()
  const go = async () => {
    setBusy(true); setErr('')
    try { await onConfirm(); onClose() } catch (e) { setErr((e as Error)?.message || 'Something went wrong'); setBusy(false) }
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60" onClick={() => !busy && onClose()}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg space-y-3 rounded-t-3xl border-t border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <h2 className="text-xl font-extrabold">{title}</h2>
        <div className="text-sm text-muted">{body}</div>
        {typeToConfirm && <Input placeholder={`Type ${typeToConfirm} to confirm`} autoCapitalize="characters" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />}
        <ErrorText>{err}</ErrorText>
        <button disabled={!ready || busy} onClick={go} className="h-12 w-full rounded-2xl bg-danger font-bold text-white transition active:scale-[0.98] disabled:opacity-40">{busy ? 'Deleting…' : confirmLabel}</button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
      </div>
    </div>
  )
}

export const Spinner = () => <div className="mx-auto my-8 size-7 animate-spin rounded-full border-2 border-line border-t-accent" />

export const ErrorText = ({ children }: { children: ReactNode }) => (children ? <p className="text-sm font-semibold text-danger">{children}</p> : null)
