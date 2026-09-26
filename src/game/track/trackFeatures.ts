import type { SurfaceZone, TrackLandmark, TrackRange } from '../../types/game'
import { brakingDistance } from '../vehicle/handlingModel'
import { forwardForYaw, type TrackPath, type TrackPoint } from './trackPath'

export const zoneContains = (path: TrackPath, zone: SurfaceZone, s: number, lateral: number): boolean => {
  const position = path.normalizeS(s)
  return position >= zone.fromS && position <= zone.toS && lateral >= zone.fromLateral && lateral <= zone.toLateral
}

export const withinRange = (path: TrackPath, range: TrackRange, s: number): boolean => {
  const position = path.normalizeS(s)
  return position >= range.fromS && position <= range.toS
}

export const landmarkPosition = (path: TrackPath, landmark: TrackLandmark): TrackPoint => {
  const base = path.pointAt(landmark.s, landmark.lateral, landmark.height)
  if (!landmark.ahead) return base
  const forward = forwardForYaw(path.sampleAt(landmark.s).yaw)
  return { x: base.x + forward.x * landmark.ahead, y: base.y, z: base.z + forward.z * landmark.ahead }
}

export interface BrakeWarningInput { s: number; speed: number; approach: TrackRange; cornerSpeed: number; deceleration: number }

/** Lights once the remaining distance to the corner entry is no more than the distance needed to shed speed. */
export const brakeWarningActive = (input: BrakeWarningInput): boolean => {
  if (input.s < input.approach.fromS || input.s > input.approach.toS) return false
  const remaining = input.approach.toS - input.s
  return remaining <= brakingDistance(input.speed, input.cornerSpeed, input.deceleration)
}

export const tunnelBlend = (path: TrackPath, tunnels: readonly TrackRange[], s: number, fadeMetres: number): number => {
  const position = path.normalizeS(s)
  let blend = 0
  for (const tunnel of tunnels) {
    const inside = Math.min(position - tunnel.fromS, tunnel.toS - position)
    blend = Math.max(blend, Math.max(0, Math.min(1, (inside + fadeMetres) / fadeMetres)))
  }
  return blend
}
