import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { Frame, InitPayload } from '../lib/types'
import { C, SCENE_THEME, VSCALE, glowBlending, toScene } from '../lib/visual'

const MAX_LINKS = 12000

/** Radio links: brightness follows link margin; links below the safety margin turn dim amber. */
export function Links({ init, frame, links, highlight }: { init: InitPayload; frame: Frame; links: number[]; highlight: number | null }) {
  const light = SCENE_THEME.light
  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LINKS * 6), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_LINKS * 6), 3))
    g.setDrawRange(0, 0)
    return g
  }, [])

  useEffect(() => {
    const size = init.terrain.size_m
    const p = geom.attributes.position.array as Float32Array
    const c = geom.attributes.color.array as Float32Array
    const L = links
    const { x, y, z } = frame.nodes
    const col = new THREE.Color()
    const strong = new THREE.Color(C.link)
    const weak = new THREE.Color(C.linkWeak)
    const bg = new THREE.Color(C.bg)
    let k = 0
    for (let j = 0; j + 2 < L.length && k < MAX_LINKS; j += 3) {
      const a = L[j]
      const b = L[j + 1]
      const q = L[j + 2]
      const focus = highlight !== null && (a === highlight || b === highlight)
      if (highlight !== null && !focus && q < 3) continue
      const [ax, az] = toScene(x[a], y[a], size)
      const [bx, bz] = toScene(x[b], y[b], size)
      p.set([ax, z[a] * VSCALE + 0.4, az, bx, z[b] * VSCALE + 0.4, bz], k * 6)
      if (q < 3) col.copy(weak).multiplyScalar(0.18)
      else col.copy(strong).multiplyScalar(Math.min(0.06 + q / 90, 0.32))
      if (focus) col.multiplyScalar(4)
      else if (highlight !== null) col.multiplyScalar(0.35)
      // On a light background the same strength becomes a mix toward the page colour.
      if (light) col.setRGB(Math.min(col.r * 3, 1), Math.min(col.g * 3, 1), Math.min(col.b * 3, 1)).lerp(bg, focus ? 0 : 0.35)
      c.set([col.r, col.g, col.b, col.r, col.g, col.b], k * 6)
      k++
    }
    geom.setDrawRange(0, k * 2)
    geom.attributes.position.needsUpdate = true
    geom.attributes.color.needsUpdate = true
    geom.computeBoundingSphere()
  }, [frame, links, geom, init, highlight, light])

  return (
    <lineSegments geometry={geom} frustumCulled={false} renderOrder={1}>
      <lineBasicMaterial vertexColors transparent opacity={light ? 0.7 : 1} blending={glowBlending()} depthWrite={false} toneMapped={false} />
    </lineSegments>
  )
}
