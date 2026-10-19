import { useEffect, useRef } from 'react'
import { cn } from '../../lib/format'

/*
 * Static "blurlight" backdrop in the mercity.ai style: soft pastel light sources on a paper
 * ground, posterised through an 8x8 Bayer matrix, then a pass of mono grain. Deterministic on
 * `seed`; redrawn on resize only.
 */

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9,
  41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
]

function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

function hsl(h: number, s: number, l: number): [number, number, number] {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

const PALETTES = {
  light: {
    ground: hsl(243, 41, 95),
    tints: [hsl(240, 41, 96), hsl(243, 72, 83), hsl(178, 55, 82), hsl(34, 74, 87), hsl(243, 58, 89)],
    levels: 10,
    grain: 14,
  },
  wash: {
    ground: hsl(240, 45, 97),
    tints: [hsl(243, 78, 86), hsl(178, 52, 85), hsl(250, 70, 90), hsl(30, 80, 91), hsl(190, 60, 89)],
    levels: 12,
    grain: 10,
  },
  alarm: {
    ground: hsl(350, 40, 96),
    tints: [hsl(356, 72, 86), hsl(243, 60, 87), hsl(20, 80, 88), hsl(350, 60, 90), hsl(243, 40, 92)],
    levels: 10,
    grain: 14,
  },
} as const

export type BackdropPalette = keyof typeof PALETTES

function draw(canvas: HTMLCanvasElement, seed: number, paletteName: BackdropPalette) {
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  const p = PALETTES[paletteName]
  const r = rng(seed)
  const css = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`

  ctx.fillStyle = css(p.ground)
  ctx.fillRect(0, 0, w, h)
  ctx.filter = `blur(${Math.round(Math.min(w, h) * 0.17 + 18)}px)`
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = css(p.tints[Math.floor(r() * p.tints.length)])
    ctx.beginPath()
    ctx.ellipse(r() * w, r() * h, w * (0.18 + r() * 0.26), h * (0.3 + r() * 0.45), r() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.filter = 'none'

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const L = p.levels
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const bump = (BAYER8[(y & 7) * 8 + (x & 7)] / 64 - 0.5) * (255 / L)
      const n = (Math.random() - 0.5) * p.grain
      for (let k = 0; k < 3; k++) {
        const v = Math.max(0, Math.min(255, d[i + k] + bump))
        d[i + k] = (Math.round((v / 255) * (L - 1)) / (L - 1)) * 255 + n
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

export function Backdrop({ seed = 8812, palette = 'light', className }: { seed?: number; palette?: BackdropPalette; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let frame = 0
    let lastW = 0
    let lastH = 0
    const redraw = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const { width, height } = canvas.getBoundingClientRect()
        if (Math.abs(width - lastW) < 2 && Math.abs(height - lastH) < 2) return
        lastW = width
        lastH = height
        draw(canvas, seed, palette)
      })
    }
    redraw()
    const ro = new ResizeObserver(redraw)
    ro.observe(canvas)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
    }
  }, [seed, palette])

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
}
