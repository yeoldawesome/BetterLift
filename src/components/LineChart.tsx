import { useEffect, useRef } from 'react'
import { CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

/** Line chart with optional dashed trend line and a per-point tooltip subtitle (e.g. "225 lb × 5"). */
export function LineChart({ labels, values, trend, extras, className = 'h-56' }: {
  labels: string[]; values: number[]; trend?: number[]; extras?: string[]; className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
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
        plugins: {
          tooltip: {
            filter: (i) => i.datasetIndex === 0,
            callbacks: { afterLabel: (i) => (extras?.[i.dataIndex] ? extras[i.dataIndex] : '') },
          },
        },
        scales: {
          x: { ticks: { color: muted, maxTicksLimit: 5, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: muted, maxTicksLimit: 5 }, grid: { color: line } },
        },
      },
    })
    return () => chart.destroy()
  }, [labels, values, trend, extras])
  return <div className={className}><canvas ref={ref} /></div>
}
