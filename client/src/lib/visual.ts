import * as THREE from 'three'

/** Fixed colour meanings (mirrors the CSS tokens). */
export const C = {
  bg: '#070d1a',
  ink: '#e6edf7',
  mute: '#8a9bb8',
  signal: '#22d3ee',
  safe: '#34d399',
  warn: '#fbbf24',
  danger: '#f43f5e',
  water: '#3b82f6',
  violet: '#a78bfa',
  dead: '#3a4458',
}

export const NET_COLORS = [C.safe, C.warn, C.violet, '#64748b']
export const CLASS_COLORS: Record<string, string> = { P0: C.danger, P1: C.warn, P2: C.signal, P3: C.mute }

/** World metres -> scene units. The world maps onto a 100 x 100 square; heights are exaggerated. */
export const SCENE = 100
export const VSCALE = 0.35

export function toScene(x: number, y: number, size: number): [number, number] {
  return [(x / size - 0.5) * SCENE, (y / size - 0.5) * SCENE]
}

const calm = new THREE.Color(C.ink)
const amber = new THREE.Color(C.warn)
const red = new THREE.Color(C.danger)

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
