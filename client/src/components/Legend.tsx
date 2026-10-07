import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { glyphTexture } from '../three/glyphs'
import { C, NET_COLORS } from '../lib/visual'
import { useTheme } from '../lib/theme'
import { HaloDot } from './glyphs'

function GlyphImg({ cause }: { cause: string }) {
  const ref = useRef<HTMLImageElement>(null)
  const theme = useTheme((s) => s.theme)
  useEffect(() => {
    const img = glyphTexture(cause).image as HTMLCanvasElement
    if (ref.current) ref.current.src = img.toDataURL()
  }, [cause, theme])
  return <img ref={ref} alt={cause} className="h-4 w-4" />
}

function Row({ icon, label, hint }: { icon: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="flex items-center gap-2.5 py-1" title={hint}>
      <span className="grid w-6 shrink-0 place-items-center">{icon}</span>
      <span className="text-xs leading-tight text-ink/80">{label}</span>
    </div>
  )
}

const Dot = ({ color, glow = true }: { color: string; glow?: boolean }) => (
  <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: glow ? `0 0 8px ${color}` : undefined }} />
)

/** The left rail teaches the visual language once; the map is then readable at a glance. */
export function Legend() {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('ivz.legend') !== 'closed' } catch { return true }
  })
  useEffect(() => {
    try { localStorage.setItem('ivz.legend', open ? 'open' : 'closed') } catch { /* ignore */ }
  }, [open])

  if (!open) {
    return (
      <button className="panel flex items-center gap-1 px-2 py-3 text-xs text-mute hover:text-ink" onClick={() => setOpen(true)} aria-label="Show legend">
        <ChevronRight size={14} />
        <span className="[writing-mode:vertical-rl]">Legend</span>
      </button>
    )
  }
  return (
    <div className="panel flex max-h-full w-56 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-3 pt-3">
        <span className="label">Visual language</span>
        <button className="text-mute hover:text-ink" onClick={() => setOpen(false)} aria-label="Hide legend"><ChevronLeft size={16} /></button>
      </div>
      <div className="overflow-y-auto px-3 pb-3">
        <div className="mt-2 text-[10px] uppercase tracking-wider text-mute">Box health (halo)</div>
        <Row icon={<HaloDot color={C.ink} />} label="Calm: long life ahead" />
        <Row icon={<HaloDot color={C.warn} pulse />} label="Degrading: halo shrinks" />
        <Row icon={<HaloDot color={C.danger} pulse />} label="Dying: pulses fast, evacuates" />

        <div className="mt-3 text-[10px] uppercase tracking-wider text-mute">Messages</div>
        <Row icon={<Dot color={C.signal} />} label="Copy forwarded toward the control room" />
        <Row icon={<Dot color={C.signalSoft} />} label="Survival copy (until target met)" />
        <Row icon={<Dot color={C.danger} />} label="Evacuation: dying box hands off" />
        <Row icon={<span className="h-3 w-3 rounded-full border-2" style={{ borderColor: C.safe }} />} label="Green ripple: delivered / confirmed" />
        <Row icon={<Dot color={C.ash} glow={false} />} label="Grey ash: message lost with its box" />
        <Row icon={<Dot color={C.part} />} label="Digest exchange with a boat" />

        <div className="mt-3 text-[10px] uppercase tracking-wider text-mute">Hazard sensed</div>
        <div className="grid grid-cols-2">
          <Row icon={<GlyphImg cause="submersion" />} label="water" />
          <Row icon={<GlyphImg cause="water_pads" />} label="leak" />
          <Row icon={<GlyphImg cause="shock" />} label="shock" />
          <Row icon={<GlyphImg cause="heat" />} label="heat" />
          <Row icon={<GlyphImg cause="battery" />} label="battery" />
          <Row icon={<GlyphImg cause="tilt" />} label="tilt" />
        </div>

        <div className="mt-3 text-[10px] uppercase tracking-wider text-mute">Network (ground tint)</div>
        <div className="grid grid-cols-2">
          {['connected', 'degraded', 'fragmented', 'isolated'].map((s, i) => (
            <Row key={s} icon={<span className="h-3 w-3 rounded-full opacity-70" style={{ background: NET_COLORS[i] }} />} label={s} />
          ))}
        </div>
        <Row icon={<span className="h-0.5 w-5 bg-signal" />} label="Radio link (brighter = stronger)" />
        <Row icon={<span className="h-0.5 w-5 bg-warn/60" />} label="Link below safety margin" />

        <div className="mt-3 text-[10px] uppercase tracking-wider text-mute">Boxes</div>
        <Row icon={<span className="h-2.5 w-2.5 bg-ink/70" />} label="Household box" />
        <Row icon={<span className="h-4 w-1.5 rounded-sm bg-ink/70" />} label="Rooftop relay (solar)" />
        <Row icon={<span className="h-4 w-2 rounded-t-full bg-safe/80" />} label="Control-room gateway" />
        <Row icon={<span className="h-2 w-4 rounded-sm bg-warn" />} label="Rescue boat (carries messages)" />
      </div>
    </div>
  )
}
