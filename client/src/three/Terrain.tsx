import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { InitPayload } from '../lib/types'
import { SCENE, VSCALE } from '../lib/visual'

/** Elevation packed into an 8-bit texture so the water shader can find its own shoreline. */
export function useElevationTexture(init: InitPayload) {
  return useMemo(() => {
    const { grid: n, elev } = init.terrain
    let min = Infinity
    let max = -Infinity
    for (const v of elev) {
      if (v < min) min = v
      if (v > max) max = v
    }
    const data = new Uint8Array(n * n * 4)
    for (let i = 0; i < n * n; i++) {
      const v = Math.round(((elev[i] - min) / (max - min || 1)) * 255)
      data[i * 4] = v
      data[i * 4 + 3] = 255
    }
    const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat)
    tex.magFilter = THREE.LinearFilter
    tex.minFilter = THREE.LinearFilter
    tex.needsUpdate = true
    return { tex, min, max, n }
  }, [init])
}

const terrainVert = /* glsl */ `
  uniform float uVScale;
  varying float vH;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vH = position.y / uVScale;
    vN = normalize(normalMatrix * normal);
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const terrainFrag = /* glsl */ `
  uniform float uLevel;
  varying float vH;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 bed = vec3(0.035, 0.07, 0.13);
    vec3 low = vec3(0.07, 0.17, 0.19);
    vec3 mid = vec3(0.09, 0.15, 0.22);
    vec3 high = vec3(0.16, 0.21, 0.30);
    vec3 col = vH < 0.0 ? bed : mix(low, mid, smoothstep(0.0, 4.0, vH));
    col = mix(col, high, smoothstep(4.0, 10.0, vH));
    float light = clamp(dot(normalize(vN), normalize(vec3(0.4, 1.0, 0.3))), 0.0, 1.0);
    col *= 0.55 + 0.75 * light;
    // 1 m contour lines
    float f = fract(vH);
    float d = min(f, 1.0 - f) / max(fwidth(vH), 1e-4);
    col += vec3(0.13, 0.55, 0.65) * (1.0 - clamp(d, 0.0, 1.0)) * 0.22;
    // 10-unit operations grid
    vec2 g = abs(fract(vW.xz / 10.0 - 0.5) - 0.5) / fwidth(vW.xz / 10.0);
    col += vec3(0.25, 0.4, 0.6) * (1.0 - clamp(min(g.x, g.y), 0.0, 1.0)) * 0.06;
    // wet ground under the flood darkens
    col *= vH < uLevel ? 0.7 : 1.0;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`

export function Terrain({ init, level }: { init: InitPayload; level: number }) {
  const geom = useMemo(() => {
    const { grid: n, elev } = init.terrain
    const g = new THREE.PlaneGeometry(SCENE, SCENE, n - 1, n - 1)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, elev[i] * VSCALE)
    g.computeVertexNormals()
    return g
  }, [init])

  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: terrainVert,
      fragmentShader: terrainFrag,
      uniforms: { uVScale: { value: VSCALE }, uLevel: { value: 0 } },
    }),
    [],
  )
  mat.uniforms.uLevel.value = level

  return (
    <group>
      <mesh geometry={geom} material={mat} receiveShadow />
      {/* skirt so the island of terrain reads as a physical tabletop model */}
      <mesh position={[0, -3.2, 0]}>
        <boxGeometry args={[SCENE, 6, SCENE]} />
        <meshBasicMaterial color="#0a1324" />
      </mesh>
    </group>
  )
}

const waterVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const waterFrag = /* glsl */ `
  uniform sampler2D uElev;
  uniform float uMin;
  uniform float uMax;
  uniform float uN;
  uniform float uLevel;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vec2 tuv = vec2((vUv.x * (uN - 1.0) + 0.5) / uN, ((1.0 - vUv.y) * (uN - 1.0) + 0.5) / uN);
    float ground = mix(uMin, uMax, texture2D(uElev, tuv).r);
    float depth = uLevel - ground;
    if (depth <= 0.0) discard;
    float ripple = sin(vW.x * 0.9 + uTime * 1.3) * sin(vW.z * 0.7 - uTime * 1.1)
                 + 0.5 * sin((vW.x + vW.z) * 2.1 + uTime * 2.0);
    vec3 shallow = vec3(0.16, 0.45, 0.85);
    vec3 deep = vec3(0.04, 0.12, 0.38);
    vec3 col = mix(shallow, deep, smoothstep(0.0, 3.0, depth));
    col += vec3(0.25, 0.5, 0.9) * ripple * 0.06;
    float foam = 1.0 - smoothstep(0.0, 0.18, depth);
    col = mix(col, vec3(0.75, 0.9, 1.0), foam * 0.55);
    float alpha = mix(0.5, 0.82, smoothstep(0.0, 2.0, depth)) + foam * 0.15;
    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`

export function Water({ init, level }: { init: InitPayload; level: number }) {
  const { tex, min, max, n } = useElevationTexture(init)
  const mesh = useRef<THREE.Mesh>(null)
  const mat = useMemo(
    () => new THREE.ShaderMaterial({
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uElev: { value: tex }, uMin: { value: min }, uMax: { value: max }, uN: { value: n },
        uLevel: { value: level }, uTime: { value: 0 },
      },
    }),
    [tex, min, max, n], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const target = useRef(level)
  target.current = level

  useFrame((_, dt) => {
    const u = mat.uniforms
    u.uTime.value += dt
    // ease the surface toward the latest level so it rises continuously, never in steps
    u.uLevel.value += (target.current - u.uLevel.value) * Math.min(dt * 3, 1)
    if (mesh.current) mesh.current.position.y = u.uLevel.value * VSCALE + 0.03
  })

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2, 0, 0]} material={mat} renderOrder={2}>
      <planeGeometry args={[SCENE, SCENE, 1, 1]} />
    </mesh>
  )
}
