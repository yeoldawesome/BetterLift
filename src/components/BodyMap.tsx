import { useId, type CSSProperties } from 'react'
import type { Intensity, MapMuscle } from '../lib/muscles'

type Sex = 'male' | 'female'
type Pt = [number, number]
type View = 'front' | 'back'
type Part = { m: MapMuscle | null; pts: Pt[]; mirror?: boolean } // m=null → anatomical detail, never highlighted

/*
 * Original stylized anatomy on a 120×230 canvas, centred at x=60. Everything is a list of points traced
 * on the figure's left side (x < 60) and turned into smooth closed curves; `mirror` copies a part to the
 * right side. The female build is the same drawing passed through a width warp that varies with height.
 */

/** Rounded box as 8 points so the spline stays close to the edges. */
function box(x1: number, y1: number, x2: number, y2: number, r = 1.6): Pt[] {
  return [[x1 + r, y1], [x2 - r, y1], [x2, y1 + r], [x2, y2 - r], [x2 - r, y2], [x1 + r, y2], [x1, y2 - r], [x1, y1 + r]]
}

// Left half of the silhouette, from the crown down the outside of the arm, back up the inside, then down the leg to the crotch.
const OUTLINE: Pt[] = [
  [60, 3], [54.4, 5], [51.8, 11.5], [52.2, 19.5], [54.2, 26.5], [54.2, 30.5], [53.2, 34],
  [47.4, 37.6], [39.4, 40], [32.4, 42.6], [28.4, 48.6], [27, 56.5], [26.2, 66], [25.6, 76], [24.8, 84],
  [22.8, 92.5], [21.2, 101.5], [20.4, 109.5], [18.8, 115.5], [19.2, 122.5], [21.6, 127], [24.6, 125.2], [25.6, 118.5], [26, 111],
  [28.8, 100.5], [32, 90.5], [34.8, 83], [37.8, 72.5], [39.6, 64], [41.4, 60.6],
  [41.4, 70], [42.2, 82], [43.4, 95], [42, 105], [39.2, 115], [37.4, 127], [38, 141], [40.4, 156], [42.4, 166],
  [40.2, 177], [41.2, 191], [45.6, 207.5], [44.4, 215.5], [46, 221], [53.6, 222.2], [56.2, 219.2], [55.6, 210],
  [56, 196], [57, 182], [56.2, 166.5], [57, 150], [58.4, 134], [60, 129.5],
]

const FOREARM: Pt[] = [[26.6, 85], [24, 93.6], [22.6, 103], [23.6, 109], [26.8, 106.6], [30.4, 97.4], [33.6, 87.6], [31.4, 84.2], [28.8, 83.6]]

