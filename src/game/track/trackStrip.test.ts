import { describe, expect, it } from 'vitest'
import { stripMeshData } from './trackStrip'
import { TrackPath } from './trackPath'

const straight = TrackPath.fromControlPoints([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: -100 }], false)

describe('stripMeshData', () => {
  it('builds an upward-facing road ribbon between two lateral edges', () => {
    const data = stripMeshData(straight, { fromS: 0, toS: 20, step: 10, left: { lateral: -4, height: 0 }, right: { lateral: 4, height: 0 } })

    expect(data.positions).toHaveLength(3 * 6)
    expect(data.indices).toHaveLength(2 * 6)
    expect(data.positions[0]).toBeCloseTo(-4, 4)
    expect(data.positions[3]).toBeCloseTo(4, 4)

    const vertex = (index: number): [number, number, number] => [data.positions[index * 3]!, data.positions[index * 3 + 1]!, data.positions[index * 3 + 2]!]
    const [a, b, c] = [vertex(data.indices[0]!), vertex(data.indices[1]!), vertex(data.indices[2]!)]
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const normalY = ab[2]! * ac[0]! - ab[0]! * ac[2]!
    expect(normalY).toBeGreaterThan(0)
  })

  it('raises vertical wall strips by edge height', () => {
    const data = stripMeshData(straight, { fromS: 10, toS: 30, step: 20, left: { lateral: 5, height: 0 }, right: { lateral: 5, height: 1.4 } })

    expect(data.positions[1]).toBeCloseTo(0, 5)
    expect(data.positions[4]).toBeCloseTo(1.4, 5)
  })

  it('rejects strips that do not advance', () => {
    expect(() => stripMeshData(straight, { fromS: 10, toS: 10, step: 1, left: { lateral: 0, height: 0 }, right: { lateral: 1, height: 0 } })).toThrow(/advance/)
  })
})
