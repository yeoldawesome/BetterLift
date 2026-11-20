import { useEffect, useRef } from 'react'
import { CategoryScale, Chart, Filler, LineController, LineElement, LinearScale, PointElement, Tooltip } from 'chart.js'

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler)

/**
 * Line chart with optional dashed trend line and a per-point tooltip subtitle (e.g. "225 lb × 5").
 * `yTitle` labels the value axis; `yFormat` formats axis ticks and tooltip values (e.g. minutes → "1h 30m").
 */
export function LineChart({ labels, values, trend, extras, className = 'h-56', yTitle, yFormat }: {
  labels: string[]; values: number[]; trend?: number[]; extras?: string[]; className?: string; yTitle?: string; yFormat?: (v: number) => string
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
          // Legend is registered globally by MultiChart; single-series charts don't want it.
          legend: { display: false },
          tooltip: {
            filter: (i) => i.datasetIndex === 0,
            callbacks: {
              label: (i) => (yFormat ? yFormat(Number(i.raw)) : String(i.formattedValue)),
              afterLabel: (i) => (extras?.[i.dataIndex] ? extras[i.dataIndex] : ''),
            },
          },
        },
        scales: {
          x: { ticks: { color: muted, maxTicksLimit: 5, maxRotation: 0 }, grid: { display: false } },
          y: {
            ticks: { color: muted, maxTicksLimit: 5, ...(yFormat ? { callback: (v) => yFormat(Number(v)) } : {}) }, grid: { color: line },
            title: { display: !!yTitle, text: yTitle ?? '', color: muted, font: { size: 10, weight: 'bold' } },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [labels, values, trend, extras, yTitle, yFormat])
  return <div className={className}><canvas ref={ref} /></div>
}
