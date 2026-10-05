import { Float, OrbitControls, Stars } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { C } from '../lib/visual'

/**
 * The idea in one loop (10 s): a calm household box; the flood rises and it starts to sink, its halo
 * turning red; before it dies it hands its four SOS messages to a rooftop relay; the relay passes them
 * on and a green ripple comes back from the control room.
 */
const LOOP = 10

const waterVert = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  void main() {
    vec3 p = position;
    p.z += sin(p.x * 0.35 + uTime * 1.2) * 0.18 + cos(p.y * 0.3 + uTime) * 0.15;
    vec4 w = modelMatrix * vec4(p, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`
const waterFrag = /* glsl */ `
  uniform float uTime;
  varying vec3 vW;
  void main() {
    float d = length(vW.xz) / 60.0;
    float grid = 1.0 - smoothstep(0.0, 0.06, abs(fract(vW.x / 4.0) - 0.5) * abs(fract(vW.z / 4.0) - 0.5) * 8.0);
    vec3 col = mix(vec3(0.05, 0.16, 0.38), vec3(0.02, 0.05, 0.12), clamp(d, 0.0, 1.0));
    col += vec3(0.1, 0.4, 0.7) * grid * 0.12 * (1.0 - d);
    float sheen = pow(max(sin(vW.x * 0.2 + uTime * 0.6) * cos(vW.z * 0.25 - uTime * 0.4), 0.0), 6.0);
    col += vec3(0.3, 0.6, 1.0) * sheen * 0.25;
    gl_FragColor = vec4(col, 0.92);
    #include <colorspace_fragment>
  }
`

function Water() {
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: waterVert, fragmentShader: waterFrag, uniforms: { uTime: { value: 0 } }, transparent: true }), [])
  useFrame((_, dt) => { mat.uniforms.uTime.value += dt })
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} material={mat}>
      <planeGeometry args={[140, 140, 80, 80]} />
    </mesh>
  )
}

const BOX = new THREE.Vector3(-4, 0, 3)
const RELAY = new THREE.Vector3(5, 6.2, -2)
const GATEWAY = new THREE.Vector3(22, 9, -18)

function Story() {
  const box = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Mesh>(null)
  const relayHalo = useRef<THREE.Mesh>(null)
  const ripple = useRef<THREE.Mesh>(null)
  const sparks = useRef<THREE.Mesh[]>([])
  const relaySparks = useRef<THREE.Mesh>(null)
  const col = useMemo(() => new THREE.Color(), [])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime % LOOP
    const sink = THREE.MathUtils.smoothstep(t, 2.5, 7.5)
    if (box.current) {
      box.current.position.set(BOX.x, 0.2 - sink * 2.6 + Math.sin(clock.elapsedTime * 1.6) * 0.12, BOX.z)
      box.current.rotation.z = sink * 0.5
      box.current.rotation.x = Math.sin(clock.elapsedTime) * 0.05
    }
    const danger = THREE.MathUtils.smoothstep(t, 2.0, 4.0)
    if (halo.current) {
      const hz = 0.4 + danger * 3
      const s = (2.4 - danger * 1.1) * (1 + 0.15 * Math.sin(clock.elapsedTime * Math.PI * 2 * hz))
      halo.current.scale.setScalar(t > 7.4 ? 0.001 : s)
      halo.current.position.set(BOX.x, 0.25, BOX.z)
      col.set(C.ink).lerp(new THREE.Color(C.warn), Math.min(danger * 2, 1))
      if (danger > 0.5) col.lerp(new THREE.Color(C.danger), (danger - 0.5) * 2)
      ;(halo.current.material as THREE.MeshBasicMaterial).color.copy(col).multiplyScalar(1.6)
    }
    // Evacuation: four messages leave in quick succession along arcs to the relay.
    sparks.current.forEach((m, k) => {
      if (!m) return
      const u = THREE.MathUtils.clamp((t - 4.2 - k * 0.28) / 0.9, 0, 1)
      m.visible = u > 0 && u < 1
      const from = box.current ? box.current.position : BOX
      m.position.lerpVectors(from, RELAY, u)
      m.position.y += Math.sin(Math.PI * u) * 4 + 0.6
    })
    // Relay forwards to the control room; the confirmation ripples back.
    if (relaySparks.current) {
      const u = THREE.MathUtils.clamp((t - 6.0) / 1.4, 0, 1)
      relaySparks.current.visible = u > 0 && u < 1
      relaySparks.current.position.lerpVectors(RELAY, GATEWAY, u)
      relaySparks.current.position.y += Math.sin(Math.PI * u) * 6
    }
    if (relayHalo.current) {
      const glow = THREE.MathUtils.smoothstep(t, 5.0, 5.6) * (1 - THREE.MathUtils.smoothstep(t, 6.6, 8))
      ;(relayHalo.current.material as THREE.MeshBasicMaterial).color.set(C.signal).multiplyScalar(0.6 + glow * 2)
      relayHalo.current.scale.setScalar(2.6 + glow * 0.8)
    }
    if (ripple.current) {
      const u = THREE.MathUtils.clamp((t - 7.4) / 1.8, 0, 1)
      ripple.current.visible = u > 0 && u < 1
      ripple.current.scale.setScalar(1 + u * 30)
      ;(ripple.current.material as THREE.MeshBasicMaterial).color.set(C.safe).multiplyScalar(1.6 * (1 - u))
    }
  })

  return (
    <group>
      {/* the household box that is about to die */}
      <group ref={box}>
        <mesh>
          <boxGeometry args={[1.4, 1.1, 1.4]} />
          <meshStandardMaterial color="#d7e3f3" emissive="#0f2b3d" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.65, 0]}>
          <cylinderGeometry args={[0.95, 0.95, 0.18, 20]} />
          <meshStandardMaterial color="#f97316" />
        </mesh>
        <mesh position={[0.4, 1.6, 0.4]}>
          <cylinderGeometry args={[0.04, 0.04, 1.9, 6]} />
          <meshStandardMaterial color="#cbd5e1" />
        </mesh>
        <mesh position={[-0.2, 0.62, -0.2]}>
          <cylinderGeometry args={[0.28, 0.28, 0.12, 16]} />
          <meshBasicMaterial color={C.danger} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={halo} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 1, 64]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      {[0, 1, 2, 3].map((k) => (
        <mesh key={k} ref={(m) => { if (m) sparks.current[k] = m }} visible={false}>
          <sphereGeometry args={[0.22, 12, 12]} />
          <meshBasicMaterial color={C.danger} toneMapped={false} />
        </mesh>
      ))}

      {/* rooftop relay: a building with a solar panel and mast */}
      <mesh position={[RELAY.x, 2.6, RELAY.z]}>
        <boxGeometry args={[4, 5.6, 4]} />
        <meshStandardMaterial color="#14243b" emissive="#06121f" />
      </mesh>
      <mesh position={[RELAY.x - 0.8, 5.55, RELAY.z]} rotation={[-0.4, 0, 0]}>
        <boxGeometry args={[1.8, 0.08, 1.2]} />
        <meshStandardMaterial color="#1e3a8a" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[RELAY.x + 0.8, 6.3, RELAY.z]}>
        <cylinderGeometry args={[0.25, 0.35, 1.6, 8]} />
        <meshStandardMaterial color="#cbd5e1" emissive="#0b3b2f" />
      </mesh>
      <mesh ref={relayHalo} position={[RELAY.x, 5.45, RELAY.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 1, 64]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={relaySparks} visible={false}>
        <sphereGeometry args={[0.28, 12, 12]} />
        <meshBasicMaterial color={C.signal} toneMapped={false} />
      </mesh>

      {/* control-room gateway on high ground */}
      <mesh position={[GATEWAY.x, GATEWAY.y / 2 - 1, GATEWAY.z]}>
        <cylinderGeometry args={[0.6, 2.2, GATEWAY.y, 6]} />
        <meshStandardMaterial color="#1f3b4d" metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[GATEWAY.x, GATEWAY.y + 0.4, GATEWAY.z]}>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color={C.safe} toneMapped={false} />
      </mesh>
      <mesh ref={ripple} position={[GATEWAY.x, 0.3, GATEWAY.z]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.9, 1, 96]} />
        <meshBasicMaterial transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** A few calm neighbours with breathing halos and faint links, so the scene reads as a network. */
function Neighbours() {
  const pts = useMemo(() => {
    const r = (s: number) => { const x = Math.sin(s * 999) * 10000; return x - Math.floor(x) }
    return Array.from({ length: 26 }, (_, k) => new THREE.Vector3((r(k) - 0.5) * 70, 0.2, (r(k + 50) - 0.5) * 60 - 8))
      .filter((p) => p.distanceTo(BOX) > 5 && p.distanceTo(RELAY) > 5)
  }, [])
  const halos = useRef<THREE.Mesh[]>([])
  useFrame(({ clock }) => {
    halos.current.forEach((h, k) => h && h.scale.setScalar(1.4 + 0.08 * Math.sin(clock.elapsedTime * 0.8 + k)))
  })
  const lines = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const arr: number[] = []
    pts.forEach((a, i) => pts.forEach((b, j) => { if (j > i && a.distanceTo(b) < 16) arr.push(a.x, 0.4, a.z, b.x, 0.4, b.z) }))
    const all = [...pts, BOX, RELAY]
    all.forEach((p) => { if (p.distanceTo(RELAY) < 22) arr.push(p.x, 0.4, p.z, RELAY.x, RELAY.y, RELAY.z) })
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3))
    return g
  }, [pts])
  return (
    <group>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#38bdf8" transparent opacity={0.16} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {pts.map((p, k) => (
        <Float key={k} speed={1.2} rotationIntensity={0.15} floatIntensity={0.25}>
          <mesh position={[p.x, 0.35, p.z]}>
            <boxGeometry args={[0.8, 0.6, 0.8]} />
            <meshStandardMaterial color="#c9d6ea" emissive="#0e2a3a" />
          </mesh>
          <mesh ref={(m) => { if (m) halos.current[k] = m }} position={[p.x, 0.12, p.z]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.85, 1, 48]} />
            <meshBasicMaterial color={new THREE.Color(C.ink).multiplyScalar(0.9)} transparent blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </Float>
      ))}
    </group>
  )
}

export function HeroScene() {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [-18, 13, 24], fov: 45 }} gl={{ antialias: true }}>
      <color attach="background" args={[C.bg]} />
      <fog attach="fog" args={[C.bg, 30, 95]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1.2} />
      <Stars radius={120} depth={40} count={1500} factor={3} fade speed={0.5} />
      <Water />
      <Neighbours />
      <Story />
      <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.35} maxPolarAngle={1.35} minPolarAngle={0.6} target={[2, 1, -2]} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur intensity={1.1} luminanceThreshold={0.3} />
      </EffectComposer>
    </Canvas>
  )
}
