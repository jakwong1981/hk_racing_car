import { describe, expect, it } from 'vitest'
import { aiControlsFor, headingErrorTo, lookAheadMetres, rubberBandFactor } from './aiDriver'

describe('AI driver', () => {
  it('steers toward the aim point and ignores tiny heading errors', () => {
    expect(aiControlsFor({ headingError: .2, speed: 20, targetSpeed: 30 })).toMatchObject({ left: true, right: false })
    expect(aiControlsFor({ headingError: -.2, speed: 20, targetSpeed: 30 })).toMatchObject({ left: false, right: true })
    expect(aiControlsFor({ headingError: .01, speed: 20, targetSpeed: 30 })).toMatchObject({ left: false, right: false })
  })

  it('accelerates below the target speed and brakes when clearly above it', () => {
    expect(aiControlsFor({ headingError: 0, speed: 20, targetSpeed: 30 })).toMatchObject({ accelerate: true, brake: false })
    expect(aiControlsFor({ headingError: 0, speed: 40, targetSpeed: 30 })).toMatchObject({ accelerate: false, brake: true })
    expect(aiControlsFor({ headingError: 0, speed: 30.5, targetSpeed: 30 })).toMatchObject({ accelerate: false, brake: false })
  })

  it('looks further ahead at speed', () => {
    expect(lookAheadMetres(50)).toBeGreaterThan(lookAheadMetres(10))
  })

  it('rubber-bands within ±6% of pace', () => {
    expect(rubberBandFactor(0)).toBe(1)
    expect(rubberBandFactor(200)).toBeCloseTo(1.03)
    expect(rubberBandFactor(5000)).toBeCloseTo(1.06)
    expect(rubberBandFactor(-5000)).toBeCloseTo(.94)
  })

  it('wraps heading error across ±π', () => {
    expect(headingErrorTo(3.1, -3.1)).toBeCloseTo(2 * Math.PI - 6.2)
  })
})
