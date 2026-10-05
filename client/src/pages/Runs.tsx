import { Columns2, Play, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlowBar } from '../components/Inspector'
import { api } from '../lib/api'
import type { RunMeta } from '../lib/types'

const STATUS_STYLE: Record<string, string> = {
  running: 'text-rose-300 border-rose-500/40',
  paused: 'text-amber-300 border-amber-500/40',
  starting: 'text-amber-300 border-amber-500/40',
  ended: 'text-slate-300',
  failed: 'text-rose-400 border-rose-600/60',
}

export function Runs() {
  const [runs, setRuns] = useState<RunMeta[] | null>(null)
  const [db, setDb] = useState<boolean | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(() => {
    api.runs().then(setRuns).catch((e) => setErr(e.message))
    api.health().then((h) => setDb(h.db)).catch(() => setDb(false))
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [load])

  const remove = async (r: RunMeta) => {
    if (!window.confirm(`Delete run ${r.runId} and its recorded frames? This cannot be undone.`)) return
    await api.remove(r.runId).catch(() => {})
    load()
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Runs</h1>
          <p className="mt-1 text-sm text-mute">
            Every run is event-sourced into MongoDB, so any of them can be replayed and scrubbed later.
            {db === false && <span className="text-amber-300"> MongoDB is not connected: only runs from this server session are listed.</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/command" className="btn btn-primary"><Play size={14} /> New run</Link>
          <Link to="/compare" className="btn"><Columns2 size={14} /> New comparison</Link>
        </div>
      </div>
      {err && <div className="panel mt-6 border-rose-500/40 p-3 text-sm text-rose-200">{err}</div>}
      <div className="panel mt-6 overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-mute">
            <tr className="border-b border-line">
              <th className="px-4 py-3 font-medium">Started</th>
              <th className="px-4 py-3 font-medium">Scenario</th>
              <th className="px-4 py-3 font-medium">Strategy</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="w-56 px-4 py-3 font-medium">Messages</th>
              <th className="px-4 py-3 font-medium">Relay airtime</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {runs?.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-mute">No runs yet. Start one from the command map.</td></tr>
            )}
            {runs?.map((r) => {
              const s = r.summary
              return (
                <tr key={r.runId} className="border-b border-line/60 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 font-mono text-xs text-mute">{new Date(r.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-2.5">{r.scenario}</td>
                  <td className="px-4 py-2.5">
                    {r.strategyLabel}
                    {r.groupId && <Link to={`/compare/${r.groupId}`} className="chip ml-2 text-violet-300 hover:border-violet-400/60">race</Link>}
                  </td>
                  <td className="px-4 py-2.5"><span className={`chip ${STATUS_STYLE[r.status] || ''}`}>{r.status}</span></td>
                  <td className="px-4 py-1">{s ? <FlowBar created={s.created} delivered={s.delivered} lost={s.lost} /> : <span className="text-xs text-mute">T+{r.lastTick ?? 0}s</span>}</td>
                  <td className="px-4 py-2.5 font-mono text-xs">{s ? `${s.relay_airtime_s.toFixed(0)} s` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Link to={`/command/${r.runId}`} className="btn !px-2 !py-1 !text-xs" title={r.status === 'running' || r.status === 'paused' ? 'Watch live' : 'Replay'}>
                        {r.status === 'running' || r.status === 'paused' ? <Play size={13} /> : <RotateCcw size={13} />}
                        {r.status === 'running' || r.status === 'paused' ? 'Watch' : 'Replay'}
                      </Link>
                      <button className="btn !px-2 !py-1 !text-xs text-rose-300" onClick={() => remove(r)} aria-label="Delete run"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
