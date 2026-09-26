import { describe, expect, it } from 'vitest'
import { TrackPath } from '../game/track/trackPath'
import { TRACKS } from './trackConfig'
import { HONG_KONG_ROUTE } from './tracks/hongKongRoute'
import { NEON_RIFT } from './tracks/neonRift'

const pathFor = (id: string): TrackPath => {
  const track = TRACKS.find(candidate => candidate.id === id)
  if (!track) throw new Error(`Unknown track ${id}`)
  return TrackPath.fromControlPoints(track.controlPoints, track.closed)
}

describe('track catalogue', () => {
  it.each(TRACKS)('$id keeps checkpoints strictly ordered and inside the course', track => {
    const path = TrackPath.fromControlPoints(track.controlPoints, track.closed)

    track.checkpointS.forEach((s, index) => {
      expect(s).toBeGreaterThan(index === 0 ? (track.closed ? track.finishS : track.startS) : track.checkpointS[index - 1]!)
      expect(s).toBeLessThan(path.length)
    })
    expect(track.startS).toBeLessThan(path.length)
    expect(track.laps).toBeGreaterThan(0)
  })

  it('keeps the Mong Kok sprint on its original curved centreline', () => {
    const path = pathFor(HONG_KONG_ROUTE.id)
    const legacyCenterX = (z: number): number => Math.sin((z - 8) / 46) * 4.2 + Math.sin((z - 8) / 103) * 1.8

    for (const z of [8, -60, -150, -292]) {
      const projection = path.project({ x: legacyCenterX(z), y: 0, z })
      expect(Math.abs(projection.lateral)).toBeLessThan(.05)
    }
    expect(path.pointAt(HONG_KONG_ROUTE.startS).z).toBeCloseTo(8, 0)
  })

  it('lays out Neon Rift as a 1.6 km closed circuit with twelve checkpoints and drivable grades', () => {
    const path = pathFor(NEON_RIFT.id)
    let steepestGrade = 0
    for (let s = 0; s < path.length; s += 1) steepestGrade = Math.max(steepestGrade, Math.abs(path.sampleAt(s).grade))

    expect(path.length).toBeGreaterThan(1500)
    expect(path.length).toBeLessThan(1700)
    expect(NEON_RIFT.checkpointS).toHaveLength(12)
    expect(steepestGrade).toBeLessThan(.12)
  })

  it('keeps separate parts of Neon Rift from overlapping', () => {
    const path = pathFor(NEON_RIFT.id)
    let closestApproach = Number.POSITIVE_INFINITY
    for (let s = 0; s < path.length; s += 4) for (let t = 0; t < path.length; t += 4) {
      if (Math.abs(path.signedDistance(s, t)) < 80) continue
      const a = path.sampleAt(s)
      const b = path.sampleAt(t)
      closestApproach = Math.min(closestApproach, Math.hypot(a.x - b.x, a.z - b.z))
    }

    expect(closestApproach).toBeGreaterThan(NEON_RIFT.roadWidth * 2)
  })
})
