import { Activity, Flame, Skull, Square } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { C } from '../lib/visual'
import { currentFrame, useRun, useRunStore } from '../store/runStore'
import { FlowBar } from './Inspector'

export function RunHeader({ compact = false }: { compact?: boolean }) {
  const store = useRunStore()
  const nav = useNavigate()
  const init = useRun((s) => s.init)
  const frame = useRun(currentFrame)
  const meta = useRun((s) => s.meta)
  const connected = useRun((s) => s.connected)
  const mode = useRun((s) => s.mode)
  const ended = useRun((s) => s.ended)
  const error = useRun((s) => s.error)
  const m = frame?.metrics
  const relayAir = m ? m.relay_airtime_s : 0
  const nodes = init?.nodes.length ?? 1
  // Average relaying airtime per box as a share of its legal hourly allowance (bounded to 100%).
  const airShare = init && m && frame ? Math.min(relayAir / nodes / Math.max(init.cfg.airtime_s * Math.max(frame.tick / 3600, 1), 1e-9), 1) : 0

  if (error) {
    return <div className="panel border-danger/40 p-3 text-sm text-danger">{error}</div>
  }
  return (
    <div className={`panel flex flex-wrap items-center gap-x-5 gap-y-2 ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${mode === 'live' && connected && !ended ? 'breathe bg-danger' : ended ? 'bg-mute' : 'bg-warn'}`}
            title={mode === 'replay' ? 'replay' : connected ? 'live' : 'connecting'}
          />
          <span className={`${compact ? 'text-sm' : 'text-base'} truncate font-semibold`}>{init?.title ?? meta?.scenario ?? '…'}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-mute">
          <span className="chip !py-0 text-signal">{init?.strategy_label ?? meta?.strategyLabel}</span>
          <span className="font-mono">seed {init?.seed ?? meta?.seed ?? '—'}</span>
        </div>
      </div>
      {m && (
        <>
          <div className="min-w-[180px] flex-1">
            <FlowBar created={m.created} delivered={m.delivered} lost={m.lost} />
          </div>
          <div className="flex items-center gap-2" title={`relay airtime ${relayAir.toFixed(1)} s across all boxes (${(airShare * 100).toFixed(2)}% of the legal budget)`}>
            <Activity size={14} className="text-signal" />
            <div className="h-2 w-20 overflow-hidden rounded-full bg-line">
              <div className="h-full" style={{ width: `${Math.max(airShare * 100, 1)}%`, background: airShare > 0.5 ? C.warn : C.signal }} />
            </div>
            <span className="font-mono text-[10px] text-mute">airtime</span>
          </div>
          {!compact && (
            <div className="flex items-center gap-2">
              <span className="chip text-danger" title="evacuations started"><Flame size={12} />{m.evacuations}</span>
              <span className="chip text-ink/80" title="boxes destroyed"><Skull size={12} />{m.dead}</span>
            </div>
          )}
        </>
      )}
      {!compact && mode === 'live' && !ended && (
        <button
          className="btn !px-2.5 !py-1.5 !text-xs"
          onClick={() => { store.getState().send({ cmd: 'stop' }); setTimeout(() => nav('/runs'), 600) }}
          title="Stop this run (it stays in history for replay)"
        >
          <Square size={12} /> Stop
        </button>
      )}
    </div>
  )
}
