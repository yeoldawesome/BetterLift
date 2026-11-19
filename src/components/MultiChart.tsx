import { useEffect, useRef } from 'react'
import { BarController, BarElement, CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip, Legend } from 'chart.js'

Chart.register(LineController, LineElement, BarController, BarElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler, Legend)

export type Series = {
  label: string; data: (number | null)[]
  /** accent = theme accent, ink = foreground, muted = grey. */
  color?: 'accent' | 'ink' | 'muted'; dashed?: boolean; bar?: boolean; right?: boolean; fill?: boolean; suffix?: string
}

/** Theme-coloured chart with several line/bar series, optional second y-axis (series with `right`) and a legend. */
export function MultiChart({ labels, series, className = 'h-56', legend, highlight }: {
  labels: string[]; series: Series[]; className?: string; legend?: boolean; highlight?: number
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const css = getComputedStyle(document.documentElement)
    const c = {
      accent: css.getPropertyValue('--color-accent').trim() || '#a3e635',
      ink: css.getPropertyValue('--color-ink').trim() || '#fafafa',
      muted: css.getPropertyValue('--color-muted').trim() || '#a1a1aa',
    }
    const line = css.getPropertyValue('--color-line').trim() || '#27272a'
    const right = series.some((s) => s.right)
    const chart = new Chart(ref.current!, {
      type: 'line',
      data: {
        labels,
        datasets: series.map((s) => {
          const col = c[s.color ?? 'accent']
          return s.bar
            ? { type: 'bar' as const, label: s.label, data: s.data, yAxisID: s.right ? 'y1' : 'y', borderRadius: 4, maxBarThickness: 22,
                backgroundColor: s.data.map((_, i) => (highlight === undefined || i === highlight ? col : `${col}66`)) }
            : { type: 'line' as const, label: s.label, data: s.data, yAxisID: s.right ? 'y1' : 'y', borderColor: s.dashed ? `${col}cc` : col,
                backgroundColor: `${col}22`, fill: !!s.fill, tension: 0.3, spanGaps: true, borderDash: s.dashed ? [6, 4] : undefined,
                pointRadius: s.dashed || s.data.length > 40 ? 0 : 2.5, pointBackgroundColor: col, borderWidth: s.dashed ? 2 : 2.5 }
        }),
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: !!legend, labels: { color: c.muted, boxWidth: 12, boxHeight: 2, font: { size: 11, weight: 'bold' } } },
          tooltip: {
            filter: (i) => i.raw !== null && i.raw !== undefined,
            callbacks: { label: (i) => ` ${i.dataset.label}: ${i.formattedValue}${series[i.datasetIndex]?.suffix ?? ''}` },
          },
        },
        scales: {
          x: { ticks: { color: c.muted, maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: c.muted, maxTicksLimit: 5 }, grid: { color: line } },
          ...(right ? { y1: { position: 'right' as const, ticks: { color: c.ink, maxTicksLimit: 5 }, grid: { display: false } } } : {}),
        },
      },
    })
    return () => chart.destroy()
  }, [labels, series, legend, highlight])
  return <div className={className}><canvas ref={ref} /></div>
}
