import type { Intensity, MapMuscle } from '../lib/muscles'

type Sex = 'male' | 'female'
type Shape = { m: MapMuscle; d?: string; e?: [number, number, number, number, number?] } // path, or ellipse [cx, cy, rx, ry, rotate]

// Original stylized figure on a 120×240 canvas, centred at x=60. Proportions shift for the female build.
function dims(sex: Sex) {
  return sex === 'female'
    ? { S: 22, waist: 13.5, hip: 21, H: 12.5, arm: 9, fore: 7.5, thigh: 21, shin: 12 }
    : { S: 27, waist: 17, hip: 19.5, H: 11, arm: 12, fore: 10, thigh: 21, shin: 13 }
}

const mirror = (x: number, y: number, rx: number, ry: number, rot = 0): [[number, number, number, number, number], [number, number, number, number, number]] =>
  [[60 - x, y, rx, ry, -rot], [60 + x, y, rx, ry, rot]]

function front(sex: Sex): Shape[] {
  const { S, H } = dims(sex)
  const f = sex === 'female'
  return [
    ...mirror(S - 1, 50, 7.5, 7).map((e) => ({ m: 'shoulders' as const, e })),
    ...mirror(f ? 9.5 : 10.5, f ? 61 : 59, f ? 9.5 : 11.5, f ? 8.5 : 9).map((e) => ({ m: 'chest' as const, e })),
    ...mirror(S + 2.5, 68, f ? 4 : 5, 10, f ? 6 : 7).map((e) => ({ m: 'biceps' as const, e })),
    ...mirror(S + 6, 97, f ? 3.5 : 4.5, 11, 8).map((e) => ({ m: 'forearms' as const, e })),
    { m: 'core', d: `M52 ${f ? 70 : 68} h16 a3 3 0 0 1 3 3 v28 a5 5 0 0 1 -5 5 h-12 a5 5 0 0 1 -5 -5 v-28 a3 3 0 0 1 3 -3z` },
    ...mirror(f ? 14 : 15, 88, 3.2, 11).map((e) => ({ m: 'core' as const, e })),
    ...mirror(H, 143, f ? 9.5 : 9, 21, -3).map((e) => ({ m: 'quads' as const, e })),
    ...mirror(H - 1.5, 189, 4.5, 14).map((e) => ({ m: 'calves' as const, e })),
  ]
}

function back(sex: Sex): Shape[] {
  const { S, H } = dims(sex)
  const f = sex === 'female'
  return [
    { m: 'back', d: `M60 36 L${60 + (f ? 12 : 15)} 46 L60 ${f ? 68 : 70} L${60 - (f ? 12 : 15)} 46 Z` },
    ...mirror(S - 1, 50, 7.5, 7).map((e) => ({ m: 'shoulders' as const, e })),
    ...mirror(f ? 12.5 : 15, 74, f ? 6.5 : 8.5, 16, -10).map((e) => ({ m: 'back' as const, e })),
    { m: 'back', d: 'M54 92 h12 v14 a3 3 0 0 1 -3 3 h-6 a3 3 0 0 1 -3 -3z' },
    ...mirror(S + 2.5, 68, f ? 4 : 5, 10, f ? 6 : 7).map((e) => ({ m: 'triceps' as const, e })),
    ...mirror(S + 6, 97, f ? 3.5 : 4.5, 11, 8).map((e) => ({ m: 'forearms' as const, e })),
    ...mirror(f ? 10.5 : 9.5, 121, f ? 11 : 10, f ? 10 : 9).map((e) => ({ m: 'glutes' as const, e })),
    ...mirror(H, 151, 8, 18, -3).map((e) => ({ m: 'hamstrings' as const, e })),
    ...mirror(H - 1, 187, 6.5, 15).map((e) => ({ m: 'calves' as const, e })),
  ]
}

function Silhouette({ sex }: { sex: Sex }) {
  const { S, waist, hip, H, arm, fore, thigh, shin } = dims(sex)
  const limb = { stroke: 'var(--color-surface-2)', strokeLinecap: 'round' as const, fill: 'none' }
  return (
    <g>
      <ellipse cx={60} cy={18} rx={sex === 'female' ? 10 : 11} ry={13} fill="var(--color-surface-2)" />
      <rect x={54} y={28} width={12} height={12} rx={4} fill="var(--color-surface-2)" />
      {[-1, 1].map((s) => (
        <g key={s}>
          <line x1={60 + s * (S - 1)} y1={48} x2={60 + s * (S + 4)} y2={84} strokeWidth={arm} {...limb} />
          <line x1={60 + s * (S + 4)} y1={84} x2={60 + s * (S + 8)} y2={112} strokeWidth={fore} {...limb} />
          <circle cx={60 + s * (S + 8.5)} cy={117} r={sex === 'female' ? 3.5 : 4.5} fill="var(--color-surface-2)" />
          <line x1={60 + s * H} y1={120} x2={60 + s * (H - 1)} y2={166} strokeWidth={thigh} {...limb} />
          <line x1={60 + s * (H - 1)} y1={168} x2={60 + s * (H - 2)} y2={212} strokeWidth={shin} {...limb} />
          <ellipse cx={60 + s * (H - 1)} cy={220} rx={6} ry={4} fill="var(--color-surface-2)" />
        </g>
      ))}
      <path d={`M${60 - S + 1} 44 Q60 37 ${60 + S - 1} 44 L${60 + waist} 104 L${60 + hip} 124 L${60 - hip} 124 L${60 - waist} 104 Z`} fill="var(--color-surface-2)" strokeLinejoin="round" />
    </g>
  )
}

function Figure({ sex, view, intensity }: { sex: Sex; view: 'front' | 'back'; intensity: Intensity }) {
  const shapes = view === 'front' ? front(sex) : back(sex)
  return (
    <svg viewBox="0 0 120 230" className="h-full w-auto" role="img" aria-label={`${view} muscles`}>
      <Silhouette sex={sex} />
      {shapes.map((s, i) => {
        const v = intensity[s.m] ?? 0
        const style = v > 0
          ? { fill: 'var(--color-accent)', fillOpacity: 0.3 + 0.7 * v }
          : { fill: 'var(--color-line)', fillOpacity: 1 }
        return s.d
          ? <path key={i} d={s.d} style={style} />
          : <ellipse key={i} cx={s.e![0]} cy={s.e![1]} rx={s.e![2]} ry={s.e![3]} transform={s.e![4] ? `rotate(${s.e![4]} ${s.e![0]} ${s.e![1]})` : undefined} style={style} />
      })}
      {view === 'front' && <path d="M52 81 h16 M52 92 h16 M60 70 v35" stroke="var(--color-surface)" strokeWidth={1} opacity={0.6} />}
    </svg>
  )
}

/** Front + back muscle map. Worked muscles glow in the theme accent, brighter = more work. */
export function BodyMap({ sex, intensity, className = 'h-28', labels }: { sex?: string; intensity: Intensity; className?: string; labels?: boolean }) {
  const s: Sex = sex === 'female' ? 'female' : 'male'
  return (
    <div className={`flex shrink-0 items-start ${className}`}>
      <div className="flex h-full flex-col items-center">
        <Figure sex={s} view="front" intensity={intensity} />
        {labels && <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Front</span>}
      </div>
      <div className="flex h-full flex-col items-center">
        <Figure sex={s} view="back" intensity={intensity} />
        {labels && <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">Back</span>}
      </div>
    </div>
  )
}
