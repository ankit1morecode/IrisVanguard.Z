import { useFrame } from '@react-three/fiber'
import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { prefersReducedMotion } from '../lib/visual'
import { useInstanceColors } from './instancing'

const MAX_P = 3000
const MAX_R = 96

interface Particle {
  ax: number; ay: number; az: number
  bx: number; by: number; bz: number
  t0: number; dur: number; arc: number
  r: number; g: number; b: number
  size: number; fall: boolean
}

interface Ripple {
  x: number; y: number; z: number
  t0: number; dur: number; maxR: number
  r: number; g: number; b: number
}

export interface FxApi {
  /** A message copy travelling sender -> receiver along an arc, with a short comet trail. */
  travel: (a: THREE.Vector3, b: THREE.Vector3, color: string, dur?: number) => void
  ripple: (p: THREE.Vector3, color: string, maxR?: number, dur?: number) => void
  /** Grey ash drifting down where a message died with its last holder. */
  ash: (p: THREE.Vector3) => void
}

const pointVert = /* glsl */ `
  attribute vec3 color;
  attribute float psize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = psize * (220.0 / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`
const pointFrag = /* glsl */ `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    gl_FragColor = vec4(vColor * a * 1.6, a);
  }
`

export const Fx = forwardRef<FxApi>(function Fx(_, ref) {
  const reduced = useMemo(prefersReducedMotion, [])
  const parts = useRef<Particle[]>([])
  const ripples = useRef<Ripple[]>([])
  const clock = useRef(0)
  const ringMesh = useRef<THREE.InstancedMesh>(null)
  useInstanceColors([ringMesh])

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_P * 3), 3))
    g.setAttribute('psize', new THREE.BufferAttribute(new Float32Array(MAX_P), 1))
    g.setDrawRange(0, 0)
    return g
  }, [])
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: pointVert, fragmentShader: pointFrag, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }),
    [],
  )

  useImperativeHandle(ref, () => {
    const col = new THREE.Color()
    return {
      travel(a, b, color, dur = 0.9) {
        if (parts.current.length > MAX_P - 8) return
        col.set(color)
        const dist = a.distanceTo(b)
        const trail = reduced ? 1 : 5
        for (let k = 0; k < trail; k++) {
          parts.current.push({
            ax: a.x, ay: a.y + 0.6, az: a.z, bx: b.x, by: b.y + 0.6, bz: b.z,
            t0: clock.current + k * 0.035, dur: reduced ? 0.01 : dur, arc: Math.min(1.5 + dist * 0.18, 9),
            r: col.r, g: col.g, b: col.b, size: (k === 0 ? 1.5 : 1.1 - k * 0.15) * 1.0, fall: false,
          })
        }
      },
      ripple(p, color, maxR = 4, dur = 1.2) {
        if (ripples.current.length >= MAX_R) ripples.current.shift()
        col.set(color)
        ripples.current.push({ x: p.x, y: p.y + 0.15, z: p.z, t0: clock.current, dur, maxR, r: col.r, g: col.g, b: col.b })
      },
      ash(p) {
        col.set('#94a3b8')
        for (let k = 0; k < 10; k++) {
          const dx = (Math.random() - 0.5) * 2
          const dz = (Math.random() - 0.5) * 2
          parts.current.push({
            ax: p.x + dx * 0.3, ay: p.y + 3 + Math.random() * 2, az: p.z + dz * 0.3,
            bx: p.x + dx * 2, by: p.y - 0.5, bz: p.z + dz * 2,
            t0: clock.current + k * 0.08, dur: 2.6, arc: 0, r: col.r, g: col.g, b: col.b, size: 0.9, fall: true,
          })
        }
      },
    }
  }, [reduced])

  const tmpM = useMemo(() => new THREE.Matrix4(), [])
  const tmpQ = useMemo(() => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), [])
  const tmpV = useMemo(() => new THREE.Vector3(), [])
  const tmpS = useMemo(() => new THREE.Vector3(), [])
  const tmpC = useMemo(() => new THREE.Color(), [])

  useFrame((_, dt) => {
    clock.current += Math.min(dt, 0.1)
    const now = clock.current
    const pos = geom.attributes.position.array as Float32Array
    const colr = geom.attributes.color.array as Float32Array
    const sz = geom.attributes.psize.array as Float32Array
    const alive: Particle[] = []
    let k = 0
    for (const p of parts.current) {
      const u = (now - p.t0) / p.dur
      if (u > 1) continue
      alive.push(p)
      if (u < 0) continue
      const e = p.fall ? u : u * u * (3 - 2 * u)
      const x = p.ax + (p.bx - p.ax) * e
      const z = p.az + (p.bz - p.az) * e
      const y = p.ay + (p.by - p.ay) * e + (p.fall ? 0 : Math.sin(Math.PI * e) * p.arc)
      pos[k * 3] = x
      pos[k * 3 + 1] = y
      pos[k * 3 + 2] = z
      const fade = p.fall ? 1 - u : 1
      colr[k * 3] = p.r * fade
      colr[k * 3 + 1] = p.g * fade
      colr[k * 3 + 2] = p.b * fade
      sz[k] = p.size
      k++
    }
    parts.current = alive
    geom.setDrawRange(0, k)
    geom.attributes.position.needsUpdate = true
    geom.attributes.color.needsUpdate = true
    geom.attributes.psize.needsUpdate = true

    const mesh = ringMesh.current
    if (mesh) {
      ripples.current = ripples.current.filter((r) => now - r.t0 < r.dur)
      for (let i = 0; i < MAX_R; i++) {
        const r = ripples.current[i]
        if (!r) {
          tmpM.makeScale(0, 0, 0)
          mesh.setMatrixAt(i, tmpM)
          continue
        }
        const u = Math.min((now - r.t0) / r.dur, 1)
        const rad = 0.4 + r.maxR * (1 - (1 - u) * (1 - u))
        tmpM.compose(tmpV.set(r.x, r.y, r.z), tmpQ, tmpS.setScalar(rad))
        mesh.setMatrixAt(i, tmpM)
        mesh.setColorAt(i, tmpC.setRGB(r.r, r.g, r.b).multiplyScalar(1.6 * (1 - u)))
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })

  return (
    <group>
      <points geometry={geom} material={mat} frustumCulled={false} renderOrder={5} />
      <instancedMesh ref={ringMesh} args={[undefined, undefined, MAX_R]} frustumCulled={false} renderOrder={4}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </instancedMesh>
    </group>
  )
})
