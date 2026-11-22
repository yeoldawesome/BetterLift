import { pb } from './pb'
// App theming: every color in the UI (and the body graph) reads these CSS variables, so swapping them re-themes everything.
export type Theme = { base?: string; accent?: string }

type Base = { name: string; canvas: string; surface: string; surface2: string; line: string; ink: string; muted: string; faint: string; light?: boolean }
export const BASES: Record<string, Base> = {
  midnight: { name: 'Midnight', canvas: '#09090b', surface: '#141417', surface2: '#1d1d21', line: '#27272a', ink: '#fafafa', muted: '#a1a1aa', faint: '#52525b' },
  oled: { name: 'OLED Black', canvas: '#000000', surface: '#0c0c0e', surface2: '#16161a', line: '#232328', ink: '#fafafa', muted: '#a1a1aa', faint: '#52525b' },
  navy: { name: 'Navy', canvas: '#0a0f1c', surface: '#111829', surface2: '#1a2338', line: '#27324c', ink: '#f1f5f9', muted: '#94a3b8', faint: '#4b5a74' },
  slate: { name: 'Graphite', canvas: '#161618', surface: '#1f1f23', surface2: '#2a2a30', line: '#36363d', ink: '#f4f4f5', muted: '#a8a8b3', faint: '#5b5b66' },
  light: { name: 'Light', canvas: '#f4f4f2', surface: '#ffffff', surface2: '#ebebe8', line: '#dadad6', ink: '#18181b', muted: '#56565f', faint: '#a1a1aa', light: true },
}

export const ACCENTS: [string, string][] = [
  ['#a3e635', 'Lime'], ['#38bdf8', 'Sky'], ['#f43f5e', 'Crimson'], ['#a78bfa', 'Violet'],
  ['#fb923c', 'Orange'], ['#34d399', 'Mint'], ['#facc15', 'Gold'], ['#f472b6', 'Pink'], ['#3cb371', 'Sea Green'],
]

export const DEFAULT_THEME: Required<Theme> = { base: 'midnight', accent: '#a3e635' }

const hex = (h: string) => /^#[0-9a-f]{6}$/i.test(h)
function luminance(h: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
/** Dark text on bright accents, white text on deep ones. */
export const inkFor = (accent: string) => (luminance(accent) > 0.35 ? '#0b0f02' : '#ffffff')

export function resolve(t?: Theme | null): Required<Theme> {
  return { base: t?.base && BASES[t.base] ? t.base : DEFAULT_THEME.base, accent: t?.accent && hex(t.accent) ? t.accent : DEFAULT_THEME.accent }
}

/** Blend two #rrggbb colors; `t` is how much of `b` to mix into `a` (0..1). */
export function mix(a: string, b: string, t: number) {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16)
  return '#' + [1, 3, 5].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * t).toString(16).padStart(2, '0')).join('')
}

/**
 * CSS variable map for a theme — also used to scope the Themes preview without touching the live app.
 * The accent soaks into every surface (background, cards, inputs, borders, grey text) so the whole app takes on
 * your color, not just buttons. Light bases take a gentler tint so text stays readable.
 */
export function themeVars(t?: Theme | null): Record<string, string> {
  const { base, accent } = resolve(t)
  const b = BASES[base]
  const k = b.light ? 0.55 : 1
  return {
    '--color-canvas': mix(b.canvas, accent, 0.05 * k), '--color-surface': mix(b.surface, accent, 0.08 * k),
    '--color-surface-2': mix(b.surface2, accent, 0.11 * k), '--color-line': mix(b.line, accent, 0.18 * k),
    '--color-ink': b.ink, '--color-muted': mix(b.muted, accent, 0.12 * k), '--color-faint': mix(b.faint, accent, 0.15 * k),
    '--color-accent': accent, '--color-accent-ink': inkFor(accent),
  }
}

/** The accent color to stamp on a workout you save now. */
export const myAccent = (): string => resolve((pb.authStore.record as { theme?: Theme } | null)?.theme).accent

const KEY = 'bl.theme'
export function applyTheme(t?: Theme | null) {
  const root = document.documentElement
  for (const [k, v] of Object.entries(themeVars(t))) root.style.setProperty(k, v)
  const { base } = resolve(t)
  root.style.colorScheme = BASES[base].light ? 'light' : 'dark'
  // iPhone status bar / Safari chrome matches the tinted background.
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeVars(t)['--color-canvas'])
  try { localStorage.setItem(KEY, JSON.stringify(resolve(t))) } catch { /* private mode */ }
}

/** Theme remembered on this device, applied before login so the app opens in your colors. */
export function localTheme(): Theme | null {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
