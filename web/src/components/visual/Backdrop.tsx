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

// The blur is low-frequency, so it is drawn at 1/BLUR_SCALE size and upscaled: same look, a fraction of the cost.
const BLUR_SCALE = 4

/** quantised value per (Bayer cell, channel value), so the per-pixel loop is two lookups and an add */
const LUTS = new Map<number, Uint8Array>()
function ditherLut(levels: number) {
  let lut = LUTS.get(levels)
  if (lut) return lut
  lut = new Uint8Array(64 * 256)
  for (let b = 0; b < 64; b++) {
    const bump = (BAYER8[b] / 64 - 0.5) * (255 / levels)
    for (let v = 0; v < 256; v++) {
      const q = Math.max(0, Math.min(255, v + bump))
      lut[b * 256 + v] = Math.round((Math.round((q / 255) * (levels - 1)) / (levels - 1)) * 255)
    }
  }
  LUTS.set(levels, lut)
  return lut
}

/** rendered frames, so revisiting a page (e.g. "Connect agent" back to home) paints instantly */
const CACHE = new Map<string, ImageData>()
const CACHE_MAX = 6

function render(w: number, h: number, seed: number, paletteName: BackdropPalette): ImageData | null {
  const p = PALETTES[paletteName]
  const r = rng(seed)
  const css = (c: readonly number[]) => `rgb(${c[0]},${c[1]},${c[2]})`

  const small = document.createElement('canvas')
  const sw = Math.max(1, Math.ceil(w / BLUR_SCALE))
  const sh = Math.max(1, Math.ceil(h / BLUR_SCALE))
  small.width = sw
  small.height = sh
  const sctx = small.getContext('2d')
  if (!sctx) return null
  sctx.fillStyle = css(p.ground)
  sctx.fillRect(0, 0, sw, sh)
  sctx.filter = `blur(${(Math.min(w, h) * 0.17 + 18) / BLUR_SCALE}px)`
  for (let i = 0; i < 6; i++) {
    sctx.fillStyle = css(p.tints[Math.floor(r() * p.tints.length)])
    sctx.beginPath()
    sctx.ellipse(r() * sw, r() * sh, sw * (0.18 + r() * 0.26), sh * (0.3 + r() * 0.45), r() * Math.PI, 0, Math.PI * 2)
    sctx.fill()
  }

  const full = document.createElement('canvas')
  full.width = w
  full.height = h
  const ctx = full.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(small, 0, 0, w, h)

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const lut = ditherLut(p.levels)
  const grain = p.grain
  let s = (seed * 2654435761) | 0 || 1
  for (let y = 0; y < h; y++) {
    const row = (y & 7) * 8
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const o = (row + (x & 7)) * 256
      s ^= s << 13
      s ^= s >>> 17
      s ^= s << 5
      const n = ((s & 255) / 255 - 0.5) * grain
      // Uint8ClampedArray clamps and rounds the grain for us
      d[i] = lut[o + d[i]] + n
      d[i + 1] = lut[o + d[i + 1]] + n
      d[i + 2] = lut[o + d[i + 2]] + n
    }
  }
  return img
}

function draw(canvas: HTMLCanvasElement, seed: number, paletteName: BackdropPalette) {
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, Math.round(rect.width))
  const h = Math.max(1, Math.round(rect.height))
  const key = `${seed}|${paletteName}|${w}x${h}`
  let img = CACHE.get(key)
  if (!img) {
    const rendered = render(w, h, seed, paletteName)
    if (!rendered) return
    img = rendered
    CACHE.set(key, img)
    if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value!)
  }
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')?.putImageData(img, 0, 0)
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
