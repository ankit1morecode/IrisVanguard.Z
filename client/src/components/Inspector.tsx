import { AnimatePresence, motion } from 'framer-motion'
import { Bomb, Building2, ChevronRight, Droplets, Flame, Radio, Siren, Skull, Waves, X, Zap } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api'
import { CAUSES, NET_STATE, type Frame, type InitPayload, type SimEvent } from '../lib/types'
import { C, CLASS_COLORS, NET_COLORS, fmtClock, fmtTau, tauColor } from '../lib/visual'
import { currentFrame, useRun, useRunStore } from '../store/runStore'
import { AirtimeHourglass, BatteryGlyph, GateChips, Sparkline, SurvivalRing } from './glyphs'
import * as THREE from 'three'

const CAUSE_ICON: Record<string, typeof Droplets> = {
  submersion: Waves, water_pads: Droplets, shock: Zap, tilt: Building2, heat: Flame, battery: Zap,
}
const tmp = new THREE.Color()

export function Inspector() {
  const selected = useRun((s) => s.selected)
  return (
    <AnimatePresence mode="wait">
      {selected?.kind === 'node' && (
        <motion.div key={`n${selected.idx}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }} className="h-full">
          <NodeInspector idx={selected.idx} />
        </motion.div>
      )}
      {selected?.kind === 'msg' && (
        <motion.div key={`m${selected.key}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.2 }} className="h-full">
          <MessageInspector msgKey={selected.key} />
        </motion.div>
      )}
      {!selected && (
        <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full">
          <MessageList />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="border-t border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="label">{title}</span>
        {right}
      </div>
      {children}
    </div>
  )
}

function NodeInspector({ idx }: { idx: number }) {
  const store = useRunStore()
  const init = useRun((s) => s.init)!
  const frame = useRun(currentFrame)!
  const focus = useRun((s) => (s.focus?.node === idx ? s.focus : null))
  const hist = useRun((s) => s.focusHist)
  const mode = useRun((s) => s.mode)
  const ended = useRun((s) => s.ended)
  const node = init.nodes[idx]
  if (!node || !frame) return null
  const st = frame.nodes.state[idx]
  const tau = frame.nodes.tau[idx]
  const dead = st === 3
  const causes = CAUSES.filter(([b]) => frame.nodes.causes[idx] & b).map(([, n]) => n)
  const halo = `#${tauColor(tau, tmp, init.cfg.evac_tau_s).getHexString()}`
  const net = frame.nodes.net[idx]
  const canInject = mode === 'live' && !ended && !dead && node.kind !== 'gateway'
  const inject = (action: string, extra: Record<string, unknown> = {}) => store.getState().send({ cmd: 'inject', action, node: idx, ...extra })

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="relative grid h-14 w-14 shrink-0 place-items-center">
          {!dead && <span className={`absolute inset-0 rounded-full border-[3px] ${st >= 1 ? 'breathe' : ''}`} style={{ borderColor: halo, boxShadow: `0 0 18px ${halo}` }} />}
          <span className={`h-5 w-5 rounded ${dead ? 'bg-slate-600' : 'bg-slate-200'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-mono text-lg font-semibold">{node.id}</h3>
            <span className="chip capitalize">{node.kind}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-mute">
            <span>{node.mount}{node.kind !== 'boat' ? ` · ${node.h} m` : ''}{node.solar ? ' · solar' : ''}</span>
            {!dead && <span className="chip" style={{ color: NET_COLORS[net], borderColor: `${NET_COLORS[net]}55` }}>{NET_STATE[net]}</span>}
          </div>
        </div>
        <button className="text-mute hover:text-white" onClick={() => store.getState().select(null)} aria-label="Close"><X size={18} /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {dead && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/40 p-2 text-sm text-slate-300">
            <Skull size={16} /> Box destroyed{focus?.death_cause ? ` (${focus.death_cause})` : ''}
          </div>
        )}
        {st === 2 && (
          <div className="mx-4 mb-3 flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 p-2 text-sm text-rose-200">
            <Siren size={16} className="breathe" /> Evacuating: handing its messages to safer boxes
          </div>
        )}

        <Section title="Predicted life" right={<span className="font-mono text-xs text-mute" title="expected time left (τ)">{dead ? '—' : `τ ${fmtTau(tau)}`}</span>}>
          <div className="flex flex-wrap gap-1.5">
            {causes.length === 0 && !dead && <span className="chip text-emerald-300">no hazard sensed</span>}
            {causes.map((c) => {
              const Icon = CAUSE_ICON[c] || Zap
              return <span key={c} className="chip border-amber-400/40 text-amber-200"><Icon size={12} />{c.replace('_', ' ')}</span>
            })}
          </div>
          {hist.length > 1 && (
            <div className="mt-3 grid grid-cols-2 gap-3 text-[10px] text-mute">
              <div title="pressure (kPa): rises ~1 kPa per 10 cm of water">
                pressure
                <Sparkline values={hist.map((h) => h.pressure)} width={140} color={C.water} />
              </div>
              <div title="acceleration (g)">
                shock
                <Sparkline values={hist.map((h) => h.accel)} width={140} color={C.warn} min={0} />
              </div>
              <div title="temperature (°C)">
                temperature
                <Sparkline values={hist.map((h) => h.temp)} width={140} color={C.danger} />
              </div>
              <div title="predicted life τ (log scale)">
                life τ
                <Sparkline values={hist.map((h) => Math.log10(Math.max(h.tau, 1)))} width={140} color={C.ink} threshold={Math.log10(init.cfg.evac_tau_s)} />
              </div>
            </div>
          )}
        </Section>

        <Section title="Energy & airtime">
          <div className="flex items-center gap-5">
            <div title={`battery ${(frame.nodes.batt[idx] * 100).toFixed(1)}% · hatched = 72 h owner reserve`}>
              <BatteryGlyph frac={frame.nodes.batt[idx]} reserveFrac={init.cfg.reserve_frac} evacuating={st === 2} />
              <div className="mt-1 text-[10px] text-mute">battery · reserve</div>
            </div>
            <div className="flex items-center gap-2" title={`airtime ${(frame.nodes.air[idx] * init.cfg.airtime_s).toFixed(1)} / ${init.cfg.airtime_s} s this hour · red fence = owner's SOS slice`}>
              <AirtimeHourglass used={frame.nodes.air[idx] * init.cfg.airtime_s} allowance={init.cfg.airtime_s} owner={init.cfg.owner_airtime_s} />
              <div className="text-[10px] text-mute">legal<br />airtime</div>
            </div>
          </div>
        </Section>

        <Section title={`Holding ${frame.nodes.store[idx]} message${frame.nodes.store[idx] === 1 ? '' : 's'}`}>
          <div className="flex flex-col gap-1">
            {(focus?.store ?? []).map(([key, cls, S]) => (
              <button key={key} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-left hover:bg-white/5" onClick={() => store.getState().select({ kind: 'msg', key })}>
                <SurvivalRing S={S} target={init.cfg.targets[cls] ?? 0.9} size={26} />
                <span className="font-mono text-xs">{key}</span>
                <span className="ml-auto font-mono text-[10px]" style={{ color: CLASS_COLORS[cls] }}>{cls}</span>
              </button>
            ))}
            {!focus && frame.nodes.store[idx] > 0 && <span className="text-xs text-mute">loading…</span>}
          </div>
        </Section>

        {focus && focus.trace.length > 0 && (
          <Section title="Why it sent (or didn't)">
            <div className="flex flex-col gap-1.5">
              {focus.trace.slice(-8).reverse().map(([key, to, , gain, failed, kind], k) => (
                <div key={k} className="flex items-center gap-2 text-xs">
                  <span className="w-16 truncate font-mono text-mute">{key}</span>
                  <ChevronRight size={12} className="text-mute" />
                  <button className="w-12 font-mono hover:text-cyan-300" onClick={() => store.getState().select({ kind: 'node', idx: to })}>{init.nodes[to]?.id}</button>
                  <span className={`chip !px-1.5 !py-0 ${kind === 'forward' ? 'text-cyan-300' : 'text-sky-200'}`}>{kind}</span>
                  <span className="h-1.5 w-10 overflow-hidden rounded bg-[#1d2b45]" title={`survival gain ${gain}`}>
                    <span className="block h-full bg-cyan-400" style={{ width: `${Math.min(gain * 100, 100)}%` }} />
                  </span>
                  <span className="ml-auto"><GateChips failed={failed} /></span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {canInject && (
          <Section title="What if…">
            <div className="grid grid-cols-2 gap-2">
              <button className="btn !justify-start !text-xs" onClick={() => inject('sink')}><Waves size={14} className="text-blue-300" /> Sink it</button>
              <button className="btn !justify-start !text-xs" onClick={() => inject('collapse')}><Building2 size={14} className="text-orange-300" /> Collapse here</button>
              <button className="btn !justify-start !text-xs" onClick={() => inject('sos', { cls: 'P0' })}><Radio size={14} className="text-cyan-300" /> Send SOS</button>
              <button className="btn btn-danger !justify-start !text-xs" onClick={() => inject('kill')}><Bomb size={14} /> Destroy now</button>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-mute">
              Nothing is scripted: the box's synthetic sensors react and the same rule engine decides what happens next.
              “Destroy now” kills it with no warning, which shows what happens without evacuation.
            </p>
          </Section>
        )}
      </div>
    </div>
  )
}

function MessageInspector({ msgKey }: { msgKey: string }) {
  const store = useRunStore()
  const init = useRun((s) => s.init)!
  const frame = useRun(currentFrame)!
  const info = useRun((s) => s.msgInfo[msgKey])
  const runId = useRun((s) => s.runId)
  const frames = useRun((s) => s.frames)
  const row = frame.msgs.find((m) => m[0] === msgKey)
  const [journey, setJourney] = useState<SimEvent[] | null>(null)
  const status = row ? row[3] : null
  const cls = row?.[1] ?? info?.cls ?? 'P2'
  const target = init.cfg.targets[cls] ?? 0.9

  useEffect(() => {
    let alive = true
    const load = () => api.message(runId, msgKey).then((r) => alive && setJourney(r.events)).catch(() => alive && setJourney((j) => j ?? []))
    load()
    const t = setInterval(load, 4000)
    return () => { alive = false; clearInterval(t) }
  }, [runId, msgKey, status])

  const jump = (tick: number) => {
    const i = frames.findIndex((f) => f.tick >= tick)
    if (i >= 0) store.setState({ view: i, replayPlaying: false })
  }

  const steps = useMemo(() => (journey ?? []).filter((e) => ['msg.created', 'msg.copy', 'msg.delivered', 'msg.lost'].includes(e.t)), [journey])
  const origin = row?.[4] ?? info?.node

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <SurvivalRing S={row ? row[2] : status === 1 ? 1 : 0} target={target} size={60} status={status ?? 0} cls={cls} />
        <div className="min-w-0 flex-1">
          <h3 className="font-mono text-lg font-semibold">{msgKey}</h3>
          <div className="mt-1 text-sm text-mute">
            {status === 1 && <span className="text-emerald-300">Delivered to the control room</span>}
            {status === 2 && <span className="text-slate-400">Lost with its last holder</span>}
            {status === 0 && <span>Alive · survival {Math.round((row?.[2] ?? 0) * 100)}% of {Math.round(target * 100)}% target</span>}
            {status === null && <span>Resolved earlier in the run</span>}
          </div>
        </div>
        <button className="text-mute hover:text-white" onClick={() => store.getState().select(null)} aria-label="Close"><X size={18} /></button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {info && (
          <Section title="The SOS">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-[#0b1324] p-2"><div className="text-xl font-semibold">{info.persons}</div><div className="text-[10px] text-mute">people</div></div>
              <div className="rounded-lg bg-[#0b1324] p-2"><div className="text-sm font-semibold capitalize leading-7">{info.needs}</div><div className="text-[10px] text-mute">need</div></div>
              <div className="rounded-lg bg-[#0b1324] p-2"><div className="font-mono text-sm leading-7">{fmtClock(info.tick)}</div><div className="text-[10px] text-mute">raised</div></div>
            </div>
            {origin !== undefined && (
              <button className="mt-2 text-xs text-cyan-300 hover:underline" onClick={() => store.getState().select({ kind: 'node', idx: origin })}>
                from box {init.nodes[origin]?.id} →
              </button>
            )}
          </Section>
        )}
        {row && row[5].length > 0 && (
          <Section title={`Held by ${row[5].length} box${row[5].length === 1 ? '' : 'es'}`}>
            <div className="flex flex-wrap gap-1.5">
              {row[5].map((h) => {
                const st = frame.nodes.state[h]
                return (
                  <button key={h} className="chip hover:border-cyan-400/60" style={{ color: st >= 2 ? C.danger : st === 1 ? C.warn : C.ink }} onClick={() => store.getState().select({ kind: 'node', idx: h })}>
                    {init.nodes[h].id}
                  </button>
                )
              })}
            </div>
          </Section>
        )}
        <Section title="Journey">
          {!journey && <span className="text-xs text-mute">loading…</span>}
          <ol className="relative ml-2 border-l border-line">
            {steps.map((e, k) => {
              const color = e.t === 'msg.delivered' ? C.safe : e.t === 'msg.lost' ? '#94a3b8' : e.evac ? C.danger : C.signal
              const label = e.t === 'msg.created' ? `raised at ${init.nodes[e.node as number]?.id}`
                : e.t === 'msg.copy' ? `${init.nodes[e.from as number]?.id} → ${init.nodes[e.to as number]?.id}${e.evac ? ' (evacuation)' : e.mode === 'forward' ? ' (forward)' : ' (survival copy)'}`
                  : e.t === 'msg.delivered' ? `delivered via ${init.nodes[e.via as number]?.id} in ${fmtTau(e.latency_s as number)}`
                    : `lost with ${init.nodes[e.last_holder as number]?.id} (${e.cause})`
              return (
                <li key={k} className="mb-2 ml-3">
                  <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
                  <button className="text-left text-xs hover:text-white" onClick={() => jump(e.tick)}>
                    <span className="font-mono text-mute">{fmtClock(e.tick)}</span> <span className="text-slate-200">{label}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </Section>
      </div>
    </div>
  )
}

function MessageList() {
  const store = useRunStore()
  const init = useRun((s) => s.init)
  const frame = useRun(currentFrame)
  const [filter, setFilter] = useState<'alive' | 'all'>('alive')
  if (!init || !frame) return <div className="panel h-full" />
  const rows = frame.msgs
    .filter((m) => filter === 'all' || m[3] === 0)
    .sort((a, b) => a[3] - b[3] || a[1].localeCompare(b[1]) || a[2] - b[2])
  const m = frame.metrics
  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">SOS messages</h3>
          <div className="flex gap-1">
            {(['alive', 'all'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`chip ${filter === f ? 'border-cyan-400/60 text-cyan-200' : 'text-mute'}`}>{f}</button>
            ))}
          </div>
        </div>
        <FlowBar created={m.created} delivered={m.delivered} lost={m.lost} />
        <p className="mt-2 text-[11px] text-mute">Click a message to see who holds it and how it travelled, or click any box on the map.</p>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {rows.length === 0 && <div className="p-4 text-center text-xs text-mute">No {filter === 'alive' ? 'undelivered ' : ''}messages right now.</div>}
        {rows.map(([key, cls, S, status, , holders]) => (
          <button key={key} onClick={() => store.getState().select({ kind: 'msg', key })} className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/5">
            <SurvivalRing S={status === 1 ? 1 : S} target={init.cfg.targets[cls] ?? 0.9} size={30} status={status} />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-xs">{key}</div>
              <div className="text-[10px] text-mute">{status === 1 ? 'delivered' : status === 2 ? 'lost' : `${holders.length} holder${holders.length === 1 ? '' : 's'}`}</div>
            </div>
            <span className="font-mono text-[10px]" style={{ color: CLASS_COLORS[cls] }}>{cls}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Cross-section of the survival river: delivered | alive | lost, as one bar. */
export function FlowBar({ created, delivered, lost }: { created: number; delivered: number; lost: number }) {
  const total = Math.max(created, 1)
  const alive = Math.max(created - delivered - lost, 0)
  return (
    <div className="mt-3" title={`${delivered} delivered · ${alive} alive · ${lost} lost of ${created}`}>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[#1d2b45]">
        <div style={{ width: `${(delivered / total) * 100}%`, background: C.safe, transition: 'width 400ms' }} />
        <div style={{ width: `${(alive / total) * 100}%`, background: C.signal, opacity: 0.6, transition: 'width 400ms' }} />
        <div style={{ width: `${(lost / total) * 100}%`, background: '#64748b', transition: 'width 400ms' }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-mute">
        <span className="text-emerald-300">{delivered} delivered</span>
        <span className="text-cyan-300">{alive} alive</span>
        <span>{lost} lost</span>
      </div>
    </div>
  )
}

export type { Frame, InitPayload }
