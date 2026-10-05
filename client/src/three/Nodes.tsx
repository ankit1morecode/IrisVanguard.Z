import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { Frame, InitPayload } from '../lib/types'
import { C, NET_COLORS, VSCALE, fmtTau, prefersReducedMotion, tauColor, tauPulseHz, toScene } from '../lib/visual'
import { glyphTexture, primaryCause } from './glyphs'
import { useInstanceColors } from './instancing'

const tmpM = new THREE.Matrix4()
const tmpQ = new THREE.Quaternion()
const tmpS = new THREE.Vector3()
const tmpP = new THREE.Vector3()
const tmpC = new THREE.Color()
const ZERO = new THREE.Vector3(0, 0, 0)

/** Scene position of node i in a frame (ground-truth metres -> scene units). */
export function nodePos(frame: Frame, i: number, size: number, out = new THREE.Vector3()) {
  const [x, z] = toScene(frame.nodes.x[i], frame.nodes.y[i], size)
  return out.set(x, frame.nodes.z[i] * VSCALE, z)
}

interface Props {
  init: InitPayload
  frame: Frame
  selected: number | null
  hovered: number | null
  onPick: (idx: number) => void
  onHover: (idx: number | null) => void
  compact?: boolean
}

export function Nodes({ init, frame, selected, hovered, onPick, onHover, compact }: Props) {
  const size = init.terrain.size_m
  const groups = useMemo(() => {
    const g = { household: [] as number[], relay: [] as number[], gateway: [] as number[], boat: [] as number[] }
    init.nodes.forEach((n, i) => g[n.kind].push(i))
    return g
  }, [init])
  const n = init.nodes.length

  const houses = useRef<THREE.InstancedMesh>(null)
  const relays = useRef<THREE.InstancedMesh>(null)
  const halos = useRef<THREE.InstancedMesh>(null)
  const discs = useRef<THREE.InstancedMesh>(null)
  const glyphs = useRef<THREE.Group>(null)
  const pos = useRef<THREE.Vector3[]>(Array.from({ length: n }, () => new THREE.Vector3()))
  const reduced = useMemo(prefersReducedMotion, [])
  useInstanceColors([houses, relays, halos, discs], [n])

  const sprites = useMemo(
    () => Array.from({ length: n }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }))
      s.scale.set(1.5, 1.5, 1.5)
      s.visible = false
      s.renderOrder = 10
      return s
    }),
    [n],
  )

  // Static-ish layout: positions, body colours, net discs and glyphs follow each new frame.
  useEffect(() => {
    const st = frame.nodes.state
    for (let i = 0; i < n; i++) nodePos(frame, i, size, pos.current[i])

    const place = (mesh: THREE.InstancedMesh | null, idxs: number[], sy: number) => {
      if (!mesh) return
      idxs.forEach((i, k) => {
        const dead = st[i] === 3
        tmpP.copy(pos.current[i])
        tmpP.y += dead ? 0.1 : sy / 2
        tmpS.set(1, dead ? 0.3 : 1, 1)
        tmpM.compose(tmpP, tmpQ.identity(), tmpS)
        mesh.setMatrixAt(k, tmpM)
        mesh.setColorAt(k, tmpC.set(dead ? C.dead : st[i] === 2 ? C.danger : st[i] === 1 ? C.warn : '#c9d6ea'))
      })
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
    place(houses.current, groups.household, 0.7)
    place(relays.current, groups.relay, 3.2)

    if (discs.current) {
      for (let i = 0; i < n; i++) {
        const alive = st[i] !== 3
        tmpP.copy(pos.current[i])
        tmpP.y -= 0.15
        tmpS.setScalar(alive ? (init.nodes[i].kind === 'relay' || init.nodes[i].kind === 'gateway' ? 7 : 4.5) : 0)
        tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
        tmpM.compose(tmpP, tmpQ, tmpS)
        discs.current.setMatrixAt(i, tmpM)
        discs.current.setColorAt(i, tmpC.set(NET_COLORS[frame.nodes.net[i]] || C.mute).multiplyScalar(0.07))
      }
      discs.current.instanceMatrix.needsUpdate = true
      if (discs.current.instanceColor) discs.current.instanceColor.needsUpdate = true
    }

    for (let i = 0; i < n; i++) {
      const s = sprites[i]
      const cause = st[i] !== 3 ? primaryCause(frame.nodes.causes[i]) : null
      s.visible = !!cause
      if (cause) {
        const tex = glyphTexture(cause)
        if (s.material.map !== tex) {
          s.material.map = tex
          s.material.needsUpdate = true
        }
        s.position.copy(pos.current[i]).add(tmpP.set(0, init.nodes[i].kind === 'relay' ? 4.6 : 2.2, 0))
      }
    }
  }, [frame, n, size, groups, sprites, init])

  // Halos breathe continuously: radius shrinks and pulse quickens as tau falls.
  useFrame(({ clock }) => {
    const mesh = halos.current
    if (!mesh) return
    const t = clock.elapsedTime
    const { tau, state } = frame.nodes
    for (let i = 0; i < n; i++) {
      const dead = state[i] === 3
      const kind = init.nodes[i].kind
      const life = Math.min(Math.max(Math.log10(Math.max(tau[i], 1) / 300) / Math.log10((72 * 3600) / 300), 0), 1)
      const base = (kind === 'gateway' ? 3.4 : kind === 'relay' ? 2.4 : 1.2) * (0.55 + 0.6 * life)
      const hz = tauPulseHz(tau[i])
      const pulse = reduced ? 1 : 1 + (state[i] >= 1 ? 0.22 : 0.06) * Math.sin(t * Math.PI * 2 * hz + i)
      tmpP.copy(pos.current[i])
      tmpP.y += 0.08
      tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
      tmpM.compose(tmpP, tmpQ, dead ? ZERO : tmpS.setScalar(base * pulse))
      mesh.setMatrixAt(i, tmpM)
      if (kind === 'gateway') tmpC.set(C.safe)
      else tauColor(tau[i], tmpC, init.cfg.evac_tau_s)
      const flash = state[i] === 2 && !reduced ? 0.6 + 0.6 * Math.abs(Math.sin(t * 9)) : 1
      tmpC.multiplyScalar((i === selected ? 2.2 : i === hovered ? 1.8 : 1.15) * flash)
      mesh.setColorAt(i, tmpC)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  const pick = (idxs: number[]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.instanceId !== undefined) onPick(idxs[e.instanceId])
  }
  const hover = (idxs: number[]) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (e.instanceId !== undefined) onHover(idxs[e.instanceId])
  }

  return (
    <group>
      <instancedMesh ref={discs} args={[undefined, undefined, n]} renderOrder={1} frustumCulled={false}>
        <circleGeometry args={[1, 32]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={halos} args={[undefined, undefined, n]} renderOrder={3} frustumCulled={false}>
        <ringGeometry args={[0.82, 1, 48]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>

      {groups.household.length > 0 && (
        <instancedMesh
          ref={houses} args={[undefined, undefined, groups.household.length]} frustumCulled={false}
          onPointerDown={pick(groups.household)} onPointerMove={hover(groups.household)} onPointerOut={() => onHover(null)}
        >
          <boxGeometry args={[0.7, 0.7, 0.7]} />
          <meshStandardMaterial roughness={0.5} metalness={0.2} emissive="#0e2a3a" />
        </instancedMesh>
      )}

      {groups.relay.length > 0 && (
        <instancedMesh
          ref={relays} args={[undefined, undefined, groups.relay.length]} frustumCulled={false}
          onPointerDown={pick(groups.relay)} onPointerMove={hover(groups.relay)} onPointerOut={() => onHover(null)}
        >
          <cylinderGeometry args={[0.28, 0.45, 3.2, 8]} />
          <meshStandardMaterial roughness={0.4} metalness={0.4} emissive="#0b3b2f" />
        </instancedMesh>
      )}

      <group ref={glyphs}>{sprites.map((s, i) => <primitive key={i} object={s} />)}</group>

      {groups.gateway.map((i) => (
        <Gateway key={i} position={pos.current[i]} onPick={() => onPick(i)} />
      ))}
      {groups.boat.map((i) => (
        <Boat key={i} target={pos.current[i]} frame={frame} idx={i} onPick={() => onPick(i)} />
      ))}

      {selected !== null && selected < n && (
        <SelectionMarker position={pos.current[selected]} label={init.nodes[selected].id} compact={compact} />
      )}
      {hovered !== null && hovered !== selected && hovered < n && !compact && (
        <HoverCard init={init} frame={frame} idx={hovered} position={pos.current[hovered]} />
      )}
    </group>
  )
}

function Gateway({ position, onPick }: { position: THREE.Vector3; onPick: () => void }) {
  const ring = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.8
    if (light.current) (light.current.material as THREE.MeshBasicMaterial).color.set(C.safe).multiplyScalar(1.5 + Math.sin(clock.elapsedTime * 3))
  })
  return (
    <group position={position} onPointerDown={(e) => { e.stopPropagation(); onPick() }}>
      <mesh position={[0, 2.5, 0]}>
        <cylinderGeometry args={[0.35, 1.1, 5, 6]} />
        <meshStandardMaterial color="#1f3b4d" metalness={0.6} roughness={0.3} emissive="#05301f" />
      </mesh>
      <mesh position={[0, 6.2, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 2.6, 6]} />
        <meshStandardMaterial color="#9fb3c8" />
      </mesh>
      <mesh ref={light} position={[0, 7.6, 0]}>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshBasicMaterial toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[0, 5, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.6, 0.06, 8, 48, Math.PI * 1.4]} />
        <meshBasicMaterial color={C.safe} toneMapped={false} />
      </mesh>
    </group>
  )
}

