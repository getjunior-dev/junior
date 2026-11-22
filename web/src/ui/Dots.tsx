/**
 * Halftone dots, the picture style of getjunior.dev, brought into the app. One
 * canvas per picture. A sampler says how dark each grid cell is and which ink
 * it uses; the canvas draws a dot sized to match, with a 4×4 Bayer threshold so
 * faint areas dither instead of fading. Drawn once, and again on resize or a
 * theme change: the app's dots never animate, so they cost nothing while idle.
 */
import { useEffect, useRef } from 'react'

type Out = { v: number; c: number }
/** v: how dark, 0 to 1. c: which ink, an index into `inks`. */
export type Sampler = (x: number, y: number, w: number, h: number, out: Out) => void

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((n) => (n + 0.5) / 16)

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
const fade = (t: number) => t * t * (3 - 2 * t)
function noise(x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const a = hash(xi, yi)
  const b = hash(xi + 1, yi)
  const c = hash(xi, yi + 1)
  const d = hash(xi + 1, yi + 1)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}
export function fbm(x: number, y: number): number {
  return noise(x, y) * 0.55 + noise(x * 2.1 + 7.3, y * 2.1 + 1.7) * 0.3 + noise(x * 4.3 + 3.1, y * 4.3 + 9.2) * 0.15
}
const smooth = (a: number, b: number, x: number) => fade(Math.min(1, Math.max(0, (x - a) / (b - a))))

/**
 * A wash for a whole panel: sparse, small dots at the top left that gather and
 * grow toward the bottom right, drifting from the first ink to the second on the way down.
 * Soft clouds keep it from reading as a flat grid. Inks: top, bottom.
 */
export const wash =
  (seed = 0): Sampler =>
  (x, y, w, h, out) => {
    // a diagonal: lightest at the top left, darkest at the bottom right, weighted to the height since panels are tall
    const g = 0.72 * (y / h) + 0.28 * (x / w)
    const n = fbm(x * 0.014 + seed, y * 0.011 + seed * 0.7)
    // capped, so even the bottom keeps a gap between dots and never reads as a solid block
    out.v = Math.min(0.38, (0.06 + Math.pow(g, 1.5) * 0.42) * (0.6 + n * 0.9))
    out.c = g + (n - 0.5) * 0.5 > 0.55 ? 1 : 0
  }

/**
 * The website's ridge, for an empty page: one hill rising on the right over a
 * low ground that thins out to the left, a thin sky above it, and clumps in the ground drawn as
 * larger dots rather than a darker colour. Dot size is capped so the ground
 * never closes into a solid block. Inks: sky, ground.
 */
export const ridge =
  (seed = 0): Sampler =>
  (x, y, w, h, out) => {
    const fx = x / w
    // one hill, on the right; the ground thins out toward the left so it never meets a dotted sidebar
    const fadeIn = smooth(0.02, 0.4, fx)
    const hill = Math.pow(fx, 2.2) * 0.85
    const top = h * (1 - Math.max(0.22, hill) - (fbm(x * 0.012 + seed, seed) - 0.5) * 0.14)
    if (y >= top) {
      const clump = fbm(x * 0.03 + seed * 3.1, y * 0.045 + seed)
      out.c = 1
      out.v = (clump > 0.62 ? 0.6 : 0.3 + smooth(0, 30, y - top) * 0.2) * fadeIn
      return
    }
    out.c = 0
    out.v = smooth(h * 0.7, 0, top - y) * 0.38 * (0.5 + fbm(x * 0.012 + seed, y * 0.02)) * fadeIn
  }

export function Dots({ sampler, inks, cell = 6, className }: { sampler: Sampler; /** token names ("--dot-wash-top"), resolved on the canvas in the current theme */ inks: string[]; /** grid spacing in CSS px */ cell?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const inksKey = inks.join()

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const out: Out = { v: 0, c: 0 }

    // A token resolves through the canvas's own computed colour, so it comes back as this theme's value.
    const colours = () =>
      inks.map((ink) => {
        if (!ink.startsWith('--')) return ink
        canvas.style.color = `var(${ink})`
        const value = getComputedStyle(canvas).color
        canvas.style.color = ''
        return value
      })

    const draw = () => {
      const box = canvas.getBoundingClientRect()
      const dpr = Math.min(2, devicePixelRatio || 1)
      const w = box.width
      const h = box.height
      if (!w || !h) return
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      const r = cell * 0.5
      const paths = inks.map(() => new Path2D())
      for (let j = 0; j * cell < h + cell; j++) {
        const y = j * cell + r
        for (let i = 0; i * cell < w + cell; i++) {
          const x = i * cell + r
          sampler(x, y, w, h, out)
          if (out.v <= 0.02) continue
          if (out.v < 0.5 && out.v < BAYER[(j & 3) * 4 + (i & 3)] * 0.55) continue
          const rad = r * Math.min(1, Math.sqrt(out.v)) * 0.92
          const p = paths[out.c] ?? paths[0]
          p.moveTo(x + rad, y)
          p.arc(x, y, rad, 0, Math.PI * 2)
        }
      }
      const fill = colours()
      paths.forEach((p, k) => {
        ctx.fillStyle = fill[k]
        ctx.fill(p)
      })
    }

    const ro = new ResizeObserver(draw)
    ro.observe(canvas)
    // Redraw in the new colours when the theme flips: the system setting, or the app writing it on <html>.
    const scheme = matchMedia('(prefers-color-scheme: dark)')
    scheme.addEventListener('change', draw)
    const mo = new MutationObserver(draw)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] })
    draw()
    return () => {
      ro.disconnect()
      mo.disconnect()
      scheme.removeEventListener('change', draw)
    }
    // the picture and its inks are fixed for the life of the canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, inksKey])

  return <canvas ref={ref} className={className} aria-hidden="true" />
}
