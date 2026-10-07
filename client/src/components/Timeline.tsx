import { Pause, Play, Radio, Rewind } from 'lucide-react'
import { useMemo, useRef } from 'react'
import type { Frame } from '../lib/types'
import { C, fmtClock } from '../lib/visual'
import { useRun, useRunStore } from '../store/runStore'

export const SPEEDS = [1, 10, 30, 60, 120, 300, 600]

interface Marker { i: number; kind: 'evac' | 'lost' | 'collapse' | 'delivered' }

/** Survival river: width of each band = messages delivered / still alive / lost, over time. */
export function SurvivalRiver({ frames, width, height, cursor }: { frames: Frame[]; width: number; height: number; cursor?: number }) {
  const paths = useMemo(() => {
    if (frames.length < 2) return null
    const n = Math.min(frames.length, 320)
    const step = (frames.length - 1) / (n - 1)
    const pts = Array.from({ length: n }, (_, k) => frames[Math.round(k * step)].metrics)
    const maxC = Math.max(...pts.map((m) => m.created), 1)
    const x = (k: number) => (k / (n - 1)) * width
    const y = (v: number) => height - (v / maxC) * (height - 2)
    const band = (lo: (m: Frame['metrics']) => number, hi: (m: Frame['metrics']) => number) =>
      `M${pts.map((m, k) => `${x(k)},${y(hi(m))}`).join(' L')} L${pts.map((_, k) => `${x(n - 1 - k)},${y(lo(pts[n - 1 - k]))}`).join(' L')} Z`
    return {
      delivered: band(() => 0, (m) => m.delivered),
      alive: band((m) => m.delivered, (m) => m.created - m.lost),
      lost: band((m) => m.created - m.lost, (m) => m.created),
    }
  }, [frames, width, height])
  if (!paths) return <svg width="100%" height={height} />
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
      <path d={paths.delivered} fill={C.safe} opacity={0.55} />
      <path d={paths.alive} fill={C.signal} opacity={0.35} />
      <path d={paths.lost} fill={C.isolated} opacity={0.6} />
      {cursor !== undefined && <line x1={cursor * width} x2={cursor * width} y1={0} y2={height} stroke={C.ink} strokeOpacity={0.7} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

function useMarkers(frames: Frame[]) {
  const cache = useRef<{ len: number; first: number; markers: Marker[] }>({ len: 0, first: -1, markers: [] })
  return useMemo(() => {
    const c = cache.current
    const first = frames[0]?.i ?? -1
    if (first !== c.first || frames.length < c.len) {
      c.len = 0
      c.markers = []
      c.first = first
    }
    for (let k = c.len; k < frames.length; k++) {
      for (const e of frames[k].events) {
        if (e.t === 'node.evacuate' && e.on) c.markers.push({ i: k, kind: 'evac' })
        else if (e.t === 'msg.lost') c.markers.push({ i: k, kind: 'lost' })
        else if (e.t === 'world.collapse') c.markers.push({ i: k, kind: 'collapse' })
      }
    }
    c.len = frames.length
    return c.markers.slice()
  }, [frames])
}

export function Timeline() {
  const store = useRunStore()
  const frames = useRun((s) => s.frames)
  const view = useRun((s) => s.view)
  const mode = useRun((s) => s.mode)
  const paused = useRun((s) => s.paused)
  const playing = useRun((s) => s.replayPlaying)
  const speed = useRun((s) => s.speed)
  const ended = useRun((s) => s.ended)
  const duration = useRun((s) => s.init?.duration_s ?? 7200)
  const markers = useMarkers(frames)
  const last = frames.length - 1
  const idx = view ?? last
  const tick = frames[idx]?.tick ?? 0
  const live = mode === 'live' && view === null
  const isPlaying = mode === 'replay' ? playing : !paused && !ended

  const toggle = () => {
    const s = store.getState()
    if (mode === 'replay') {
      if (!playing && (s.view ?? 0) >= last) store.setState({ view: 0 })
      store.setState({ replayPlaying: !playing })
    } else s.send({ cmd: paused ? 'play' : 'pause' })
  }

  return (
    <div className="panel flex flex-col gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
      <div className="relative h-10 w-full overflow-hidden rounded-md bg-sunken">
        <SurvivalRiver frames={frames} width={1000} height={40} cursor={last > 0 ? idx / last : 1} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary h-9 w-9 !p-0" onClick={toggle} aria-label={isPlaying ? 'Pause' : 'Play'} disabled={mode === 'live' && ended}>
          {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        </button>
        {mode === 'replay' && (
          <button className="btn h-9 w-9 !p-0" onClick={() => store.setState({ view: 0, replayPlaying: false })} aria-label="Rewind">
            <Rewind size={15} />
          </button>
        )}
        <div className="font-mono text-sm tabular-nums">
          <span className="text-ink">T+{fmtClock(tick)}</span>
          <span className="text-mute"> / {fmtClock(duration)}</span>
        </div>
        <select
          value={speed}
          onChange={(e) => {
            const x = Number(e.target.value)
            if (mode === 'replay') store.setState({ speed: x })
            else store.getState().send({ cmd: 'speed', x })
          }}
          className="!py-1 font-mono text-xs"
          aria-label="Simulation speed"
        >
          {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
        </select>
        <div className="relative order-last w-full sm:order-none sm:w-auto sm:min-w-[200px] sm:flex-1">
          <div className="pointer-events-none absolute inset-x-0 -top-2 h-2">
            {last > 0 && markers.map((m, k) => (
              <span
                key={k}
                className="absolute top-0 h-2 w-[2px] rounded"
                style={{
                  left: `${(m.i / last) * 100}%`,
                  background: m.kind === 'evac' ? C.danger : m.kind === 'collapse' ? C.collapse : C.ash,
                  opacity: 0.8,
                }}
              />
            ))}
          </div>
          <input
            type="range"
            className="scrub w-full"
            min={0}
            max={Math.max(last, 0)}
            value={idx}
            onChange={(e) => {
              const v = Number(e.target.value)
              store.setState({ view: mode === 'live' && v >= last ? null : v })
            }}
            aria-label="Timeline"
          />
        </div>
        {mode === 'live' && (
          <button
            className={`chip !py-1 ${live ? 'border-danger/50 text-danger' : 'text-mute hover:text-ink'}`}
            onClick={() => store.setState({ view: null })}
          >
            <Radio size={12} className={live && !paused && !ended ? 'breathe' : ''} /> {ended ? 'END' : 'LIVE'}
          </button>
        )}
        {mode === 'replay' && <span className="chip text-signal">REPLAY</span>}
      </div>
    </div>
  )
}
