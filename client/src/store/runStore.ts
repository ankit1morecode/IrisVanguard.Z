import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { FocusPayload, Frame, InitPayload, MsgInfo, RunMeta } from '../lib/types'

const MAX_FRAMES = 10000

export type Selection = { kind: 'node'; idx: number } | { kind: 'msg'; key: string } | null

export interface FocusSample {
  tick: number
  tau: number
  batt: number
  air: number
  pressure: number
  accel: number
  temp: number
}

export interface RunState {
  runId: string
  mode: 'live' | 'replay'
  meta: RunMeta | null
  init: InitPayload | null
  frames: Frame[]
  view: number | null
  connected: boolean
  ended: boolean
  error: string | null
  paused: boolean
  speed: number
  replayPlaying: boolean
  selected: Selection
  hovered: number | null
  msgInfo: Record<string, MsgInfo>
  focus: FocusPayload | null
  focusHist: FocusSample[]
  sender: ((cmd: Record<string, unknown>) => void) | null

  setMeta: (m: RunMeta) => void
  setInit: (i: InitPayload) => void
  pushFrames: (fs: Frame[]) => void
  setView: (v: number | null) => void
  select: (s: Selection) => void
  hover: (idx: number | null) => void
  send: (cmd: Record<string, unknown>) => void
  set: (p: Partial<RunState>) => void
}

export function createRunStore(runId: string, mode: 'live' | 'replay' = 'live') {
  return createStore<RunState>((set, get) => ({
    runId,
    mode,
    meta: null,
    init: null,
    frames: [],
    view: null,
    connected: false,
    ended: false,
    error: null,
    paused: false,
    speed: 60,
    replayPlaying: false,
    selected: null,
    hovered: null,
    msgInfo: {},
    focus: null,
    focusHist: [],
    sender: null,

    setMeta: (meta) => set({ meta, speed: meta.speed || get().speed, paused: meta.status === 'paused' }),
    setInit: (init) => set({ init }),

    pushFrames: (incoming) => {
      if (!incoming.length) return
      const s = get()
      const known = s.frames.length ? s.frames[s.frames.length - 1].i : -1
      const fresh = incoming.filter((f) => f.i === undefined || f.i > known)
      if (!fresh.length) return
      let frames = s.frames.concat(fresh)
      let view = s.view
      if (frames.length > MAX_FRAMES) {
        const drop = frames.length - MAX_FRAMES
        frames = frames.slice(drop)
        if (view !== null) view = Math.max(view - drop, 0)
      }
      let msgInfo = s.msgInfo
      let focus = s.focus
      let focusHist = s.focusHist
      for (const f of fresh) {
        for (const e of f.events) {
          if (e.t === 'msg.created' && e.key) {
            if (msgInfo === s.msgInfo) msgInfo = { ...s.msgInfo }
            msgInfo[e.key] = {
              key: e.key, cls: String(e.cls), node: Number(e.node), at: e.at as [number, number],
              persons: Number(e.persons), needs: String(e.needs), tick: e.tick,
            }
          }
        }
        const sel = s.selected
        if (f.focus && sel?.kind === 'node' && f.focus.node === sel.idx) {
          focus = f.focus
          const sn = f.focus.sensors
          const sample = {
            tick: f.tick, tau: f.focus.tau, batt: f.focus.battery_j / f.focus.capacity_j,
            air: f.focus.airtime_used_s / f.focus.airtime_s, pressure: sn?.pressure_kpa ?? 0,
            accel: sn?.accel_g ?? 1, temp: sn?.temp_c ?? 0,
          }
          focusHist = focusHist.length > 600 ? [...focusHist.slice(-600), sample] : [...focusHist, sample]
        }
      }
      set({ frames, view, msgInfo, focus, focusHist })
    },

    setView: (view) => set({ view }),

    select: (selected) => {
      const s = get()
      if (selected?.kind === 'node') {
        s.send({ cmd: 'focus', node: selected.idx })
      } else if (s.selected?.kind === 'node') {
        s.send({ cmd: 'focus', node: null })
      }
      const sameNode = selected?.kind === 'node' && s.selected?.kind === 'node' && s.selected.idx === selected.idx
      set({ selected, ...(sameNode ? {} : { focus: null, focusHist: [] }) })
    },

    hover: (hovered) => set({ hovered }),

    send: (cmd) => {
      const { sender, mode } = get()
      if (mode === 'replay') return
      if (cmd.cmd === 'pause') set({ paused: true })
      if (cmd.cmd === 'play') set({ paused: false })
      if (cmd.cmd === 'speed') set({ speed: Number(cmd.x) })
      sender?.(cmd)
    },

    set: (p) => set(p),
  }))
}

export type RunStore = StoreApi<RunState>

export const RunStoreContext = createContext<RunStore | null>(null)

export function useRun<T>(selector: (s: RunState) => T): T {
  const store = useContext(RunStoreContext)
  if (!store) throw new Error('useRun must be used inside a RunStoreContext provider')
  return useStore(store, selector)
}

export function useRunStore(): RunStore {
  const store = useContext(RunStoreContext)
  if (!store) throw new Error('useRunStore must be used inside a RunStoreContext provider')
  return store
}

export const currentFrame = (s: RunState): Frame | null =>
  s.frames.length ? s.frames[s.view ?? s.frames.length - 1] ?? null : null

const NO_LINKS: number[] = []

/** Links are sent every 30 simulated seconds; use the latest ones at or before the viewed frame. */
export const linksAt = (s: RunState): number[] => {
  const end = s.view ?? s.frames.length - 1
  for (let i = end; i >= 0 && i > end - 400; i--) {
    const l = s.frames[i]?.links
    if (l) return l
  }
  return NO_LINKS
}
