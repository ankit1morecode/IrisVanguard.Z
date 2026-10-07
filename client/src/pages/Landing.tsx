import { motion } from 'framer-motion'
import { ArrowRight, Columns2, Hourglass, Radio, RotateCcw, ShieldCheck, Siren, Waves } from 'lucide-react'
import { Suspense, lazy } from 'react'
import { Link } from 'react-router-dom'
import { AirtimeHourglass, BatteryGlyph, GateChips, HaloDot, SurvivalRing } from '../components/glyphs'
import { C } from '../lib/visual'
import { useTheme } from '../lib/theme'

const HeroScene = lazy(() => import('../landing/HeroScene').then((m) => ({ default: m.HeroScene })))

const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-80px' },
  transition: { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] as const },
}

export function Landing() {
  return (
    <div>
      <Hero />
      <Problem />
      <ThreeIdeas />
      <Novelty />
      <footer className="border-t border-line px-4 py-8 text-center text-xs text-mute">
        IrisVanguard.Z · digital twin prototype. Hardware costs are estimates, not quotes; novelty claims await a formal patent search.
      </footer>
    </div>
  )
}

function Hero() {
  const theme = useTheme((s) => s.theme)
  return (
    <section className="relative h-[calc(100vh-3.5rem)] min-h-[560px] overflow-hidden">
      <div className="absolute inset-0">
        <Suspense fallback={<div className="h-full w-full bg-bg" />}>
          <HeroScene key={theme} />
        </Suspense>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-bg/60 md:bg-transparent md:bg-gradient-to-r md:from-bg md:via-bg/75 md:to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />
      <div className="relative mx-auto flex h-full max-w-[1400px] items-center px-5 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="max-w-xl">
          <div className="chip mb-5 border-signal/40 text-signal"><Siren size={12} /> disaster-resilient SOS mesh</div>
          <h1 className="text-[clamp(2.1rem,5.4vw,3.9rem)] font-semibold leading-[1.05] tracking-tight">
            Messages that outlive the boxes <span className="text-signal">carrying them.</span>
          </h1>
          <p className="mt-5 text-base leading-relaxed text-ink/80 sm:text-lg">
            A network of cheap floating radio boxes that keeps SOS messages alive in a flood or earthquake.
            Its one new trick: a box that senses it is about to die hands its messages to a safer neighbour first.
          </p>
          <div className="pointer-events-auto mt-8 flex flex-wrap gap-3">
            <Link to="/command" className="btn btn-primary w-full !px-5 !py-3 !text-base sm:w-auto">Open the command map <ArrowRight size={16} /></Link>
            <Link to="/compare" className="btn w-full !px-5 !py-3 !text-base sm:w-auto"><Columns2 size={16} /> Race it against flooding</Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-mute">
            <span className="flex items-center gap-2"><HaloDot color={C.danger} pulse /> box sensing its own death</span>
            <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-danger shadow-[0_0_8px_var(--danger)]" /> its SOS messages escaping</span>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <motion.div {...reveal} className="max-w-2xl">
        <div className="label">The problem</div>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Off-grid meshes quietly assume the boxes survive.</h2>
        <p className="mt-4 text-ink/80">
          When towers fall, LoRa and Bluetooth meshes pass messages hand to hand until one reaches a rescue post.
          In a real disaster the devices do not survive, and the usual fix of repeating everything to everyone runs into the law.
        </p>
      </motion.div>
      <div className="mt-12 grid gap-5 md:grid-cols-2">
        <motion.div {...reveal} className="panel p-6">
          <div className="flex items-center gap-3">
            <Waves className="text-water" />
            <h3 className="text-lg font-semibold">The box goes under, the messages go with it</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-mute">
            A box carrying five people's SOS sinks. The network only notices when it stops answering, and by then those
            messages are gone.
          </p>
          <div className="mt-5 flex items-center gap-3">
            {[0, 1, 2, 3, 4].map((k) => (
              <motion.span
                key={k}
                className="h-3 w-3 rounded-full bg-mute"
                initial={{ opacity: 1, y: 0 }}
                whileInView={{ opacity: [1, 1, 0], y: [0, 0, 18] }}
                transition={{ duration: 2.4, delay: k * 0.15, repeat: Infinity, repeatDelay: 1 }}
              />
            ))}
            <span className="text-xs text-mute">lost with the box</span>
          </div>
        </motion.div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }} className="panel p-6">
          <div className="flex items-center gap-3">
            <Hourglass className="text-warn" />
            <h3 className="text-lg font-semibold">36 seconds of radio an hour</h3>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-mute">
            India's licence-free band allows about 1% airtime. Flooding every message burns that allowance and the battery,
            sometimes leaving a box unable to send its own owner's SOS.
          </p>
          <div className="mt-4 flex items-end gap-6">
            <div className="flex items-center gap-2"><AirtimeHourglass used={34} allowance={36} owner={7.2} /><span className="text-xs text-mute">flooding:<br />budget gone</span></div>
            <div className="flex items-center gap-2"><AirtimeHourglass used={6} allowance={36} owner={7.2} /><span className="text-xs text-mute">IrisVanguard.Z:<br />owner slice fenced</span></div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function ThreeIdeas() {
  const cards = [
    {
      icon: <HaloDot color={C.warn} pulse size={22} />,
      title: 'Each box watches its own health',
      body: 'Pressure (water depth), leak pads, accelerometer, temperature and battery give a live estimate of how long the box has left. It shares that number in a tiny status ping.',
      demo: <div className="flex gap-3"><HaloDot color={C.ink} size={20} /><HaloDot color={C.warn} pulse size={20} /><HaloDot color={C.danger} pulse size={20} /></div>,
    },
    {
      icon: <ShieldCheck className="text-signal" />,
      title: 'Each message knows how safe it is',
      body: 'From its holders’ time-left numbers a box computes the chance at least one gets the SOS to a rescue post. Below target it adds one copy on the best neighbour. Once the target is met, copying stops.',
      demo: <div className="flex gap-3"><SurvivalRing S={0.42} target={0.99} size={40} cls="P0" /><SurvivalRing S={0.81} target={0.99} size={40} cls="P0" /><SurvivalRing S={0.995} target={0.99} size={40} cls="P0" /></div>,
    },
    {
      icon: <Radio className="text-safe" />,
      title: 'Hard safety rules on every transmission',
      body: 'Keep the owner’s 72-hour SOS reserve, stay under the legal airtime limit, only send on links that will get through, and only to neighbours that stay in range. The one exception: a dying box may spend its reserve.',
      demo: <div className="flex items-center gap-4"><GateChips failed={[]} /><GateChips failed={['airtime']} /><BatteryGlyph frac={0.6} reserveFrac={0.08} /></div>,
    },
  ]
  return (
    <section className="border-y border-line bg-panel/40">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <motion.div {...reveal}>
          <div className="label">How it works</div>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Three simple ideas run on every box.</h2>
        </motion.div>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {cards.map((c, k) => (
            <motion.div key={c.title} {...reveal} transition={{ ...reveal.transition, delay: k * 0.1 }} className="panel flex flex-col p-6">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-ink/5">{c.icon}</div>
              <h3 className="mt-4 text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-mute">{c.body}</p>
              <div className="mt-5 rounded-lg bg-bg/60 p-3">{c.demo}</div>
            </motion.div>
          ))}
        </div>
        <motion.div {...reveal} className="panel mt-6 flex flex-col items-start gap-4 border-danger/30 bg-danger/[0.04] p-6 md:flex-row md:items-center">
          <Siren className="shrink-0 text-danger" size={28} />
          <p className="text-ink">
            <span className="font-semibold text-danger">The evacuation.</span> When a box senses its own death coming, its own copies count as worthless,
            so the same rule pushes its messages out to the safest neighbours within seconds. Handing four SOS messages to a rooftop relay costs about a second of radio time.
          </p>
        </motion.div>
      </div>
    </section>
  )
}

