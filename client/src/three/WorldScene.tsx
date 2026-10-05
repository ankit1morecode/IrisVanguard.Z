import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Frame, InitPayload } from '../lib/types'
import { C, VSCALE } from '../lib/visual'
import { currentFrame, linksAt, useRun, useRunStore } from '../store/runStore'
import { Fx, type FxApi } from './Fx'
import { Links } from './Links'
import { Nodes, nodePos } from './Nodes'
import { Terrain, Water } from './Terrain'

const CLASS_DUR: Record<string, number> = { P0: 0.65, P1: 0.8, P2: 0.95, P3: 1.15 }

export function WorldScene({ compact = false }: { compact?: boolean }) {
  const store = useRunStore()
  const init = useRun((s) => s.init)
  const frame = useRun(currentFrame)
  const ready = !!init && !!frame

  return (
    <div className="relative h-full w-full">
      {!ready && (
        <div className="absolute inset-0 grid place-items-center">
          <div className="flex flex-col items-center gap-3 text-mute">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-cyan-400/30 border-t-cyan-400" />
            <span className="font-mono text-xs">waiting for the first frame…</span>
          </div>
        </div>
      )}
      {ready && (
        <Canvas
          dpr={compact ? [1, 1.25] : [1, 1.75]}
          camera={{ position: compact ? [0, 95, 105] : [0, 72, 92], fov: 42, near: 0.5, far: 600 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
          onPointerMissed={() => store.getState().select(null)}
        >
          <SceneContents init={init!} compact={compact} />
        </Canvas>
      )}
    </div>
  )
}

function SceneContents({ init, compact }: { init: InitPayload; compact: boolean }) {
  const store = useRunStore()
  const frame = useRun(currentFrame)!
  const links = useRun(linksAt)
  const selected = useRun((s) => s.selected)
  const hovered = useRun((s) => s.hovered)
  const fx = useRef<FxApi>(null)
  const selNode = selected?.kind === 'node' ? selected.idx : null

  useFxBridge(fx, init)

  return (
    <>
      <color attach="background" args={[C.bg]} />
      <fog attach="fog" args={[C.bg, 140, 330]} />
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#9ec5ff', '#0a1324', 0.6]} />
      <directionalLight position={[40, 80, 30]} intensity={1.1} />
      <group>
        <Terrain init={init} level={frame.water.level_m} />
        <Water init={init} level={frame.water.level_m} />
        <Links init={init} frame={frame} links={links} highlight={selNode} />
        <Nodes
          init={init}
          frame={frame}
          selected={selNode}
          hovered={hovered}
          compact={compact}
          onPick={(idx) => store.getState().select({ kind: 'node', idx })}
          onHover={(idx) => store.getState().hover(idx)}
        />
        {selected?.kind === 'msg' && <Constellation init={init} frame={frame} msgKey={selected.key} />}
      </group>
      <Fx ref={fx} />
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} maxPolarAngle={1.32} minDistance={18} maxDistance={220} target={[0, 0, 4]} />
      <Suspense fallback={null}>
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={compact ? 0.7 : 0.95} luminanceThreshold={0.32} luminanceSmoothing={0.2} />
          <Vignette eskil={false} offset={0.2} darkness={0.75} />
        </EffectComposer>
      </Suspense>
    </>
  )
}

/** Turn the events between the previously shown frame and the current one into particles and ripples. */
function useFxBridge(fx: React.RefObject<FxApi | null>, init: InitPayload) {
  const store = useRunStore()
  useEffect(() => {
    const size = init.terrain.size_m
    const gateways = init.nodes.map((n, i) => (n.kind === 'gateway' ? i : -1)).filter((i) => i >= 0)
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    let prev = currentFrame(store.getState())?.i ?? -1

    const play = (f: Frame, frames: Frame[]) => {
      const api = fx.current
      if (!api) return
      const s = store.getState()
      const classOf = (key?: string) => (key && s.msgInfo[key]?.cls) || 'P2'
      let budget = 160
      for (const fr of frames) {
        for (const e of fr.events) {
          if (budget-- <= 0) return
          switch (e.t) {
            case 'msg.copy': {
              nodePos(f, e.from as number, size, a)
              nodePos(f, e.to as number, size, b)
              const color = e.evac ? C.danger : e.mode === 'send' ? '#7dd3fc' : C.signal
              api.travel(a, b, color, CLASS_DUR[classOf(e.key)] ?? 0.9)
              api.ripple(b, C.signal, 1.6, 0.7)
              break
            }
            case 'msg.delivered': {
              nodePos(f, e.via as number, size, a)
              nodePos(f, (e.gateway as number) ?? gateways[0], size, b)
              api.travel(a, b, C.safe, 0.7)
              api.ripple(b, C.safe, 8, 1.6)
              break
            }
            case 'msg.confirm':
              api.ripple(nodePos(f, e.node as number, size, a), C.safe, 2.2, 0.9)
              break
            case 'msg.lost':
              nodePos(f, e.last_holder as number, size, a)
              api.ash(a)
              api.ripple(a, '#64748b', 3, 2)
              break
            case 'msg.created':
              api.ripple(nodePos(f, e.node as number, size, a), C.signal, 3, 1.1)
              break
            case 'node.evacuate':
              if (e.on) api.ripple(nodePos(f, e.node as number, size, a), C.danger, 6, 1.3)
              break
            case 'node.dead':
              api.ripple(nodePos(f, e.node as number, size, a), '#475569', 3.5, 1.6)
              break
            case 'world.collapse': {
              const [x, y] = e.at as [number, number]
              a.set((x / size - 0.5) * 100, 1, (y / size - 0.5) * 100)
              api.ripple(a, '#fb923c', ((e.radius as number) / size) * 100 * 1.4, 2.4)
              break
            }
            case 'reconcile':
              nodePos(f, e.a as number, size, a)
              nodePos(f, e.b as number, size, b)
              api.travel(a, b, C.violet, 0.6)
              api.travel(b, a, C.violet, 0.6)
              break
            case 'inject':
              if (typeof e.node === 'number') api.ripple(nodePos(f, e.node, size, a), '#f472b6', 7, 1.6)
              break
          }
        }
      }
    }

    return store.subscribe((s) => {
      const cur = currentFrame(s)
      if (!cur) return
      if (cur.i === prev) return
      const from = prev
      prev = cur.i
      if (cur.i < from || cur.i - from > 12) return // seeking: do not replay a burst of history
      const end = s.view ?? s.frames.length - 1
      const span: Frame[] = []
      for (let k = end; k >= 0 && s.frames[k].i > from; k--) span.unshift(s.frames[k])
      play(cur, span)
    })
  }, [store, init, fx])
}

/** Thin lines from a message glyph to every box currently holding a copy. */
function Constellation({ init, frame, msgKey }: { init: InitPayload; frame: Frame; msgKey: string }) {
  const row = frame.msgs.find((m) => m[0] === msgKey)
  const info = useRun((s) => s.msgInfo[msgKey])
  const glyph = useRef<THREE.Mesh>(null)
  const size = init.terrain.size_m
  const origin = row ? row[4] : info?.node
  const anchor = useMemo(() => {
    if (origin === undefined) return null
    const p = nodePos(frame, origin, size)
    return p.add(new THREE.Vector3(0, 9, 0))
  }, [frame, origin, size])
  useFrame(({ clock }) => {
    if (glyph.current) {
      glyph.current.rotation.y = clock.elapsedTime * 1.2
      glyph.current.position.y = (anchor?.y ?? 0) + Math.sin(clock.elapsedTime * 2) * 0.3
    }
  })
  if (!anchor) return null
  const status = row ? row[3] : 0
  const color = status === 1 ? C.safe : status === 2 ? '#64748b' : C.signal
  const holders = row ? row[5] : []
  return (
    <group>
      <mesh ref={glyph} position={anchor}>
        <octahedronGeometry args={[1.1, 0]} />
        <meshBasicMaterial color={color} toneMapped={false} wireframe />
      </mesh>
      {holders.map((h) => {
        const p = nodePos(frame, h, size).add(new THREE.Vector3(0, 0.6, 0))
        const dying = frame.nodes.state[h] >= 2
        return <Line key={h} points={[anchor, p]} color={dying ? C.danger : color} lineWidth={1.4} transparent opacity={dying ? 0.5 : 0.85} />
      })}
      <mesh position={[anchor.x, 0.2 + (frame.nodes.z[origin!] ?? 0) * VSCALE, anchor.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.8, 2.1, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent opacity={0.6} />
      </mesh>
    </group>
  )
}
