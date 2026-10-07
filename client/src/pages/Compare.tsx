import { motion } from 'framer-motion'
import { Pause, Play, Trophy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from 'zustand'
import { RunHeader } from '../components/RunHeader'
import { ScenarioPicker, type LaunchOptions } from '../components/ScenarioPicker'
import { SPEEDS, SurvivalRiver } from '../components/Timeline'
import { api } from '../lib/api'
import type { Metrics, RunMeta } from '../lib/types'
import { C, fmtClock } from '../lib/visual'
import { RunStoreContext, createRunStore, currentFrame, type RunStore } from '../store/runStore'
import { useReplayTicker, useRunConnection } from '../store/useRunConnection'
import { WorldScene } from '../three/WorldScene'

export function Compare() {
  const { groupId } = useParams()
  return groupId ? <Race key={groupId} groupId={groupId} /> : <CompareLauncher />
}

function CompareLauncher() {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const launch = async (o: LaunchOptions) => {
    setBusy(true)
    try {
      const g = await api.compare({ scenario: o.scenario, strategies: o.strategies, seed: o.seed, speed: o.speed })
      nav(`/compare/${g.groupId}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="grid-bg min-h-[calc(100vh-3.5rem)] px-4 py-10">
      <div className="mx-auto mb-8 max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">Side-by-side proof</h1>
        <p className="mt-2 max-w-2xl text-mute">
          The same disaster, the same seed and the same boxes, run under different forwarding strategies on synced maps.
          You see the difference instead of being told it.
        </p>
        {err && <div className="panel mt-4 border-danger/40 p-3 text-sm text-danger">{err}</div>}
      </div>
      <ScenarioPicker mode="compare" onLaunch={launch} busy={busy} />
    </div>
  )
}

function useGroupStores(groupId: string) {
  const [runs, setRuns] = useState<RunMeta[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    api.group(groupId).then((g) => setRuns(g.runs)).catch((e) => setErr(e.message))
  }, [groupId])
  const stores = useMemo(() => (runs ?? []).map((r) => createRunStore(r.runId)), [runs])
  return { stores, err, runs }
}

function Race({ groupId }: { groupId: string }) {
  const { stores, err } = useGroupStores(groupId)

  // Same seed means the same message keys and node indices on every map: mirror selection across them.
  useEffect(() => {
    let syncing = false
    const unsubs = stores.map((s, k) =>
      s.subscribe((st, prev) => {
        if (syncing || st.selected === prev.selected) return
        syncing = true
        stores.forEach((o, j) => j !== k && o.setState({ selected: st.selected }))
        syncing = false
      }),
    )
    return () => unsubs.forEach((u) => u())
  }, [stores])

  if (err) return <div className="p-8 text-danger">{err}</div>
  if (!stores.length) return <div className="p-8 text-mute">Loading race…</div>
  const cols = stores.length === 2 ? 'md:grid-cols-2' : 'md:grid-cols-2 md:grid-rows-2'

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col gap-3 p-2 sm:p-3 md:h-[calc(100vh-3.5rem)]">
      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-3 ${cols}`}>
        {stores.map((s) => <RaceCell key={s.getState().runId} store={s} />)}
      </div>
      <div className="grid gap-3 lg:grid-cols-[1fr_420px]">
        <GroupTimeline stores={stores} />
        <Scoreboard stores={stores} />
      </div>
    </div>
  )
}

function RaceCell({ store }: { store: RunStore }) {
  useRunConnection(store)
  useReplayTicker(store)
  return (
    <RunStoreContext.Provider value={store}>
      <div className="panel relative min-h-[320px] overflow-hidden md:min-h-[260px]">
        <div className="absolute inset-0"><WorldScene compact /></div>
        <div className="pointer-events-none absolute inset-x-2 top-2">
          <div className="pointer-events-auto"><RunHeader compact /></div>
        </div>
      </div>
    </RunStoreContext.Provider>
  )
}

function GroupTimeline({ stores }: { stores: RunStore[] }) {
  const master = stores[0]
  const frames = useStore(master, (s) => s.frames)
  const view = useStore(master, (s) => s.view)
  const mode = useStore(master, (s) => s.mode)
  const paused = useStore(master, (s) => s.paused)
  const playing = useStore(master, (s) => s.replayPlaying)
  const speed = useStore(master, (s) => s.speed)
  const ended = useStore(master, (s) => s.ended)
  const last = frames.length - 1
  const idx = view ?? last
  const tick = frames[idx]?.tick ?? 0
  const isPlaying = mode === 'replay' ? playing : !paused && !ended

  const seekAll = (v: number | null) => {
    const t = v === null ? null : master.getState().frames[v]?.tick
    for (const s of stores) {
      const fs = s.getState().frames
      if (t === null || t === undefined) s.setState({ view: s.getState().mode === 'live' ? null : fs.length - 1 })
      else {
        let j = fs.findIndex((f) => f.tick >= t)
        if (j < 0) j = fs.length - 1
        s.setState({ view: j, replayPlaying: false })
      }
    }
  }
  const toggle = () => {
    if (mode === 'replay') stores.forEach((s) => s.setState({ replayPlaying: !playing }))
    else master.getState().send({ cmd: paused ? 'play' : 'pause' }) // the server fans control out to the whole group
  }

  return (
    <div className="panel flex flex-wrap items-center gap-3 px-4 py-3">
      <button className="btn btn-primary h-9 w-9 !p-0" onClick={toggle} disabled={mode === 'live' && ended} aria-label={isPlaying ? 'Pause all' : 'Play all'}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <span className="font-mono text-sm tabular-nums">T+{fmtClock(tick)}</span>
      <select
        value={speed}
        className="!py-1 font-mono text-xs"
        onChange={(e) => {
          const x = Number(e.target.value)
          if (mode === 'replay') stores.forEach((s) => s.setState({ speed: x }))
          else master.getState().send({ cmd: 'speed', x })
          stores.forEach((s) => s.setState({ speed: x }))
        }}
        aria-label="Speed for all maps"
      >
        {SPEEDS.map((s) => <option key={s} value={s}>{s}×</option>)}
      </select>
      <input
        type="range" className="scrub min-w-[200px] flex-1" min={0} max={Math.max(last, 0)} value={idx}
        onChange={(e) => {
          const v = Number(e.target.value)
          seekAll(mode === 'live' && v >= last ? null : v)
        }}
        aria-label="Shared timeline"
      />
      {mode === 'live' && <button className="chip text-danger" onClick={() => seekAll(null)}>{ended ? 'END' : 'LIVE'}</button>}
    </div>
  )
}

/** Re-render (at most ~5 times a second) whenever any store in the group shows a different frame. */
function useGroupTick(stores: RunStore[]) {
  const [, setN] = useState(0)
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null
    const bump = () => {
      if (!t) t = setTimeout(() => { t = null; setN((n) => n + 1) }, 200)
    }
    const unsubs = stores.map((s) => s.subscribe((a, b) => { if (a.frames !== b.frames || a.view !== b.view) bump() }))
    return () => { unsubs.forEach((u) => u()); if (t) clearTimeout(t) }
  }, [stores])
}

