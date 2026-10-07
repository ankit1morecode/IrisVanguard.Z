import { motion } from 'framer-motion'
import { Building2, Check, Loader2, Ship, Waves } from 'lucide-react'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import type { ScenarioInfo } from '../lib/types'
import { fmtClock } from '../lib/visual'

const ICONS: Record<string, typeof Waves> = {
  'riverside-village-flood': Waves,
  'city-quake-blackout': Building2,
  'cutoff-hamlet-boat': Ship,
}

export interface LaunchOptions {
  scenario: string
  strategies: string[]
  seed: number | null
  speed: number
}

export function ScenarioPicker({ mode, onLaunch, busy }: { mode: 'single' | 'compare'; onLaunch: (o: LaunchOptions) => void; busy?: boolean }) {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([])
  const [strategies, setStrategies] = useState<{ id: string; label: string }[]>([])
  const [scenario, setScenario] = useState('riverside-village-flood')
  const [chosen, setChosen] = useState<string[]>(mode === 'compare' ? ['ivz', 'flooding'] : ['ivz'])
  const [seed, setSeed] = useState<string>('')
  const [speed, setSpeed] = useState(60)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([api.scenarios(), api.strategies()])
      .then(([s, st]) => { setScenarios(s); setStrategies(st) })
      .catch((e) => setErr(`Cannot reach the API (${e.message}). Is the server running on :4000?`))
  }, [])

  const toggle = (id: string) => {
    if (mode === 'single') return setChosen([id])
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 4 ? c : [...c, id]))
  }
  const valid = mode === 'single' ? chosen.length === 1 : chosen.length >= 2 && chosen.length <= 4

  return (
    <div className="mx-auto w-full max-w-5xl">
      {err && <div className="panel mb-4 border-danger/40 p-3 text-sm text-danger">{err}</div>}
      <div className="label mb-2">1 · Choose a disaster</div>
      <div className="grid gap-3 md:grid-cols-3">
        {scenarios.map((s, k) => {
          const Icon = ICONS[s.name] || Waves
          const active = s.name === scenario
          return (
            <motion.button
              key={s.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: k * 0.06 }}
              onClick={() => setScenario(s.name)}
              className={`panel group relative flex flex-col gap-2 p-4 text-left transition ${active ? '!border-signal/70 shadow-[0_0_30px_-10px_var(--signal)]' : 'hover:!border-line-strong'}`}
            >
              <div className="flex items-center gap-2">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${active ? 'bg-signal/15 text-signal' : 'bg-ink/5 text-mute'}`}><Icon size={18} /></span>
                <span className="font-semibold">{s.title}</span>
              </div>
              <p className="text-xs leading-relaxed text-mute">{s.description}</p>
              <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
                <span className="chip">{s.nodeCount} boxes</span>
                {s.nodes.relay ? <span className="chip">{s.nodes.relay} relays</span> : null}
                {s.nodes.boat ? <span className="chip">{s.nodes.boat} boat</span> : null}
                <span className="chip">{fmtClock(s.durationS)}</span>
              </div>
            </motion.button>
          )
        })}
        {!scenarios.length && !err && <div className="col-span-3 flex justify-center p-8 text-mute"><Loader2 className="animate-spin" /></div>}
      </div>

      <div className="label mb-2 mt-6">2 · {mode === 'compare' ? `Pick 2–4 strategies to race on the same seed · ${chosen.length} selected` : 'Forwarding strategy'}</div>
      <div className="flex flex-wrap gap-2">
        {strategies.map((s) => {
          const on = chosen.includes(s.id)
          return (
            <button key={s.id} onClick={() => toggle(s.id)} aria-pressed={on} className={`btn !text-xs ${on ? '!border-transparent !bg-signal !text-on-signal' : 'text-mute'}`}>
              {on && <Check size={13} />} {s.label}
            </button>
          )
        })}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className="label">Seed (optional)</span>
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="scenario default" className="w-40" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label">Speed</span>
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {[10, 30, 60, 120, 300].map((x) => <option key={x} value={x}>{x}× real time</option>)}
          </select>
        </label>
        <button
          className="btn btn-primary ml-auto !px-6 !py-3"
          disabled={!valid || busy || !scenarios.length}
          onClick={() => onLaunch({ scenario, strategies: chosen, seed: seed === '' ? null : Number(seed), speed })}
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : null}
          {mode === 'compare' ? 'Start side-by-side race' : 'Launch live run'}
        </button>
      </div>
    </div>
  )
}
