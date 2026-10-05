export type Kind = 'household' | 'relay' | 'gateway' | 'boat'

export interface InitPayload {
  type: 'init'
  run: string
  scenario: string
  title: string
  strategy: string
  strategy_label: string
  seed: number
  duration_s: number
  terrain: { size_m: number; grid: number; elev: number[] }
  water: { level_m: number }
  cfg: { airtime_s: number; owner_airtime_s: number; reserve_frac: number; evac_tau_s: number; targets: Record<string, number> }
  nodes: { id: string; kind: Kind; mount: string; h: number; solar: boolean }[]
}

export interface SimEvent {
  t: string
  tick: number
  key?: string
  node?: number
  from?: number
  to?: number
  [k: string]: unknown
}

export interface Metrics {
  created: number
  delivered: number
  lost: number
  copies: number
  failed: number
  airtime_s: number
  relay_airtime_s: number
  energy_j: number
  beacons: number
  dead: number
  evacuations: number
}

/** [key, class, survival S, status 0 alive | 1 delivered | 2 lost, origin, holders] */
export type MsgRow = [string, string, number, number, number, number[]]

export interface FocusPayload {
  node: number
  id: string
  alive: boolean
  death_cause: string | null
  tau: number
  lam: number
  mu: number
  causes: string[]
  evacuating: boolean
  battery_j: number
  reserve_j: number
  capacity_j: number
  airtime_used_s: number
  airtime_s: number
  owner_airtime_s: number
  sensors: null | { pressure_kpa: number; water_pads: boolean; accel_g: number; tilt_deg: number; temp_c: number; water_over_m: number }
  store: [string, string, number][]
  nbrs: [number, number, boolean][]
  trace: [string, number, number, number, string[], string][]
}

export interface Frame {
  type: 'frame'
  run: string
  tick: number
  i: number
  nodes: {
    x: number[]; y: number[]; z: number[]; tau: number[]; batt: number[]; air: number[]
    state: number[]; store: number[]; causes: number[]; net: number[]
  }
  links?: number[]
  msgs: MsgRow[]
  events: SimEvent[]
  water: { level_m: number; rev: number }
  metrics: Metrics
  focus?: FocusPayload
}

export interface RunMeta {
  runId: string
  groupId: string | null
  scenario: string
  strategy: string
  strategyLabel: string
  seed: number | null
  speed: number
  status: 'starting' | 'running' | 'paused' | 'ended' | 'failed'
  startedAt: string
  endedAt: string | null
  durationS?: number
  lastTick?: number
  frameCount?: number
  summary?: Summary | null
  error?: string
  live: boolean
}

export interface Summary extends Metrics {
  strategy: string
  scenario: string
  seed: number
  ticks: number
  delivery_ratio: number
  p0_delivery_ratio: number
  mean_latency_s: number | null
  alive_undelivered: number
}

export interface ScenarioInfo {
  name: string
  title: string
  description: string
  durationS: number
  seed: number
  sizeM: number
  nodes: Record<string, number>
  nodeCount: number
  hasFlood: boolean
  collapses: number
}

export interface MsgInfo {
  key: string
  cls: string
  node: number
  at: [number, number]
  persons: number
  needs: string
  tick: number
}

export const NODE_STATE = ['ok', 'degrading', 'evacuating', 'dead'] as const
export const NET_STATE = ['connected', 'degraded', 'fragmented', 'isolated'] as const
export const CAUSES: [number, string][] = [
  [1, 'submersion'], [2, 'water_pads'], [4, 'shock'], [8, 'tilt'], [16, 'heat'], [32, 'battery'],
]
