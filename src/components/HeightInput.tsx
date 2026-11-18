import { useState } from 'react'
import { CM_IN } from '../lib/format'
import type { Unit } from '../lib/pb'

const inputCls = 'num h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base text-ink outline-none placeholder:text-faint focus:border-accent'

/** Height entry: feet + inches for lb users, centimetres for kg users. Always reports cm (0 if blank). */
export function HeightInput({ cm, unit, onChange, label = 'Height' }: { cm: number; unit: Unit; onChange: (cm: number) => void; label?: string }) {
  const total = cm ? Math.round(cm / CM_IN) : 0
  const [ft, setFt] = useState(total ? `${Math.floor(total / 12)}` : '')
  const [inch, setInch] = useState(total ? `${total % 12}` : '')
  const [c, setC] = useState(cm ? `${Math.round(cm)}` : '')
  const digits = (s: string) => s.replace(/\D/g, '').slice(0, 3)
  const emitImperial = (f: string, i: string) => {
    const t = (parseInt(f) || 0) * 12 + (parseInt(i) || 0)
    onChange(t ? Math.round(t * CM_IN * 10) / 10 : 0)
  }
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      {unit === 'lb' ? (
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <input inputMode="numeric" placeholder="5" value={ft} onChange={(e) => { const v = digits(e.target.value).slice(0, 1); setFt(v); emitImperial(v, inch) }} className={inputCls} />
            <span className="pointer-events-none absolute right-3 top-3.5 text-sm text-muted">ft</span>
          </div>
          <div className="relative">
            <input inputMode="numeric" placeholder="10" value={inch} onChange={(e) => { const v = `${Math.min(11, parseInt(digits(e.target.value)) || 0)}`; const s = e.target.value ? v : ''; setInch(s); emitImperial(ft, s) }} className={inputCls} />
            <span className="pointer-events-none absolute right-3 top-3.5 text-sm text-muted">in</span>
          </div>
        </div>
      ) : (
        <div className="relative">
          <input inputMode="numeric" placeholder="178" value={c} onChange={(e) => { const v = digits(e.target.value); setC(v); onChange(parseInt(v) || 0) }} className={inputCls} />
          <span className="pointer-events-none absolute right-3 top-3.5 text-sm text-muted">cm</span>
        </div>
      )}
    </label>
  )
}
