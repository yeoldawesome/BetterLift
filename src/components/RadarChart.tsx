import { useEffect, useRef } from 'react'
import { Chart, Filler, PointElement, RadarController, RadialLinearScale, LineElement, Tooltip } from 'chart.js'

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip)

/** Radar ("skills") chart in the theme's colors. */
export function RadarChart({ labels, values, unit = 'sets', className = 'h-72' }: { labels: string[]; values: number[]; unit?: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const css = getComputedStyle(ref.current!)
    const accent = css.getPropertyValue('--color-accent').trim() || '#a3e635'
    const muted = css.getPropertyValue('--color-muted').trim() || '#a1a1aa'
    const line = css.getPropertyValue('--color-line').trim() || '#27272a'
    const max = Math.max(1, ...values)
    const chart = new Chart(ref.current!, {
      type: 'radar',
      data: { labels, datasets: [{ data: values, borderColor: accent, backgroundColor: `${accent}40`, pointBackgroundColor: accent, pointRadius: 3, borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (i) => ` ${Math.round(Number(i.raw) * 10) / 10} ${unit}` } } },
        scales: {
          r: {
            min: 0, suggestedMax: Math.ceil(max * 1.1),
            ticks: { display: false, stepSize: Math.max(1, Math.ceil(max / 4)) },
            grid: { color: line }, angleLines: { color: line },
            pointLabels: { color: muted, font: { size: 11, weight: 600 } },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [labels, values, unit])
  return <div className={className}><canvas ref={ref} /></div>
}
