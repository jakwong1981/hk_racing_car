import type { TrackPath } from './trackPath'

export interface StripEdge { lateral: number; height: number }
export interface StripSpec { fromS: number; toS: number; step: number; left: StripEdge; right: StripEdge; uvLength?: number }
export interface StripMeshData { positions: Float32Array; uvs: Float32Array; indices: Uint32Array }

/** Triangles wind counter-clockwise when viewed from the left edge's up/inward side, so flat road strips face upward. */
export const stripMeshData = (path: TrackPath, spec: StripSpec): StripMeshData => {
  const span = spec.toS - spec.fromS
  if (span <= 0) throw new Error(`Strip must advance along the track, received ${spec.fromS} → ${spec.toS}`)
  const segments = Math.max(1, Math.ceil(span / spec.step))
  const uvLength = spec.uvLength ?? 10
  const positions = new Float32Array((segments + 1) * 6)
  const uvs = new Float32Array((segments + 1) * 4)
  const indices = new Uint32Array(segments * 6)

  for (let index = 0; index <= segments; index += 1) {
    const s = spec.fromS + span * index / segments
    const left = path.pointAt(s, spec.left.lateral, spec.left.height)
    const right = path.pointAt(s, spec.right.lateral, spec.right.height)
    positions.set([left.x, left.y, left.z, right.x, right.y, right.z], index * 6)
    const v = (s - spec.fromS) / uvLength
    uvs.set([0, v, 1, v], index * 4)
  }

  for (let segment = 0; segment < segments; segment += 1) {
    const leftNow = segment * 2
    const rightNow = leftNow + 1
    const leftNext = leftNow + 2
    const rightNext = leftNow + 3
    indices.set([leftNow, rightNow, leftNext, rightNow, rightNext, leftNext], segment * 6)
  }

  return { positions, uvs, indices }
}
