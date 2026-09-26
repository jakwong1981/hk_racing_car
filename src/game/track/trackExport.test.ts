import { describe, expect, it } from 'vitest'
import { NEON_RIFT } from '../../config/tracks/neonRift'
import { exportTrack } from './trackExport'

describe('track export', () => {
  it('exports Neon Rift checkpoints, all 15 corners and landmarks with world coordinates', () => {
    const data = exportTrack(NEON_RIFT)

    expect(data.checkpoints).toHaveLength(12)
    expect(data.corners.map(corner => corner.turn)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1))
    expect(data.landmarks.map(landmark => landmark.id)).toContain('t3-holo-wall')
    expect(data.finishLine).toEqual({ x: 0, y: 0, z: 0 })
    for (const point of [...data.checkpoints, ...data.landmarks]) expect(Number.isFinite(point.x + point.y + point.z)).toBe(true)
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
  })
})
