import { useLayoutEffect, type RefObject } from 'react'
import * as THREE from 'three'

const white = new THREE.Color(1, 1, 1)

/**
 * Create the per-instance colour attribute before the first render; if it appears later the
 * already-compiled shader ignores it.
 */
export function useInstanceColors(refs: RefObject<THREE.InstancedMesh | null>[], deps: unknown[] = []) {
  useLayoutEffect(() => {
    for (const ref of refs) {
      const mesh = ref.current
      if (!mesh || mesh.instanceColor) continue
      for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, white)
      if (mesh.instanceColor !== null) (mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
