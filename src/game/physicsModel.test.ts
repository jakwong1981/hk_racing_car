import { describe, expect, it } from 'vitest'
import { HONG_KONG_ROUTE } from '../config/tracks/hongKongRoute'
import { HOVER_HEIGHT, hoverForceFor, simulateStraightDrive, smoothVisualHeight } from './physicsModel'
import { courseLayoutFor, isOutsideTrackVolume } from './raceProgress'
import { TrackPath } from './track/trackPath'

describe('hover kart smoke model', () => {
  it('counters gravity for every vehicle mass at target hover height', () => {
    for (const mass of [1, 1.4, 2.1, 2.6]) expect(hoverForceFor(mass, 18, HOVER_HEIGHT, 0)).toBeCloseTo(mass * 18)
  })

  it('critically damps vertical movement around the hover height', () => {
    const stationaryForce = hoverForceFor(1, 18, HOVER_HEIGHT, 0)
    expect(hoverForceFor(1, 18, HOVER_HEIGHT, 1)).toBeLessThan(stationaryForce)
    expect(hoverForceFor(1, 18, HOVER_HEIGHT, -1)).toBeGreaterThan(stationaryForce)
  })

  it('filters solver noise while following meaningful height changes', () => {
    expect(smoothVisualHeight(.4, .401, 1 / 60)).toBe(.4)
    expect(smoothVisualHeight(.4, 1.4, 1 / 60)).toBeGreaterThan(.4)
  })

  it('sustains acceleration inside the Mong Kok track volume for fifteen seconds', () => {
    const path = TrackPath.fromControlPoints(HONG_KONG_ROUTE.controlPoints, HONG_KONG_ROUTE.closed)
    const course = courseLayoutFor(HONG_KONG_ROUTE, path.length)

    const sample = simulateStraightDrive(15, 19, 44)
    const projection = path.project({ x: path.pointAt(HONG_KONG_ROUTE.startS).x, y: sample.y, z: Math.max(sample.z, -300) })

    expect(sample.speed).toBeGreaterThan(0)
    expect(sample.z).toBeLessThan(8)
    expect(sample.y).toBeCloseTo(HOVER_HEIGHT)
    expect(isOutsideTrackVolume(course, projection)).toBe(false)
  })
})
