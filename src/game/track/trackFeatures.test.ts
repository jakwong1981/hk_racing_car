import { describe, expect, it } from 'vitest'
import { NEON_RIFT } from '../../config/tracks/neonRift'
import { brakeWarningActive, landmarkPosition, tunnelBlend, zoneContains } from './trackFeatures'
import { TrackPath } from './trackPath'

const path = TrackPath.fromControlPoints(NEON_RIFT.controlPoints, true)

describe('track features', () => {
  it('finds kerbs and puddles by distance and lateral offset', () => {
    const apexKerb = NEON_RIFT.kerbs[0]!
    expect(zoneContains(path, apexKerb, 390, 7)).toBe(true)
    expect(zoneContains(path, apexKerb, 390, 0)).toBe(false)
    expect(zoneContains(path, apexKerb, 500, 7)).toBe(false)
  })

  it('places the Turn 3 hologram wall beyond the corner, off the racing surface', () => {
    const wall = NEON_RIFT.landmarks.find(landmark => landmark.kind === 'brakeBoard')!
    const position = landmarkPosition(path, wall)
    expect(Math.abs(path.project(position).lateral)).toBeGreaterThan(NEON_RIFT.roadWidth / 2 + 4)
  })

  it('turns the brake wall red earlier when arriving faster or on a wet surface', () => {
    const approach = { fromS: 250, toS: 365 }
    const warning = (s: number, speed: number, deceleration: number): boolean => brakeWarningActive({ s, speed, approach, cornerSpeed: 24, deceleration })
    expect(warning(300, 50, 12.75)).toBe(true)
    expect(warning(300, 35, 12.75)).toBe(false)
    expect(warning(300, 45, 12.75 * .83)).toBe(true)
    expect(warning(300, 45, 12.75)).toBe(false)
    expect(warning(200, 60, 12.75)).toBe(false)
  })

  it('fades tunnel reverb in on approach and holds it deep inside', () => {
    const tunnels = NEON_RIFT.tunnels
    expect(tunnelBlend(path, tunnels, 500, 18)).toBe(0)
    expect(tunnelBlend(path, tunnels, 696, 18)).toBeCloseTo(.5)
    expect(tunnelBlend(path, tunnels, 800, 18)).toBe(1)
  })
})
