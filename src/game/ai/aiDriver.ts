const STEER_DEADBAND = .03
const BRAKE_MARGIN = 1.5
const LOOK_AHEAD_BASE = 9
const LOOK_AHEAD_PER_SPEED = .45
const RUBBER_BAND_METRES = 400
const RUBBER_BAND_LIMIT = .06
const MIN_TARGET_SPEED = 8

export interface AiSituation { headingError: number; speed: number; targetSpeed: number }
export interface AiControls { accelerate: boolean; brake: boolean; left: boolean; right: boolean }

export const lookAheadMetres = (speed: number): number => LOOK_AHEAD_BASE + Math.max(0, speed) * LOOK_AHEAD_PER_SPEED

/** Steers toward the aim point with binary inputs, exactly as a keyboard player would. */
export const aiControlsFor = (situation: AiSituation): AiControls => {
  const target = Math.max(MIN_TARGET_SPEED, situation.targetSpeed)
  return {
    left: situation.headingError > STEER_DEADBAND,
    right: situation.headingError < -STEER_DEADBAND,
    accelerate: situation.speed < target,
    brake: situation.speed > target + BRAKE_MARGIN,
  }
}

/** `metresBehindPlayer` > 0 means the rival trails the player and may push up to 6% harder; leaders ease off symmetrically. */
export const rubberBandFactor = (metresBehindPlayer: number): number => 1 + Math.max(-RUBBER_BAND_LIMIT, Math.min(RUBBER_BAND_LIMIT, metresBehindPlayer / RUBBER_BAND_METRES * RUBBER_BAND_LIMIT))

export const headingErrorTo = (fromYaw: number, toYaw: number): number => {
  const difference = toYaw - fromYaw
  return Math.atan2(Math.sin(difference), Math.cos(difference))
}
