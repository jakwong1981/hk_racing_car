import { describe, expect, it } from 'vitest'
import { TrackPath, forwardForYaw, rightForYaw } from './trackPath'

const square = [
  { x: 0, y: 0, z: 0 },
  { x: 0, y: 0, z: -100 },
  { x: 100, y: 0, z: -100 },
  { x: 100, y: 0, z: 0 },
]

describe('TrackPath', () => {
  it('rejects paths without enough control points', () => {
    expect(() => TrackPath.fromControlPoints([{ x: 0, y: 0, z: 0 }], false)).toThrow(/at least 2/)
    expect(() => TrackPath.fromControlPoints(square.slice(0, 2), true)).toThrow(/at least 3/)
  })

  it('measures an open straight by arc length and faces the vehicle forward', () => {
    const path = TrackPath.fromControlPoints([{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -50 }, { x: 0, y: 0, z: -100 }], false)

    const midpoint = path.sampleAt(50)

    expect(path.length).toBeCloseTo(100, 1)
    expect(midpoint.z).toBeCloseTo(-50, 1)
    expect(forwardForYaw(midpoint.yaw).z).toBeCloseTo(-1, 5)
    expect(rightForYaw(midpoint.yaw).x).toBeCloseTo(1, 5)
  })

  it('clamps open paths and wraps closed paths', () => {
    const open = TrackPath.fromControlPoints(square, false)
    const closed = TrackPath.fromControlPoints(square, true)

    expect(open.normalizeS(-5)).toBe(0)
    expect(open.normalizeS(open.length + 5)).toBe(open.length)
    expect(closed.normalizeS(closed.length + 5)).toBeCloseTo(5, 6)
    expect(closed.normalizeS(-5)).toBeCloseTo(closed.length - 5, 6)
  })

  it('is continuous across the closed-loop seam', () => {
    const path = TrackPath.fromControlPoints(square, true)

    const beforeSeam = path.sampleAt(path.length - .25)
    const afterSeam = path.sampleAt(.25)

    expect(Math.hypot(beforeSeam.x - afterSeam.x, beforeSeam.z - afterSeam.z)).toBeLessThan(.75)
    expect(path.signedDistance(path.length - 3, 2)).toBeCloseTo(5, 6)
    expect(path.signedDistance(2, path.length - 3)).toBeCloseTo(-5, 6)
  })

  it('projects a point to distance, right-hand lateral offset and height', () => {
    const path = TrackPath.fromControlPoints([{ x: 0, y: 0, z: 0 }, { x: 0, y: 2, z: -50 }, { x: 0, y: 4, z: -100 }], false)

    const projection = path.project({ x: 3, y: 5, z: -60 })

    expect(projection.s).toBeCloseTo(60, 0)
    expect(projection.lateral).toBeCloseTo(3, 1)
    expect(projection.vertical).toBeCloseTo(5 - path.sampleAt(projection.s).y, 3)
  })

  it('places lateral points perpendicular to travel', () => {
    const path = TrackPath.fromControlPoints(square, true)
    const sample = path.sampleAt(40)

    const point = path.pointAt(40, 6, 1.5)
    const forward = forwardForYaw(sample.yaw)

    expect(Math.hypot(point.x - sample.x, point.z - sample.z)).toBeCloseTo(6, 6)
    expect((point.x - sample.x) * forward.x + (point.z - sample.z) * forward.z).toBeCloseTo(0, 6)
    expect(point.y).toBeCloseTo(sample.y + 1.5, 6)
  })

  it('falls back to a global search when the hint is far from the point', () => {
    const path = TrackPath.fromControlPoints(square, true)
    const target = path.pointAt(path.length / 2)

    const projection = path.project(target, 0)

    expect(Math.abs(path.signedDistance(projection.s, path.length / 2))).toBeLessThan(1)
  })
})
