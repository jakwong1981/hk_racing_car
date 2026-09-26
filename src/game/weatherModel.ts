import type { WeatherKind, WeatherStage } from '../types/game'

export interface WeatherState { kind: WeatherKind; dryness: number; rain: number; wetness: number }
export interface SurfaceQuery { weather: WeatherState; lateral: number; racingLineLateral: number; inPuddle: boolean; onKerb: boolean; speed: number }
export interface SurfaceCondition { grip: number; brake: number; aquaplaning: boolean }

export const DRY_SURFACE: SurfaceCondition = { grip: 1, brake: 1, aquaplaning: false }
export const AQUAPLANE_SPEED = 28

const STORM_GRIP = .65
/** Braking deceleration in the storm, sized so stopping distance grows by roughly 20%. */
const STORM_BRAKE = .83
const DRYING_OFF_LINE_GRIP = .72
const RACING_LINE_CORE = 1.5
const RACING_LINE_FALLOFF = 2
const AQUAPLANE_GRIP = .1
const PUDDLES_DRY_AT = .35

/** `progress` is the race leader's distance since the start, so the whole field shares one sky. */
export const weatherAt = (stages: readonly WeatherStage[], progress: number, trackLength: number, totalLaps: number): WeatherState => {
  const startOf = (stage: WeatherStage): number => (stage.fromLap - 1) * trackLength + stage.fromS
  const ordered = [...stages].sort((a, b) => startOf(a) - startOf(b))
  let activeIndex = 0
  ordered.forEach((stage, index) => { if (startOf(stage) <= progress) activeIndex = index })
  const active = ordered[activeIndex]
  if (!active) return { kind: 'clear', dryness: 1, rain: 0, wetness: 0 }
  const next = ordered[activeIndex + 1]
  const stageStart = startOf(active)
  const stageEnd = next ? startOf(next) : totalLaps * trackLength
  const dryness = active.kind === 'drying' ? Math.max(0, Math.min(1, (progress - stageStart) / Math.max(1, stageEnd - stageStart))) : active.kind === 'storm' ? 0 : 1
  return { kind: active.kind, dryness, rain: active.kind === 'storm' ? 1 : 0, wetness: wetnessFor(active.kind, dryness) }
}

const wetnessFor = (kind: WeatherKind, dryness: number): number => {
  if (kind === 'storm') return 1
  if (kind === 'drying') return 1 - dryness * .8
  if (kind === 'damp') return .35
  return 0
}

/** 1 on the rubbered-in racing line, fading to 0 a few metres either side of it. */
export const racingLineWeight = (lateral: number, racingLineLateral: number): number => {
  const offset = Math.abs(lateral - racingLineLateral)
  return Math.max(0, Math.min(1, 1 - (offset - RACING_LINE_CORE) / RACING_LINE_FALLOFF))
}

export const surfaceConditionFor = (query: SurfaceQuery): SurfaceCondition => {
  const { weather } = query
  const aquaplaning = query.inPuddle && Math.abs(query.speed) > AQUAPLANE_SPEED && puddlesStanding(weather)
  if (aquaplaning) return { grip: AQUAPLANE_GRIP, brake: STORM_BRAKE, aquaplaning }
  const baseGrip = gripFor(weather, racingLineWeight(query.lateral, query.racingLineLateral))
  const kerbFactor = query.onKerb ? (weather.wetness > .5 ? .8 : .92) : 1
  return { grip: baseGrip * kerbFactor, brake: brakeFor(weather), aquaplaning }
}

const puddlesStanding = (weather: WeatherState): boolean => weather.kind === 'storm' || (weather.kind === 'drying' && weather.dryness < PUDDLES_DRY_AT)

const gripFor = (weather: WeatherState, lineWeight: number): number => {
  if (weather.kind === 'storm') return STORM_GRIP
  if (weather.kind !== 'drying') return 1
  const onLine = STORM_GRIP + (1 - STORM_GRIP) * weather.dryness
  const offLine = DRYING_OFF_LINE_GRIP + .08 * weather.dryness
  return offLine + (onLine - offLine) * lineWeight
}

const brakeFor = (weather: WeatherState): number => {
  if (weather.kind === 'storm') return STORM_BRAKE
  if (weather.kind === 'drying') return STORM_BRAKE + (1 - STORM_BRAKE) * weather.dryness
  return 1
}