const FRONT: Part[] = [
  // trapezius seen over the collarbone
  { m: 'traps', pts: [[53, 35.6], [48.4, 38.2], [43.6, 40.4], [48.2, 41.2], [53.4, 40]], mirror: true },
  // deltoid cap: front head next to the chest, side head on the outside of the shoulder
  { m: 'front_delts', pts: [[41, 41.6], [37.8, 41.9], [35.6, 44.8], [34, 50.4], [32.6, 56.8], [31.2, 62.6], [33.2, 59.6], [36.4, 52.4], [40.2, 46.6]], mirror: true },
  { m: 'side_delts', pts: [[36.6, 42.1], [32, 44.2], [29.2, 48.4], [27.8, 54], [28.2, 60.4], [29.8, 62.8], [31.2, 57.2], [32.6, 50.6], [34.4, 45.4]], mirror: true },
  { m: 'chest', pts: [[59.2, 44.6], [51, 42.2], [43.6, 43.6], [39, 48.6], [37.6, 56], [39.4, 61.6], [44, 64.6], [51, 65.6], [56.6, 64.4], [59.2, 60.6], [59.4, 52]], mirror: true },
  { m: 'biceps', pts: [[33.8, 61.6], [30.2, 67.8], [28.8, 75.6], [29.8, 81.6], [33.2, 81.6], [36.8, 74.4], [38.4, 66.4], [36.8, 62]], mirror: true },
  { m: 'forearms', pts: FOREARM, mirror: true },
  // serratus fingers
  { m: 'core', pts: [[41.4, 63.4], [41.6, 71], [44.8, 70.4], [45.2, 66.4]], mirror: true },
  // six-pack and lower abs
  { m: 'core', pts: box(52.8, 66.6, 59.2, 74.6), mirror: true },
  { m: 'core', pts: box(52.6, 75.6, 59.2, 83.6), mirror: true },
  { m: 'core', pts: box(52.8, 84.6, 59.2, 92.6), mirror: true },
  { m: 'core', pts: [[53, 93.6], [59.2, 93.6], [59.2, 109], [57.2, 109.6], [54.4, 103.6], [53, 97.4]], mirror: true },
  // obliques
  { m: 'core', pts: [[45.4, 71.6], [42.8, 79], [43, 89], [44.8, 98], [48.6, 104.6], [51.6, 99], [51.8, 86], [51, 75], [48.4, 70.6]], mirror: true },
  // quads: outer sweep, rectus, and the teardrop above the knee
  { m: 'quads', pts: [[42.6, 108], [39.4, 118], [38.4, 132], [39.4, 146], [41.8, 157], [44.6, 162], [46, 156], [45.8, 142], [45.6, 126], [45, 114]], mirror: true },
  { m: 'quads', pts: [[47.2, 112.6], [46.4, 122], [47.4, 138], [49, 152], [50.8, 159.6], [53.2, 154], [54.2, 140], [53.6, 126], [51.2, 116.6]], mirror: true },
  { m: 'quads', pts: [[55.6, 140], [53.6, 149], [52.8, 158], [54.6, 164.8], [57.2, 161], [57.6, 150]], mirror: true },
  // adductors high on the inner thigh
  { m: 'adductors', pts: [[54.6, 121.4], [54.6, 130], [55.4, 139.4], [57.6, 135.6], [58.2, 129], [57.2, 122.6]], mirror: true },
  // knee cap (detail)
  { m: null, pts: [[46.4, 163.6], [45.6, 168], [48.6, 171.4], [52, 169.6], [52.4, 165.2], [49.2, 162.6]], mirror: true },
  { m: 'calves', pts: [[42.8, 171], [41, 180], [41.8, 190], [44.6, 199], [46.6, 194], [47.6, 183], [46.6, 173]], mirror: true },
  { m: 'calves', pts: [[54.6, 171], [52.6, 178], [52.6, 188], [54.2, 196], [56.2, 188], [56.8, 178]], mirror: true },
]

const BACK: Part[] = [
  // trapezius: one kite across both sides
  { m: 'traps', pts: [[60, 29.6], [56, 34.8], [48, 38.4], [40.6, 41.6], [46.8, 45.6], [52.8, 54.4], [56.6, 67], [60, 76.4], [63.4, 67], [67.2, 54.4], [73.2, 45.6], [79.4, 41.6], [72, 38.4], [64, 34.8]] },
  // deltoid cap from behind: rear head toward the spine, side head on the outside
  { m: 'rear_delts', pts: [[39.8, 43.6], [36.8, 43.4], [35, 46.6], [33.8, 51.6], [32.6, 57.4], [31.4, 62.8], [34.4, 58.2], [38, 51]], mirror: true },
  { m: 'side_delts', pts: [[35.6, 43.3], [31, 45.2], [28.6, 49.4], [27.8, 55], [28.4, 61], [30, 63.2], [31.2, 57.4], [32.4, 51.2], [33.8, 46.2]], mirror: true },
  // infraspinatus / teres / rhomboid area
  { m: 'upper_back', pts: [[41.6, 46.4], [38.6, 52.6], [40.8, 59.6], [46.6, 61.6], [51.4, 57.8], [47.6, 49.6]], mirror: true },
  // lats
  { m: 'lats', pts: [[41.6, 62.4], [41.8, 72], [43, 84], [46.4, 95.6], [50, 94], [53.2, 84], [55.6, 73.4], [53.2, 65], [47.4, 62.6]], mirror: true },
  // spinal erectors
  { m: 'lower_back', pts: [[57.6, 78.6], [55.4, 87], [54.2, 97], [54.8, 105], [59, 106], [59.2, 90]], mirror: true },
  { m: 'triceps', pts: [[31, 62.4], [29, 69], [28.8, 77.4], [30.2, 82.4], [33.8, 82], [37, 74.6], [38.4, 67], [36.4, 62.6]], mirror: true },
  { m: 'forearms', pts: FOREARM, mirror: true },
  { m: 'glutes', pts: [[59.2, 107.4], [51.6, 105.6], [44.6, 108.4], [40.6, 115.6], [40.8, 125], [46, 131], [54, 131.6], [59.2, 126]], mirror: true },
  { m: 'hamstrings', pts: [[41.8, 131.4], [39.4, 140], [39.6, 150], [42.4, 160], [46.4, 165], [47.8, 156], [48.4, 144], [46.6, 133.4]], mirror: true },
  { m: 'hamstrings', pts: [[50.4, 133], [49.4, 144], [50.4, 156], [53.8, 165], [56.6, 158], [57.4, 146], [56.8, 136], [53.6, 132.6]], mirror: true },
  { m: 'calves', pts: [[46.6, 168.6], [43, 172], [41.2, 180], [42, 189], [46, 195], [48.6, 186], [48.8, 175]], mirror: true },
  { m: 'calves', pts: [[51, 168.6], [50.4, 176], [51.4, 188], [54.2, 197], [56.4, 188], [56.8, 178], [55.2, 170.6]], mirror: true },
]

