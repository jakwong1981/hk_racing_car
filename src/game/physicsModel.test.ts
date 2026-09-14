import { describe, expect, it } from 'vitest'
import { HOVER_HEIGHT, hoverForceFor, shouldRecoverKart, simulateStraightDrive, smoothVisualHeight } from './physicsModel'

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
    expect(smoothVisualHeight(.4,.401,1/60)).toBe(.4)
    expect(smoothVisualHeight(.4,1.4,1/60)).toBeGreaterThan(.4)
  })

  it('sustains acceleration and track framing for fifteen seconds', () => {
    const sample = simulateStraightDrive(15, 19, 44)
    expect(sample.speed).toBeGreaterThan(0)
    expect(sample.z).toBeLessThan(8)
    expect(sample.y).toBeCloseTo(HOVER_HEIGHT)
    expect(shouldRecoverKart(0, sample.y, Math.max(sample.z, -300))).toBe(false)
  })

  it('recovers a kart below or outside the track volume', () => {
    expect(shouldRecoverKart(0, -3.1, -100)).toBe(true)
    expect(shouldRecoverKart(23, 1, -100)).toBe(true)
  })
})
