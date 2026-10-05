import { BatteryWarning, Hourglass as HourglassIcon, Radio, Timer } from 'lucide-react'
import { useId } from 'react'
import { C, CLASS_COLORS } from '../lib/visual'

/** Survival ring: fills toward the class target; the tick marks the target; locks solid once met. */
export function SurvivalRing({ S, target, size = 44, status = 0, cls }: { S: number; target: number; size?: number; status?: number; cls?: string }) {
  const r = size / 2 - 4
  const circ = 2 * Math.PI * r
  const met = status === 1 || S >= target
  const color = status === 2 ? '#64748b' : met ? C.safe : C.signal
  const ang = target * 2 * Math.PI - Math.PI / 2
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1d2b45" strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={`${Math.max(S, 0.001) * circ} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 400ms ease, stroke 300ms' }}
        opacity={met ? 1 : 0.9}
      />
      <line
        x1={size / 2 + Math.cos(ang) * (r - 5)} y1={size / 2 + Math.sin(ang) * (r - 5)}
        x2={size / 2 + Math.cos(ang) * (r + 5)} y2={size / 2 + Math.sin(ang) * (r + 5)}
        stroke={C.ink} strokeWidth={1.5}
      />
      {cls && (
        <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontSize={size * 0.24} fontFamily="JetBrains Mono" fill={CLASS_COLORS[cls] || C.ink}>
          {cls}
        </text>
      )}
    </svg>
  )
}

/** Battery glyph with a hatched floor for the 72-hour owner reserve; released (red) on evacuation. */
export function BatteryGlyph({ frac, reserveFrac, evacuating }: { frac: number; reserveFrac: number; evacuating?: boolean }) {
  const w = 72
  const h = 30
  const fillW = Math.max(Math.min(frac, 1), 0) * (w - 6)
  const resW = reserveFrac * (w - 6)
  const color = frac < reserveFrac ? C.danger : frac < 0.25 ? C.warn : C.safe
  const id = useId()
  return (
    <svg width={w + 6} height={h} viewBox={`0 0 ${w + 6} ${h}`}>
      <defs>
        <pattern id={`hatch${id}`} width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke={evacuating ? C.danger : C.mute} strokeWidth="2" />
        </pattern>
      </defs>
      <rect x={1} y={1} width={w} height={h - 2} rx={5} fill="#0b1324" stroke="#2b3d5e" />
      <rect x={w + 1} y={h / 2 - 5} width={4} height={10} rx={1} fill="#2b3d5e" />
      <rect x={4} y={4} width={fillW} height={h - 8} rx={3} fill={color} opacity={0.85} style={{ transition: 'width 400ms' }} />
      <rect x={4} y={4} width={Math.max(resW, 3)} height={h - 8} fill={`url(#hatch${id})`} opacity={evacuating ? 1 : 0.9} />
    </svg>
  )
}

/** Airtime hourglass: drains as the legal 36 s/h is used; a fenced band at the bottom is the owner's SOS slice. */
export function AirtimeHourglass({ used, allowance, owner }: { used: number; allowance: number; owner: number }) {
  const w = 40
  const h = 56
  const frac = Math.min(used / allowance, 1)
  const ownerFrac = owner / allowance
  const top = (1 - frac) * (h / 2 - 6)
  const bottom = frac * (h / 2 - 6)
  const relayFull = frac >= 1 - ownerFrac
  const id = useId()
  const fenceY = h / 2 - 2 - ownerFrac * (h / 2 - 6)
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <path d={`M6 3 H${w - 6} L${w / 2 + 3} ${h / 2} L${w - 6} ${h - 3} H6 L${w / 2 - 3} ${h / 2} Z`} fill="#0b1324" stroke="#2b3d5e" />
      <clipPath id={`t${id}`}><path d={`M7 4 H${w - 7} L${w / 2} ${h / 2 - 1} Z`} /></clipPath>
      <clipPath id={`b${id}`}><path d={`M${w / 2} ${h / 2 + 1} L${w - 7} ${h - 4} H7 Z`} /></clipPath>
      <rect clipPath={`url(#t${id})`} x={0} y={h / 2 - 2 - top} width={w} height={top} fill={C.signal} opacity={0.75} />
      <rect clipPath={`url(#b${id})`} x={0} y={h - 4 - bottom} width={w} height={bottom} fill={relayFull ? C.warn : '#155e75'} />
      <line x1={9} x2={w - 9} y1={fenceY} y2={fenceY} stroke={C.danger} strokeDasharray="2 2" />
    </svg>
  )
}

export function Sparkline({ values, color = C.signal, height = 28, width = 140, min, max, threshold }: {
  values: number[]; color?: string; height?: number; width?: number; min?: number; max?: number; threshold?: number
}) {
  if (values.length < 2) return <div style={{ height, width }} className="rounded bg-[#0b1324]" />
  const lo = min ?? Math.min(...values)
  const hi = max ?? Math.max(...values)
  const span = hi - lo || 1
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - lo) / span) * (height - 4) - 2}`)
  const ty = threshold !== undefined ? height - ((threshold - lo) / span) * (height - 4) - 2 : null
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={color} opacity={0.1} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} />
      {ty !== null && ty >= 0 && ty <= height && <line x1={0} x2={width} y1={ty} y2={ty} stroke={C.danger} strokeDasharray="3 3" opacity={0.6} />}
    </svg>
  )
}

const GATES: [string, string, typeof Radio][] = [
  ['energy', 'battery reserve', BatteryWarning],
  ['airtime', 'legal airtime', HourglassIcon],
  ['link', 'link margin', Radio],
  ['contact', 'contact window', Timer],
]

/** Why didn't this box send? The blocking gate lights up red. */
export function GateChips({ failed }: { failed: string[] }) {
  return (
    <div className="flex gap-1">
      {GATES.map(([id, label, Icon]) => {
        const bad = failed.includes(id)
        return (
          <span
            key={id}
            title={`${label}: ${bad ? 'blocked' : 'ok'}`}
            className={`grid h-6 w-6 place-items-center rounded-md border ${bad ? 'border-rose-500/70 bg-rose-500/15 text-rose-300' : 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300/80'}`}
          >
            <Icon size={13} />
          </span>
        )
      })}
    </div>
  )
}

export function HaloDot({ color, pulse = false, size = 14 }: { color: string; pulse?: boolean; size?: number }) {
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <span className={`absolute inset-0 rounded-full border-2 ${pulse ? 'breathe' : ''}`} style={{ borderColor: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="h-1.5 w-1.5 rounded-sm" style={{ background: '#c9d6ea' }} />
    </span>
  )
}
