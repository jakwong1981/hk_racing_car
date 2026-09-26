import { describe, expect, it } from 'vitest'
import { NEON_RIFT } from '../../config/tracks/neonRift'
import { RacingLine, SpeedProfile } from './racingLine'
import { TrackPath } from './trackPath'

const path = TrackPath.fromControlPoints(NEON_RIFT.controlPoints, true)
const maxLateral = NEON_RIFT.roadWidth / 2 - 2.2

describe('racing line', () => {
  const line = RacingLine.fromPath(path, maxLateral)

  it('clips the inside of the Turn 3 right-hander and the left-hand first chicane apex', () => {
    expect(line.lateralAt(390)).toBeGreaterThan(2)
    expect(line.lateralAt(780)).toBeLessThan(-1)
  })

  it('stays on the road and near the centre on the start straight', () => {
    for (let s = 0; s < path.length; s += 5) expect(Math.abs(line.lateralAt(s))).toBeLessThanOrEqual(maxLateral + 1e-9)
    expect(Math.abs(line.lateralAt(20))).toBeLessThan(1)
  })
})

describe('speed profile', () => {
  const profile = SpeedProfile.fromPath(path)

  it('demands braking before Turn 3 and allows far more pace on the straight', () => {
    expect(profile.speedAt(390, 1)).toBeLessThan(35)
    expect(profile.speedAt(200, 1)).toBeGreaterThan(profile.speedAt(390, 1) * 1.4)
    expect(profile.speedAt(340, 1)).toBeLessThan(profile.speedAt(200, 1))
  })

  it('slows every corner in the wet by the square root of grip', () => {
    expect(profile.speedAt(390, .64)).toBeCloseTo(profile.speedAt(390, 1) * .8)
  })
})
