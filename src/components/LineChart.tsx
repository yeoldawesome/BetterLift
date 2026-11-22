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
    const canvas = css.getPropertyValue('--color-canvas').trim() || '#09090b'
    const surface = css.getPropertyValue('--color-surface-2').trim() || '#27272a'
    const ink = css.getPropertyValue('--color-ink').trim() || '#fafafa'
    // Dot size follows the room each point gets: big on short histories, still a readable dot at ~100 sessions on a phone.
    const r = (c: { chart: Chart }) => Math.max(2, Math.min(3.5, ((c.chart.chartArea?.width ?? 300) / Math.max(1, values.length)) * 0.7))
    const chart = new Chart(ref.current!, {
      type: 'line',
      data: {
        labels,
        datasets: [
          // Every session is a dot: accent fill with a dark ring so neighbours stay distinct.
          // Flat tinted fill, round joins (no spikes past the dots on sharp turns), dots drawn over the line.
          { label: yTitle || 'Value', data: values, borderColor: accent, backgroundColor: `${accent}26`, fill: 'start', tension: 0, borderWidth: 2.5,
            borderJoinStyle: 'round', borderCapStyle: 'round',
            pointRadius: r, pointHoverRadius: (c: { chart: Chart }) => r(c) + 3, pointBackgroundColor: accent, pointBorderColor: canvas, pointBorderWidth: (c: { chart: Chart }) => Math.max(1, r(c) * 0.4),
            pointHoverBackgroundColor: accent, pointHoverBorderColor: canvas, pointHoverBorderWidth: 3 },
          ...(trend ? [{ label: 'Trend', data: trend, borderColor: `${muted}b3`, backgroundColor: `${muted}b3`, borderDash: [9, 7], pointRadius: 0, pointHoverRadius: 0, borderWidth: 2.5, fill: false, tension: 0 }] : []),
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
            backgroundColor: surface, borderColor: accent, borderWidth: 1.5, cornerRadius: 12, padding: 12, caretSize: 7,
            titleColor: ink, titleFont: { size: 14, weight: 'bold' }, bodyColor: ink, bodyFont: { size: 13 }, bodySpacing: 5,
            usePointStyle: true, boxPadding: 5,
            callbacks: {
              label: (i) => {
                const v = yFormat ? yFormat(Number(i.raw)) : String(i.formattedValue)
                return i.datasetIndex === 0 ? (yTitle ? `${yTitle}: ${v}` : v) : `Trend: ${v}`
              },
              afterLabel: (i) => (i.datasetIndex === 0 && extras?.[i.dataIndex] ? extras[i.dataIndex] : ''),
              labelColor: (i) => (i.datasetIndex === 0 ? { borderColor: canvas, backgroundColor: accent, borderWidth: 2 } : { borderColor: `${muted}b3`, backgroundColor: `${muted}b3`, borderWidth: 0 }),
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
          x: { ticks: { color: muted, maxTicksLimit: 7, maxRotation: 0 }, grid: { color: `${line}cc`, drawTicks: true, tickLength: 6 }, border: { color: line } },
          y: {
            ticks: { color: muted, maxTicksLimit: 5, ...(yFormat ? { callback: (v) => yFormat(Number(v)) } : {}) }, grid: { color: `${line}cc` }, border: { display: false },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [labels, values, trend, extras, yTitle, yFormat, openable])
  // No axis title on the chart (it crowded small charts); it stays as the accessible name.
  return <div className={className}><canvas ref={ref} role="img" aria-label={yTitle} /></div>
}