/** Female build: how much to scale the width around the centre line, by height. */
const FEMALE_WIDTH: Pt[] = [[0, 0.94], [30, 0.92], [44, 0.86], [70, 0.86], [96, 0.85], [112, 1], [140, 1.02], [170, 0.97], [230, 0.95]]

function widthAt(y: number) {
  const t = FEMALE_WIDTH
  if (y <= t[0][0]) return t[0][1]
  for (let i = 1; i < t.length; i++) {
    if (y <= t[i][0]) {
      const [y0, k0] = t[i - 1], [y1, k1] = t[i]
      return k0 + ((y - y0) / (y1 - y0)) * (k1 - k0)
    }
  }
  return t[t.length - 1][1]
}

const r1 = (n: number) => Math.round(n * 100) / 100

/** Closed Catmull-Rom spline through the points, as cubic Béziers. */
function smooth(pts: Pt[]) {
  const n = pts.length
  const p = (i: number) => pts[(i + n) % n]
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const [a, b, c, e] = [p(i - 1), p(i), p(i + 1), p(i + 2)]
    d += `C${r1(b[0] + (c[0] - a[0]) / 6)} ${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)} ${r1(c[1] - (e[1] - b[1]) / 6)} ${r1(c[0])} ${r1(c[1])}`
  }
  return d + 'Z'
}

type Built = { outline: string; heart: string | null; parts: { m: MapMuscle | null; d: string }[] }
const cache = new Map<string, Built>()

function build(sex: Sex, view: View): Built {
  const key = sex + view
  const hit = cache.get(key)
  if (hit) return hit
  const warp = (pts: Pt[]): Pt[] => sex === 'female' ? pts.map(([x, y]) => [60 + (x - 60) * widthAt(y), y]) : pts
  const flip = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [120 - x, y])
  // Right half walks back up, skipping the two centre-line points shared with the left half.
  const outline = smooth(warp([...OUTLINE, ...flip(OUTLINE.slice(1, -1)).reverse()]))
  const parts = (view === 'front' ? FRONT : BACK).flatMap((p) =>
    (p.mirror ? [p.pts, flip(p.pts)] : [p.pts]).map((pts) => ({ m: p.m, d: smooth(warp(pts)) })))
  const out = { outline, heart: view === 'front' ? smooth(warp(HEART)) : null, parts }
  cache.set(key, out)
  return out
}

const REST = 'color-mix(in oklab, var(--color-faint) 42%, var(--color-surface-2))'

/** Worked muscles blend from the resting tone toward the theme accent: primary reads solid, secondary about half. */
function fill(v: number) {
  if (v <= 0) return REST
  return `color-mix(in oklab, var(--color-accent) ${Math.round(30 + 70 * Math.min(1, v))}%, ${REST})`
}

/**
 * Recovery map (v = 0..1, 1 = fully recovered): ready muscles are solid accent, anything still recovering is a
 * clearly different, dim red that gets stronger the more worn out it is — so "train this" vs "rest this" pops.
 */
