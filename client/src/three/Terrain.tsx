import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import type { InitPayload } from '../lib/types'
import { SCENE, SCENE_THEME, VSCALE } from '../lib/visual'

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
  uniform vec3 uBed;
  uniform vec3 uLow;
  uniform vec3 uMid;
  uniform vec3 uHigh;
  uniform vec3 uContour;
  uniform float uContourA;
  uniform vec3 uGrid;
  uniform float uGridA;
  uniform float uLight;
  varying float vH;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vec3 col = vH < 0.0 ? uBed : mix(uLow, uMid, smoothstep(0.0, 4.0, vH));
    col = mix(col, uHigh, smoothstep(4.0, 10.0, vH));
    float light = clamp(dot(normalize(vN), normalize(vec3(0.4, 1.0, 0.3))), 0.0, 1.0);
    col *= mix(0.55 + 0.75 * light, 0.8 + 0.25 * light, uLight);
    // 1 m contour lines
    float f = fract(vH);
    float d = min(f, 1.0 - f) / max(fwidth(vH), 1e-4);
    // fade contours where they crowd closer than a few pixels (steep or distant slopes)
    float sparse = clamp(1.0 - fwidth(vH) * 4.0, 0.0, 1.0);
    col = mix(col, uContour, (1.0 - clamp(d, 0.0, 1.0)) * uContourA * sparse);
    // 10-unit operations grid
    vec2 g = abs(fract(vW.xz / 10.0 - 0.5) - 0.5) / fwidth(vW.xz / 10.0);
    vec2 gw = fwidth(vW.xz / 10.0);
    float gridSparse = clamp(1.0 - max(gw.x, gw.y) * 6.0, 0.0, 1.0);
    col = mix(col, uGrid, (1.0 - clamp(min(g.x, g.y), 0.0, 1.0)) * uGridA * gridSparse);
    // wet ground under the flood darkens
    col *= vH < uLevel ? mix(0.7, 0.88, uLight) : 1.0;
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
      uniforms: {
        uVScale: { value: VSCALE }, uLevel: { value: 0 },
        uBed: { value: new THREE.Vector3(...SCENE_THEME.bed) }, uLow: { value: new THREE.Vector3(...SCENE_THEME.low) },
        uMid: { value: new THREE.Vector3(...SCENE_THEME.mid) }, uHigh: { value: new THREE.Vector3(...SCENE_THEME.high) },
        uContour: { value: new THREE.Vector3(...SCENE_THEME.contour) }, uContourA: { value: SCENE_THEME.contourAlpha },
        uGrid: { value: new THREE.Vector3(...SCENE_THEME.grid) }, uGridA: { value: SCENE_THEME.gridAlpha },
        uLight: { value: SCENE_THEME.light ? 1 : 0 },
      },
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
        <meshBasicMaterial color={SCENE_THEME.skirt} />
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
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  varying vec2 vUv;
  varying vec3 vW;
  void main() {
    vec2 tuv = vec2((vUv.x * (uN - 1.0) + 0.5) / uN, ((1.0 - vUv.y) * (uN - 1.0) + 0.5) / uN);
    float ground = mix(uMin, uMax, texture2D(uElev, tuv).r);
    float depth = uLevel - ground;
    if (depth <= 0.0) discard;
    float ripple = sin(vW.x * 0.9 + uTime * 1.3) * sin(vW.z * 0.7 - uTime * 1.1)
                 + 0.5 * sin((vW.x + vW.z) * 2.1 + uTime * 2.0);
    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 3.0, depth));
    col += uShallow * ripple * 0.07;
    float foam = 1.0 - smoothstep(0.0, 0.18, depth);
    col = mix(col, uFoam, foam * 0.55);
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
        uShallow: { value: new THREE.Vector3(...SCENE_THEME.shallow) }, uDeep: { value: new THREE.Vector3(...SCENE_THEME.deep) },
        uFoam: { value: new THREE.Vector3(...SCENE_THEME.foam) },
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
