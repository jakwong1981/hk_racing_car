import { describe, expect, it } from 'vitest'
import { HOVER_HEIGHT } from '../physicsModel'
import { advanceSpin, brakeForceFor, brakingDistance, IDLE_SPIN, limitYawRate, loadedGripFactor, SPIN_DURATION_MS, suspensionUnloading, yawRateCap, type SpinInput } from './handlingModel'

const step = 1 / 60
const overSteer = (overrides: Partial<SpinInput> = {}): SpinInput => ({ dt: step, requestedYawRate: 2, yawRateCap: .3, grip: .2, speed: 30, exempt: false, ...overrides })

describe('handling model', () => {
  it('caps turn rate harder at higher speed and lower grip (understeer)', () => {
    expect(yawRateCap(40, 1, false)).toBeLessThan(yawRateCap(20, 1, false))
    expect(yawRateCap(30, .5, false)).toBeCloseTo(yawRateCap(30, 1, false) / 2)
    expect(yawRateCap(30, .7, true)).toBeGreaterThan(yawRateCap(30, .7, false))
    expect(limitYawRate(-2.5, .6)).toBe(-.6)
    expect(limitYawRate(.2, .6)).toBe(.2)
  })

  it('scales braking with mass so heavy vehicles decelerate at the same rate', () => {
    expect(brakeForceFor(5, 1) / 5).toBeCloseTo(brakeForceFor(2, 1) / 2)
    expect(brakeForceFor(2, .83)).toBeLessThan(brakeForceFor(2, 1))
  })

  it('lengthens stopping distance by about 20% in the storm brake multiplier', () => {
    const dry = brakingDistance(50, 25, 15)
    const wet = brakingDistance(50, 25, 15 * .83)
    expect(wet / dry).toBeGreaterThan(1.18)
    expect(wet / dry).toBeLessThan(1.22)
    expect(brakingDistance(20, 25, 15)).toBe(0)
  })

  it('loses grip as the suspension extends over a crest', () => {
    expect(suspensionUnloading(HOVER_HEIGHT)).toBe(0)
    expect(suspensionUnloading(undefined)).toBe(1)
    expect(loadedGripFactor(suspensionUnloading(HOVER_HEIGHT + .2))).toBeLessThan(1)
    expect(loadedGripFactor(1)).toBeCloseTo(.35)
  })

  it('spins only after sustained over-steering on very low grip', () => {
    let state = IDLE_SPIN
    for (let frame = 0; frame < 10; frame += 1) state = advanceSpin(state, overSteer())
    expect(state.remainingMs).toBe(0)
    let framesUntilSpin = 0
    while (state.remainingMs === 0 && framesUntilSpin < 60) {
      state = advanceSpin(state, overSteer())
      framesUntilSpin += 1
    }
    expect(state.remainingMs).toBe(SPIN_DURATION_MS)
    expect(10 + framesUntilSpin).toBeGreaterThanOrEqual(15)
    expect(10 + framesUntilSpin).toBeLessThanOrEqual(16)
    expect(state.direction).toBe(1)
  })

  it('never spins on normal grip, while drifting, or when steering gently', () => {
    const cases: Partial<SpinInput>[] = [{ grip: .7 }, { exempt: true }, { requestedYawRate: .4 }, { speed: 8 }]
    for (const overrides of cases) {
      let state = IDLE_SPIN
      for (let frame = 0; frame < 120; frame += 1) state = advanceSpin(state, overSteer(overrides))
      expect(state.remainingMs).toBe(0)
    }
  })
})