function Boat({ target, frame, idx, onPick }: { target: THREE.Vector3; frame: Frame; idx: number; onPick: () => void }) {
  const g = useRef<THREE.Group>(null)
  const heading = useRef(0)
  const prev = useRef(new THREE.Vector3().copy(target))
  useEffect(() => {
    const dx = target.x - prev.current.x
    const dz = target.z - prev.current.z
    if (dx * dx + dz * dz > 1e-4) heading.current = Math.atan2(dx, dz)
    prev.current.copy(target)
  }, [frame, target])
  useFrame(({ clock }, dt) => {
    if (!g.current) return
    g.current.position.lerp(target, Math.min(dt * 4, 1))
    g.current.position.y = target.y + Math.sin(clock.elapsedTime * 2 + idx) * 0.08
    g.current.rotation.y += (heading.current - g.current.rotation.y) * Math.min(dt * 3, 1)
  })
  return (
    <group ref={g} position={target} onPointerDown={(e) => { e.stopPropagation(); onPick() }}>
      <mesh position={[0, 0.25, 0]}>
        <boxGeometry args={[1.1, 0.5, 2.6]} />
        <meshStandardMaterial color="#f59e0b" emissive="#5a3300" />
      </mesh>
      <mesh position={[0, 0.65, 1.2]} rotation={[0.5, 0, 0]}>
        <boxGeometry args={[1.0, 0.4, 0.6]} />
        <meshStandardMaterial color="#f59e0b" />
      </mesh>
      <mesh position={[0, 1.6, -0.3]}>
        <cylinderGeometry args={[0.05, 0.05, 2, 6]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[0, 2.65, -0.3]}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color={C.signal} toneMapped={false} />
      </mesh>
    </group>
  )
}

