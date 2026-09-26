import { BRAKE_DECELERATION, MAX_LATERAL_ACCEL } from '../vehicle/handlingModel'
import type { TrackPath } from './trackPath'

const LINE_SMOOTHING_METRES = 30
const APEX_GAIN = 220
const CORNER_SMOOTHING_METRES = 6
const MIN_TURN_RATE = 1e-4
/** Planned braking leaves headroom below the physical limit so AI drivers arrive at apexes composed. */
const PLANNED_BRAKE_FRACTION = .75
const MAX_PROFILE_SPEED = 90

/** Signed heading change per metre (+ left, - right), sampled once per metre along the path. */
const turnRates = (path: TrackPath): Float64Array => {
  const count = Math.max(2, Math.ceil(path.length))
  const rates = new Float64Array(count)
  for (let index = 0; index < count; index += 1) {
    const before = path.sampleAt(index - 1).yaw
    const after = path.sampleAt(index + 1).yaw
    rates[index] = Math.atan2(Math.sin(after - before), Math.cos(after - before)) / 2
  }
  return rates
}

const smooth = (values: Float64Array, radius: number, closed: boolean): Float64Array => {
  const count = values.length
  const result = new Float64Array(count)
  for (let index = 0; index < count; index += 1) {
    let total = 0
    let weights = 0
    for (let offset = -radius; offset <= radius; offset += 1) {
      const raw = index + offset
      const sampleIndex = closed ? ((raw % count) + count) % count : Math.min(count - 1, Math.max(0, raw))
      const weight = radius + 1 - Math.abs(offset)
      total += (values[sampleIndex] ?? 0) * weight
      weights += weight
    }
    result[index] = total / weights
  }
  return result
}

const interpolate = (values: Float64Array, path: TrackPath, s: number): number => {
  const position = path.normalizeS(s)
  const lower = Math.min(values.length - 1, Math.floor(position))
  const upper = path.closed ? (lower + 1) % values.length : Math.min(values.length - 1, lower + 1)
  const fraction = position - Math.floor(position)
  return (values[lower] ?? 0) + ((values[upper] ?? 0) - (values[lower] ?? 0)) * fraction
}

/** Hugs the inside of each bend in proportion to its sharpness; stays central on straights. */
export class RacingLine {
  private constructor(private readonly path: TrackPath, private readonly laterals: Float64Array) {}

  static fromPath(path: TrackPath, maxLateral: number): RacingLine {
    const smoothed = smooth(turnRates(path), LINE_SMOOTHING_METRES, path.closed)
    const laterals = smoothed.map(rate => Math.max(-maxLateral, Math.min(maxLateral, -APEX_GAIN * rate)))
    return new RacingLine(path, laterals)
  }

  lateralAt(s: number): number {
    return interpolate(this.laterals, this.path, s)
  }
}

/** Highest speed (m/s at grip 1) from which each metre can still be driven, including braking for bends ahead. */
export class SpeedProfile {
  private constructor(private readonly path: TrackPath, private readonly speeds: Float64Array) {}

  static fromPath(path: TrackPath): SpeedProfile {
    const rates = smooth(turnRates(path), CORNER_SMOOTHING_METRES, path.closed)
    const speeds = rates.map(rate => Math.min(MAX_PROFILE_SPEED, Math.sqrt(MAX_LATERAL_ACCEL / Math.max(Math.abs(rate), MIN_TURN_RATE))))
    const deceleration = BRAKE_DECELERATION * PLANNED_BRAKE_FRACTION
    const passes = path.closed ? 2 : 1
    for (let pass = 0; pass < passes; pass += 1) {
      for (let index = speeds.length - 1; index >= 0; index -= 1) {
        const nextIndex = index + 1 < speeds.length ? index + 1 : path.closed ? 0 : index
        const reachable = Math.sqrt((speeds[nextIndex] ?? 0) ** 2 + 2 * deceleration)
        speeds[index] = Math.min(speeds[index] ?? 0, reachable)
      }
    }
    return new SpeedProfile(path, speeds)
  }

  /** Grip scales cornering speed by its square root, since lateral acceleration is v²/r. */
  speedAt(s: number, grip: number): number {
    return interpolate(this.speeds, this.path, s) * Math.sqrt(Math.max(.05, grip))
  }
}
