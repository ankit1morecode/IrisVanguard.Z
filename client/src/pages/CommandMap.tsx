import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Inspector } from '../components/Inspector'
import { Legend } from '../components/Legend'
import { RunHeader } from '../components/RunHeader'
import { ScenarioPicker, type LaunchOptions } from '../components/ScenarioPicker'
import { Timeline } from '../components/Timeline'
import { api } from '../lib/api'
import { RunStoreContext, createRunStore } from '../store/runStore'
import { useReplayTicker, useRunConnection } from '../store/useRunConnection'
import { WorldScene } from '../three/WorldScene'

export function CommandMap() {
  const { runId } = useParams()
  return runId ? <LiveCommandMap key={runId} runId={runId} /> : <Launcher />
}

function Launcher() {
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const launch = async (o: LaunchOptions) => {
    setBusy(true)
    setErr(null)
    try {
      const run = await api.start({ scenario: o.scenario, strategy: o.strategies[0], seed: o.seed, speed: o.speed })
      nav(`/command/${run.runId}`)
    } catch (e) {
      setErr((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <div className="grid-bg min-h-[calc(100vh-3.5rem)] px-4 py-10">
      <div className="mx-auto mb-8 max-w-5xl">
        <h1 className="text-3xl font-semibold tracking-tight">Command map</h1>
        <p className="mt-2 max-w-2xl text-mute">
          Start a live digital twin: hundreds of simulated boxes running the real survival rules while the disaster unfolds.
          Click any box to inspect it, or sink it and watch its messages escape.
        </p>
        {err && <div className="panel mt-4 border-danger/40 p-3 text-sm text-danger">{err}</div>}
      </div>
      <ScenarioPicker mode="single" onLaunch={launch} busy={busy} />
    </div>
  )
}

function LiveCommandMap({ runId }: { runId: string }) {
  const store = useMemo(() => createRunStore(runId), [runId])
  useRunConnection(store)
  useReplayTicker(store)
  return (
    <RunStoreContext.Provider value={store}>
      <div className="relative h-[calc(100vh-3.5rem)] overflow-hidden">
        <div className="absolute inset-0">
          <WorldScene />
        </div>
        <div className="pointer-events-none absolute inset-0 flex flex-col gap-2 p-2 sm:gap-3 sm:p-3">
          <div className="pointer-events-auto"><RunHeader /></div>
          <div className="flex min-h-0 flex-1 flex-col justify-between gap-3 md:flex-row md:items-start">
            <div className="pointer-events-auto hidden h-full md:flex"><Legend /></div>
            <div className="pointer-events-auto mt-auto h-[44%] w-full md:mt-0 md:h-full md:w-[360px]"><Inspector /></div>
          </div>
          <div className="pointer-events-auto"><Timeline /></div>
        </div>
      </div>
    </RunStoreContext.Provider>
  )
}
