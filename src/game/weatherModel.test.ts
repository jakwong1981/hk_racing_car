import { describe, expect, it } from 'vitest'
import { NEON_RIFT } from '../config/tracks/neonRift'
import type { WeatherStage } from '../types/game'
import { AQUAPLANE_SPEED, surfaceConditionFor, weatherAt, type SurfaceQuery, type WeatherState } from './weatherModel'

const LENGTH = 1600
const LAPS = 5
const at = (lap: number, s: number): WeatherState => weatherAt(NEON_RIFT.weather, (lap - 1) * LENGTH + s, LENGTH, LAPS)
const query = (weather: WeatherState, overrides: Partial<SurfaceQuery> = {}): SurfaceQuery => ({ weather, lateral: 0, racingLineLateral: 0, inPuddle: false, onKerb: false, speed: 20, ...overrides })

describe('weather model', () => {
  it('follows the Neon Rift schedule: damp, storm from lap 3 sector 2, then drying', () => {
    expect(at(1, 100).kind).toBe('damp')
    expect(at(3, 400).kind).toBe('damp')
    expect(at(3, 600).kind).toBe('storm')
    expect(at(4, 10).kind).toBe('drying')
    expect(at(5, 1500).kind).toBe('drying')
  })

  it('keeps full grip while damp and drops it by 35% in the storm with longer braking', () => {
    expect(surfaceConditionFor(query(at(1, 100)))).toEqual({ grip: 1, brake: 1, aquaplaning: false })
    const storm = surfaceConditionFor(query(at(3, 700)))
    expect(storm.grip).toBeCloseTo(.65)
    expect(storm.brake).toBeLessThan(.85)
  })

  it('aquaplanes only through standing water at speed', () => {
    const storm = at(3, 700)
    expect(surfaceConditionFor(query(storm, { inPuddle: true, speed: AQUAPLANE_SPEED + 2 })).aquaplaning).toBe(true)
    expect(surfaceConditionFor(query(storm, { inPuddle: true, speed: AQUAPLANE_SPEED - 5 })).aquaplaning).toBe(false)
    expect(surfaceConditionFor(query(at(1, 100), { inPuddle: true, speed: 50 })).aquaplaning).toBe(false)
  })

  it('dries the racing line first while the rest of the road stays slippery', () => {
    const lateLap5 = at(5, 1200)
    const onLine = surfaceConditionFor(query(lateLap5, { lateral: 1, racingLineLateral: 1 }))
    const offLine = surfaceConditionFor(query(lateLap5, { lateral: 6, racingLineLateral: 0 }))
    expect(onLine.grip).toBeGreaterThan(.9)
    expect(offLine.grip).toBeLessThan(.8)
    expect(surfaceConditionFor(query(at(4, 100), { lateral: 1, racingLineLateral: 1 })).grip).toBeLessThan(onLine.grip)
  })

  it('makes wet kerbs less grippy than dry ones', () => {
    const dryKerb = surfaceConditionFor(query(at(1, 100), { onKerb: true })).grip
    const wetKerb = surfaceConditionFor(query(at(3, 700), { onKerb: true })).grip
    expect(dryKerb).toBeLessThan(1)
    expect(wetKerb).toBeLessThan(.65)
  })

  it('stays clear for tracks without a weather script', () => {
    const clear: readonly WeatherStage[] = [{ fromLap: 1, fromS: 0, kind: 'clear' }]
    expect(weatherAt(clear, 5000, LENGTH, 2)).toMatchObject({ kind: 'clear', rain: 0, wetness: 0 })
  })
})
