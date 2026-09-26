import { HOVER_HEIGHT } from '../physicsModel'

/** Peak cornering acceleration at grip 1; lower grip or higher speed caps how quickly the heading may change (understeer). */
export const MAX_LATERAL_ACCEL = 40
export const BRAKE_DECELERATION = 15
export const REVERSE_ACCELERATION = 6
/** Fraction of sideways velocity removed per second at grip 1. */
export const LATERAL_GRIP_RATE = 7
export const SPIN_DURATION_MS = 900

const DRIFT_YAW_CAP_MULTIPLIER = 1.6
const UNLOAD_TRAVEL = .35
const UNLOADED_GRIP_LOSS = .65
const SPIN_GRIP_THRESHOLD = .35
const SPIN_OVERDRIVE = 2.2
const SPIN_TRIGGER_MS = 250
const SPIN_MIN_SPEED = 15
const SPIN_YAW_RATE = 6.5

export interface SpinState { overdriveMs: number; remainingMs: number; direction: -1 | 1 }
export interface SpinInput { dt: number; requestedYawRate: number; yawRateCap: number; grip: number; speed: number; exempt: boolean }

export const IDLE_SPIN: SpinState = { overdriveMs: 0, remainingMs: 0, direction: 1 }

export const yawRateCap = (speed: number, grip: number, drifting: boolean): number => {
  const absoluteSpeed = Math.abs(speed)
  if (absoluteSpeed < 1) return Number.POSITIVE_INFINITY
  return MAX_LATERAL_ACCEL * grip * (drifting ? DRIFT_YAW_CAP_MULTIPLIER : 1) / absoluteSpeed
}

export const limitYawRate = (requested: number, cap: number): number => Math.max(-cap, Math.min(cap, requested))

/** 0 when the hover spring sits at rest height, 1 when it is fully extended or the ray finds no ground (crest or airborne). */
export const suspensionUnloading = (rayDistance: number | undefined): number => {
  if (rayDistance === undefined) return 1
  return Math.max(0, Math.min(1, (rayDistance - HOVER_HEIGHT) / UNLOAD_TRAVEL))
}

export const loadedGripFactor = (unloading: number): number => 1 - UNLOADED_GRIP_LOSS * unloading

export const brakeForceFor = (mass: number, brakeMultiplier: number): number => mass * BRAKE_DECELERATION * brakeMultiplier

export const brakingDistance = (fromSpeed: number, toSpeed: number, deceleration: number): number => {
  if (fromSpeed <= toSpeed) return 0
  return (fromSpeed ** 2 - toSpeed ** 2) / (2 * deceleration)
}

/** Sustained over-steering on very low grip (crest, puddle, wet kerb) snaps the vehicle into a timed spin. */
export const advanceSpin = (state: SpinState, input: SpinInput): SpinState => {
  const elapsedMs = input.dt * 1000
  if (state.remainingMs > 0) return { ...state, remainingMs: Math.max(0, state.remainingMs - elapsedMs) }
  const overloaded = !input.exempt
    && Math.abs(input.speed) > SPIN_MIN_SPEED
    && input.grip < SPIN_GRIP_THRESHOLD
    && Math.abs(input.requestedYawRate) > input.yawRateCap * SPIN_OVERDRIVE
  const overdriveMs = overloaded ? state.overdriveMs + elapsedMs : 0
  if (overdriveMs < SPIN_TRIGGER_MS) return { ...state, overdriveMs }
  return { overdriveMs: 0, remainingMs: SPIN_DURATION_MS, direction: input.requestedYawRate >= 0 ? 1 : -1 }
}

export const spinYawRate = (state: SpinState): number => state.direction * SPIN_YAW_RATE