export function recoveryFill(v: number) {
  if (v >= 0.95) return 'var(--color-accent)'
  if (v >= 0.8) return `color-mix(in oklab, var(--color-accent) 45%, ${REST})`
  const sore = 1 - v / 0.8 // 0 at 80% recovered → 1 at fully worn out
  return `color-mix(in oklab, var(--color-danger) ${Math.round(35 + 55 * sore)}%, var(--color-surface-2))`
}

/*
 * The heart: an anatomical silhouette drawn under the chest, slightly to the figure's left (viewer's right), with the
 * broad base up and the apex pointing down and out. It's layered over the upper abs and under the pecs; the pecs are
 * a little see-through over it (a faint clipped copy), so it shows behind them and its tip pokes out below.
 * Same fill as a muscle: resting grey, accent when cardio was done.
 */
const HEART: Pt[] = [
  [59.5, 52.9], [62.1, 51.7], [64.8, 52.1], [67.7, 54.0], [70.0, 57.2], [70.9, 61.1], [70.2, 65.1], [68.1, 68.1], [65.7, 69.3], [63.1, 68.3], [60.5, 65.8], [58.6, 62.4], [57.9, 58.5], [58.2, 55.2],
]

function Figure({ sex, view, intensity, paint = fill }: { sex: Sex; view: View; intensity: Intensity; paint?: (v: number) => string }) {
  const { outline, heart, parts } = build(sex, view)
  const clip = `chest${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="15 0 90 226" className="h-full w-auto" role="img" aria-label={`${view} muscles`}>
      <path d={outline} fill="var(--color-surface-2)" stroke="var(--color-faint)" strokeWidth={0.7} strokeLinejoin="round" />
      {/* Layers: everything else, then the heart, then the chest on top of it. */}
      {[parts.filter((p) => p.m !== 'chest'), heart, parts.filter((p) => p.m === 'chest')].flatMap((layer) =>
        typeof layer === 'string' ? [<path key="heart" d={layer} fill={fill(intensity.cardio ?? 0)} stroke="var(--color-surface-2)" strokeWidth={0.45} strokeLinejoin="round" />]
          : (layer ?? []).map((p) => (
            <path
              key={p.d}
              d={p.d}
              fill={p.m ? paint(intensity[p.m] ?? 0) : 'none'}
              stroke={p.m ? 'var(--color-surface-2)' : REST}
              strokeWidth={p.m ? 0.45 : 0.7}
              strokeLinejoin="round"
            />
          )))}
      {/* The chest is a little see-through over the heart: a faint copy of the heart, only where the pecs cover it. */}
      {heart && (
        <>
          <clipPath id={clip}>{parts.filter((p) => p.m === 'chest').map((p) => <path key={p.d} d={p.d} />)}</clipPath>
          <path d={heart} clipPath={`url(#${clip})`} fill={(intensity.cardio ?? 0) > 0 ? fill(intensity.cardio ?? 0) : 'var(--color-surface-2)'}
            fillOpacity={(intensity.cardio ?? 0) > 0 ? 0.45 : 0.4} stroke="var(--color-surface-2)" strokeWidth={0.45} strokeOpacity={0.6} />
        </>
      )}
    </svg>
  )
}

/** Front + back muscle map. Worked muscles take the theme accent, stronger = more work; cardio lights up the heart. */
export function BodyMap({ sex, intensity, className = 'h-28', labels, accent, recovery }: { sex?: string; intensity: Intensity; className?: string; labels?: boolean; accent?: string; recovery?: boolean }) {
  const s: Sex = sex === 'female' ? 'female' : 'male'
  // A workout's own accent (the lifter's color when they logged it) overrides the viewer's theme for this graph only.
  const style = accent && /^#[0-9a-f]{6}$/i.test(accent) ? ({ '--color-accent': accent } as CSSProperties) : undefined
  return (
    <div className={`flex shrink-0 items-start gap-1 ${className}`} style={style}>
      {(['front', 'back'] as const).map((v) => (
        <div key={v} className="flex h-full flex-col items-center">
          <Figure sex={s} view={v} intensity={intensity} paint={recovery ? recoveryFill : fill} />
          {labels && <span className="text-[10px] font-semibold uppercase tracking-wider text-faint">{v}</span>}
        </div>
      ))}
    </div>
  )
}
