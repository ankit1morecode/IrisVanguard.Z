import * as THREE from 'three'

/** Fixed colour meanings (mirrors the CSS tokens), per theme. */
const DARK = {
  bg: '#0b0b10',
  panel: '#15151d',
  ink: '#ececf1',
  mute: '#9494a8',
  signal: '#8b7cff',
  signalSoft: '#c4bbff',
  safe: '#22c55e',
  warn: '#f59e0b',
  danger: '#ef4444',
  water: '#3b82f6',
  part: '#ec4899',
  dead: '#3d3d4f',
  isolated: '#6b6b80',
  ash: '#9494a8',
  collapse: '#fb923c',
  inject: '#f472b6',
  link: '#8b7cff',
  linkWeak: '#f59e0b',
  body: '#d6d6e2',
}

const LIGHT: typeof DARK = {
  bg: '#f7f7fb',
  panel: '#ffffff',
  ink: '#16161d',
  mute: '#6b6b80',
  signal: '#5b4bdb',
  signalSoft: '#8b7cff',
  safe: '#16a34a',
  warn: '#d97706',
  danger: '#dc2626',
  water: '#2563eb',
  part: '#db2777',
  dead: '#a1a1b5',
  isolated: '#8a8aa0',
  ash: '#6b6b80',
  collapse: '#ea580c',
  inject: '#db2777',
  link: '#5b4bdb',
  linkWeak: '#d97706',
  body: '#3a3a4c',
}

/** 3D scene look per theme: surfaces, terrain bands and whether glows add light (dark) or paint (light). */
const SCENE_DARK = {
  light: false,
  bed: [0.008, 0.01, 0.03], low: [0.016, 0.018, 0.032], mid: [0.026, 0.026, 0.045], high: [0.055, 0.055, 0.085],
  contour: [0.3, 0.22, 0.9], contourAlpha: 0.16, grid: [0.3, 0.3, 0.5], gridAlpha: 0.05, skirt: '#101017',
  shallow: [0.18, 0.42, 0.95], deep: [0.05, 0.12, 0.42], foam: [0.8, 0.88, 1.0],
  bloom: 0.9, glow: 1, fog: [140, 330] as [number, number],
}
const SCENE_LIGHT: typeof SCENE_DARK = {
  light: true,
  bed: [0.3, 0.34, 0.46], low: [0.5, 0.54, 0.6], mid: [0.58, 0.58, 0.66], high: [0.72, 0.72, 0.8],
  contour: [0.12, 0.08, 0.62], contourAlpha: 0.35, grid: [0.3, 0.3, 0.5], gridAlpha: 0.06, skirt: '#dcdce6',
  shallow: [0.45, 0.68, 1.0], deep: [0.15, 0.36, 0.85], foam: [1.0, 1.0, 1.0],
  bloom: 0.15, glow: 0.85, fog: [180, 420] as [number, number],
}

// Live bindings: importers always see the active theme's values.
export let C = DARK
export let SCENE_THEME = SCENE_DARK
export let NET_COLORS = [C.safe, C.warn, C.part, C.isolated]
export let CLASS_COLORS: Record<string, string> = { P0: C.danger, P1: C.warn, P2: C.signal, P3: C.mute }

const calm = new THREE.Color()
const amber = new THREE.Color()
const red = new THREE.Color()

export function applyPalette(theme: 'dark' | 'light') {
  C = theme === 'light' ? LIGHT : DARK
  SCENE_THEME = theme === 'light' ? SCENE_LIGHT : SCENE_DARK
  NET_COLORS = [C.safe, C.warn, C.part, C.isolated]
  CLASS_COLORS = { P0: C.danger, P1: C.warn, P2: C.signal, P3: C.mute }
  calm.set(theme === 'light' ? LIGHT.mute : DARK.ink)
  amber.set(C.warn)
  red.set(C.danger)
}
applyPalette('dark')

/** Blending for glows: additive light on dark backgrounds, ordinary paint on light ones. */
export const glowBlending = () => (SCENE_THEME.light ? THREE.NormalBlending : THREE.AdditiveBlending)

/** World metres -> scene units. The world maps onto a 100 x 100 square; heights are exaggerated. */
export const SCENE = 100
export const VSCALE = 0.35

export function toScene(x: number, y: number, size: number): [number, number] {
  return [(x / size - 0.5) * SCENE, (y / size - 0.5) * SCENE]
}

/** Halo colour runs calm -> amber -> red as the predicted life (tau) falls. */
export function tauColor(tau: number, out: THREE.Color, evacTau = 300) {
  if (tau >= 6 * 3600) return out.copy(calm)
  if (tau >= 3600) return out.copy(calm).lerp(amber, 1 - (tau - 3600) / (5 * 3600))
  if (tau >= evacTau) return out.copy(amber).lerp(red, 1 - (tau - evacTau) / (3600 - evacTau))
  return out.copy(red)
}

/** Pulse rate (Hz) speeds up as tau falls: speed encodes urgency. */
export function tauPulseHz(tau: number) {
  if (tau > 6 * 3600) return 0.12
  return Math.min(0.12 + 2.5 * Math.exp(-tau / 900), 3)
}

export function fmtClock(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function fmtTau(tau: number) {
  if (tau >= 72 * 3600) return '> 72 h'
  if (tau >= 3600) return `${(tau / 3600).toFixed(1)} h`
  if (tau >= 60) return `${Math.round(tau / 60)} min`
  return `${Math.round(tau)} s`
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
