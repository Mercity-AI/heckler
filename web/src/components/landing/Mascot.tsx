import { useEffect, useRef } from 'react'
import { cn } from '../../lib/format'

const EYES = [
  { cx: 45, cy: 46 },
  { cx: 83, cy: 46 },
]
const REACH = 3.4

/** The Heckler mark with pupils that follow the pointer. Moves them directly so the page never re-renders on mousemove. */
export function Mascot({ className }: { className?: string }) {
  const svg = useRef<SVGSVGElement>(null)
  const pupils = useRef<(SVGCircleElement | null)[]>([])

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const box = svg.current?.getBoundingClientRect()
        if (!box) return
        const scale = box.width / 128
        EYES.forEach((eye, i) => {
          const dx = e.clientX - (box.left + eye.cx * scale)
          const dy = e.clientY - (box.top + eye.cy * scale)
          const d = Math.hypot(dx, dy) || 1
          const r = Math.min(REACH, d / 40)
          pupils.current[i]?.setAttribute('transform', `translate(${(dx / d) * r} ${(dy / d) * r})`)
        })
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', onMove)
    }
  }, [])

  return (
    <svg ref={svg} viewBox="0 0 128 111" className={cn('shrink-0 drop-shadow-[0_10px_18px_rgb(80_72_229/0.35)]', className)} aria-hidden>
      <defs>
        <linearGradient id="mascot-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6bf5" />
          <stop offset="1" stopColor="#5048e5" />
        </linearGradient>
      </defs>
      <path d="M27 0H101A27 27 0 0 1 128 27V66.5L116.5 83.5 105.5 66.5 94.5 83.5 83.5 66.5 72 83.5 60.5 66.5 49.5 83.5 38.5 66.5H27.5L12 110.5 13.5 66.5H12A12 12 0 0 1 0 54.5V27A27 27 0 0 1 27 0Z" fill="url(#mascot-fill)" />
      <path d="M30.5 23.5 50.5 32.5M97.5 23.5 77.5 32.5" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
      {EYES.map((eye, i) => (
        <g key={eye.cx}>
          <circle cx={eye.cx} cy={eye.cy} r="8" fill="#fff" />
          <circle
            ref={(el) => {
              pupils.current[i] = el
            }}
            cx={eye.cx}
            cy={eye.cy}
            r="3.6"
            fill="#1c1860"
          />
        </g>
      ))}
    </svg>
  )
}
