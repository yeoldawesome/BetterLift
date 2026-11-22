import { useEffect, useRef } from 'react'
import { CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

/**
 * Line chart with optional dashed trend line and a per-point tooltip subtitle (e.g. "225 lb × 5").
 * `yTitle` is the chart's accessible name (not drawn); `yFormat` formats axis ticks and tooltip values (e.g. minutes → "1h 30m").
 * `onPoint` makes points openable: click one with a mouse, or on a phone tap once to see it and again to open it.
 */
export function LineChart({ labels, values, trend, extras, className = 'h-56', yTitle, yFormat, onPoint, pointAction }: {
  labels: string[]; values: number[]; trend?: number[]; extras?: string[]; className?: string; yTitle?: string; yFormat?: (v: number) => string
  onPoint?: (index: number) => void
  /** What opening a point does, for the tooltip hint (default "open workout"). */
  pointAction?: (index: number) => string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const point = useRef(onPoint)
  point.current = onPoint
  const action = useRef(pointAction)
  action.current = pointAction
  const openable = !!onPoint
  useEffect(() => {
    const mouse = matchMedia('(hover: hover) and (pointer: fine)').matches
    let armed = -1 // touch: the point whose tooltip is showing; tapping it again opens it
    const css = getComputedStyle(document.documentElement)
    const accent = css.getPropertyValue('--color-accent').trim() || '#a3e635'
    const muted = css.getPropertyValue('--color-muted').trim() || '#a1a1aa'
    const line = css.getPropertyValue('--color-line').trim() || '#27272a'
    const chart = new Chart(ref.current!, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { data: values, borderColor: accent, backgroundColor: `${accent}22`, fill: true, tension: 0.3, pointRadius: values.length > 40 ? 0 : 3, pointBackgroundColor: accent, borderWidth: 2.5 },
          ...(trend ? [{ data: trend, borderColor: `${muted}99`, borderDash: [6, 4], pointRadius: 0, pointHoverRadius: 0, borderWidth: 1.5, fill: false, tension: 0 }] : []),
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        ...(openable ? {
          onHover: (e, els) => { (e.native?.target as HTMLElement | null)?.style.setProperty('cursor', els.length ? 'pointer' : 'default') },
          onClick: (e, _els, chart) => {
            const hit = e.native && chart.getElementsAtEventForMode(e.native, 'index', { intersect: false }, false).find((h) => h.datasetIndex === 0)
            if (!hit) return
            if (!mouse && armed !== hit.index) { armed = hit.index; return }
            armed = -1
            point.current?.(hit.index)
          },
        } : {}),
        plugins: {
          // Legend is registered globally by MultiChart; single-series charts don't want it.
          legend: { display: false },
          tooltip: {
            filter: (i) => i.datasetIndex === 0,
            callbacks: {
              label: (i) => (yFormat ? yFormat(Number(i.raw)) : String(i.formattedValue)),
              afterLabel: (i) => (extras?.[i.dataIndex] ? extras[i.dataIndex] : ''),
              footer: (items) => {
                if (!openable) return ''
                const what = (items[0] && action.current?.(items[0].dataIndex)) || 'open workout'
                return `${mouse ? 'Click' : 'Tap again'} to ${what}`
              },
            },
            footerColor: accent, footerFont: { size: 11, weight: 'bold' },
          },
        },
        scales: {
          x: { ticks: { color: muted, maxTicksLimit: 5, maxRotation: 0 }, grid: { display: false } },
          y: {
            ticks: { color: muted, maxTicksLimit: 5, ...(yFormat ? { callback: (v) => yFormat(Number(v)) } : {}) }, grid: { color: line },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [labels, values, trend, extras, yTitle, yFormat, openable])
  // No axis title on the chart (it crowded small charts); it stays as the accessible name.
  return <div className={className}><canvas ref={ref} role="img" aria-label={yTitle} /></div>
}
