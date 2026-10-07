import * as THREE from 'three'
import { C } from '../lib/visual'

/** Hazard glyphs drawn once onto canvases: water drop, cracked ring, flame, empty cell, tilt. */
type Painter = (g: CanvasRenderingContext2D, s: number) => void

const painters: Record<string, Painter> = {
  submersion: (g, s) => {
    g.fillStyle = '#60a5fa'
    g.beginPath()
    g.moveTo(s / 2, s * 0.12)
    g.bezierCurveTo(s * 0.86, s * 0.55, s * 0.78, s * 0.88, s / 2, s * 0.88)
    g.bezierCurveTo(s * 0.22, s * 0.88, s * 0.14, s * 0.55, s / 2, s * 0.12)
    g.fill()
  },
  water_pads: (g, s) => {
    painters.submersion(g, s)
    g.strokeStyle = '#f43f5e'
    g.lineWidth = s * 0.08
    g.beginPath()
    g.arc(s / 2, s / 2, s * 0.42, 0, Math.PI * 2)
    g.stroke()
  },
  shock: (g, s) => {
    g.strokeStyle = '#fbbf24'
    g.lineWidth = s * 0.1
    g.beginPath()
    g.arc(s / 2, s / 2, s * 0.32, 0.3, Math.PI * 1.7)
    g.stroke()
    g.beginPath()
    g.moveTo(s * 0.62, s * 0.2)
    g.lineTo(s * 0.48, s * 0.48)
    g.lineTo(s * 0.62, s * 0.55)
    g.lineTo(s * 0.5, s * 0.84)
    g.stroke()
  },
  tilt: (g, s) => {
    g.save()
    g.translate(s / 2, s / 2)
    g.rotate(0.6)
    g.fillStyle = '#fbbf24'
    g.fillRect(-s * 0.2, -s * 0.3, s * 0.4, s * 0.6)
    g.restore()
  },
  heat: (g, s) => {
    const grad = g.createLinearGradient(0, s, 0, 0)
    grad.addColorStop(0, '#f43f5e')
    grad.addColorStop(1, '#fbbf24')
    g.fillStyle = grad
    g.beginPath()
    g.moveTo(s / 2, s * 0.1)
    g.bezierCurveTo(s * 0.95, s * 0.5, s * 0.75, s * 0.92, s / 2, s * 0.92)
    g.bezierCurveTo(s * 0.25, s * 0.92, s * 0.1, s * 0.6, s * 0.35, s * 0.35)
    g.bezierCurveTo(s * 0.38, s * 0.5, s * 0.45, s * 0.55, s * 0.5, s * 0.5)
    g.closePath()
    g.fill()
  },
  battery: (g, s) => {
    g.strokeStyle = '#f43f5e'
    g.lineWidth = s * 0.08
    g.strokeRect(s * 0.22, s * 0.25, s * 0.5, s * 0.5)
    g.fillStyle = '#f43f5e'
    g.fillRect(s * 0.72, s * 0.4, s * 0.08, s * 0.2)
    g.fillRect(s * 0.28, s * 0.6, s * 0.1, s * 0.1)
  },
}

const cache: Record<string, THREE.Texture> = {}

export function glyphTexture(cause: string): THREE.Texture {
  const id = `${C.bg}:${cause}`
  if (cache[id]) return cache[id]
  const s = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = s
  const g = canvas.getContext('2d')!
  g.fillStyle = C.panel
  g.globalAlpha = 0.9
  g.beginPath()
  g.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  ;(painters[cause] || painters.shock)(g, s)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  cache[id] = tex
  return tex
}

/** Priority order: the most dangerous cause wins the single glyph slot. */
export const CAUSE_PRIORITY: [number, string][] = [
  [2, 'water_pads'], [1, 'submersion'], [16, 'heat'], [4, 'shock'], [32, 'battery'], [8, 'tilt'],
]

export function primaryCause(bits: number): string | null {
  for (const [b, name] of CAUSE_PRIORITY) if (bits & b) return name
  return null
}