function useMetrics(store: RunStore) {
  const frame = useStore(store, currentFrame)
  const label = useStore(store, (s) => s.init?.strategy_label ?? s.meta?.strategyLabel ?? '…')
  const frames = useStore(store, (s) => s.frames)
  const view = useStore(store, (s) => s.view)
  return { m: frame?.metrics as Metrics | undefined, label, frames: view === null ? frames : frames.slice(0, view + 1) }
}

/** End card: three big figures, each drawn as a bar per strategy rather than a lone number. */
function Scoreboard({ stores }: { stores: RunStore[] }) {
  useGroupTick(stores)
  return (
    <div className="panel px-4 py-3">
      <div className="mb-2 flex items-center gap-2"><Trophy size={14} className="text-warn" /><span className="label">Standings</span></div>
      <div className="grid grid-cols-3 gap-4">
        <Metric stores={stores} title="Delivered" pick={(m) => m.delivered} color={C.safe} best="max" />
        <Metric stores={stores} title="Lost with box" pick={(m) => m.lost} color={C.ash} best="min" />
        <Metric stores={stores} title="Relay airtime (s)" pick={(m) => m.relay_airtime_s} color={C.warn} best="min" />
      </div>
      <div className="mt-3 grid gap-1">
        {stores.map((s) => <RiverRow key={s.getState().runId} store={s} />)}
      </div>
    </div>
  )
}

function RiverRow({ store }: { store: RunStore }) {
  const { label, frames } = useMetrics(store)
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 truncate text-[10px] text-mute">{label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded bg-sunken"><SurvivalRiver frames={frames} width={600} height={20} /></div>
    </div>
  )
}

function Metric({ stores, title, pick, color, best }: { stores: RunStore[]; title: string; pick: (m: Metrics) => number; color: string; best: 'max' | 'min' }) {
  const vals = stores.map((s) => {
    const f = currentFrame(s.getState())
    return { label: s.getState().init?.strategy_label ?? '…', v: f ? pick(f.metrics) : 0 }
  })
  const max = Math.max(...vals.map((x) => x.v), 1e-9)
  const winner = best === 'max' ? Math.max(...vals.map((x) => x.v)) : Math.min(...vals.map((x) => x.v))
  return (
    <div>
      <div className="mb-1 text-[11px] text-mute">{title}</div>
      <div className="flex flex-col gap-1">
        {vals.map((x, k) => (
          <div key={k} className="flex items-center gap-1.5" title={`${x.label}: ${Number.isInteger(x.v) ? x.v : x.v.toFixed(1)}`}>
            <div className="h-2.5 flex-1 overflow-hidden rounded bg-line">
              <motion.div className="h-full rounded" style={{ background: color, opacity: x.v === winner ? 1 : 0.45 }} animate={{ width: `${(x.v / max) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
            <span className="w-10 text-right font-mono text-[10px] tabular-nums">{Number.isInteger(x.v) ? x.v : x.v.toFixed(0)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