function SelectionMarker({ position, label, compact }: { position: THREE.Vector3; label: string; compact?: boolean }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ring.current) {
      ring.current.rotation.z = clock.elapsedTime
      ring.current.position.copy(position).add(tmpP.set(0, 0.2, 0))
    }
  })
  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[3.6, 3.9, 6, 1, 0, Math.PI * 1.6]} />
        <meshBasicMaterial color={C.signal} toneMapped={false} transparent opacity={0.9} side={THREE.DoubleSide} />
      </mesh>
      {!compact && (
        <Html position={[position.x, position.y + 6, position.z]} center zIndexRange={[20, 0]}>
          <div className="pointer-events-none rounded-md border border-cyan-400/50 bg-[#070d1a]/85 px-2 py-0.5 font-mono text-[11px] text-cyan-200">
            {label}
          </div>
        </Html>
      )}
    </group>
  )
}

function HoverCard({ init, frame, idx, position }: { init: InitPayload; frame: Frame; idx: number; position: THREE.Vector3 }) {
  const node = init.nodes[idx]
  const st = frame.nodes.state[idx]
  return (
    <Html position={[position.x, position.y + 3.5, position.z]} center zIndexRange={[30, 0]}>
      <div className="pointer-events-none w-40 rounded-lg border border-[#1d2b45] bg-[#0c1526]/95 p-2 font-mono text-[10.5px] leading-4 text-slate-300 shadow-xl">
        <div className="mb-1 flex justify-between text-[11px] text-white">
          <span>{node.id}</span>
          <span className="text-slate-400">{node.kind}</span>
        </div>
        <div>τ {st === 3 ? 'dead' : fmtTau(frame.nodes.tau[idx])}</div>
        <div>battery {(frame.nodes.batt[idx] * 100).toFixed(0)}%</div>
        <div>airtime {(frame.nodes.air[idx] * 100).toFixed(1)}%</div>
        <div>holding {frame.nodes.store[idx]} msg</div>
      </div>
    </Html>
  )
}