function Novelty() {
  const plumbing = ['Radio meshes', 'Store-and-forward', 'SOS priority levels', 'Battery-aware forwarding', 'Boat and drone relays']
  const fresh = [
    'Death estimated from physical damage, not just battery',
    'Message safety computed across all holders, weighted by their life',
    'Copies made only until a target is met',
    'A dying box evacuates its messages first',
    'Hard rules protect the owner’s SOS and the legal airtime',
  ]
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="grid gap-10 md:grid-cols-2">
        <motion.div {...reveal}>
          <div className="label">What isn't new</div>
          <h2 className="mt-3 text-2xl font-semibold">Used as plumbing</h2>
          <ul className="mt-5 flex flex-wrap gap-2">
            {plumbing.map((p) => <li key={p} className="chip !px-3 !py-1 text-mute">{p}</li>)}
          </ul>
        </motion.div>
        <motion.div {...reveal} transition={{ ...reveal.transition, delay: 0.1 }}>
          <div className="label">What is new</div>
          <h2 className="mt-3 text-2xl font-semibold">The combination</h2>
          <ul className="mt-5 space-y-2.5">
            {fresh.map((f) => (
              <li key={f} className="flex items-start gap-3 text-ink">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-signal shadow-[0_0_8px_var(--signal)]" />{f}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-mute">Searches did not find this combination, which is not proof of novelty; a formal patent search comes first.</p>
        </motion.div>
      </div>
      <motion.div {...reveal} className="mt-14 flex flex-wrap items-center gap-3">
        <Link to="/command" className="btn btn-primary !px-5 !py-3">Launch a live run <ArrowRight size={16} /></Link>
        <Link to="/runs" className="btn !px-5 !py-3"><RotateCcw size={16} /> Replay past runs</Link>
      </motion.div>
    </section>
  )
}
