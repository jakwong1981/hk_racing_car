import type { VehicleId } from '../types/game'

export interface EngineSoundFrame {
  playbackRate: number
  gain: number
}

const BASE_PLAYBACK_RATE: Record<VehicleId, number> = {
  taxi: .86,
  minibus: .78,
  doubleDecker: .7,
  tram: .92,
}

export interface TunnelMix { dry: number; wet: number }

/** Inside a tunnel the engine is amplified as well as reverberated, then snaps back to a clean open-air mix on exit. */
export const tunnelMixFor = (blend: number): TunnelMix => {
  const amount = Math.max(0, Math.min(1, blend))
  return { dry: 1 + .3 * amount, wet: .85 * amount }
}

export const engineSoundFrameFor = (vehicle: VehicleId, speedKmh: number, accelerating: boolean, active: boolean): EngineSoundFrame => {
  const speedRatio = Math.min(1, Math.max(0, speedKmh) / 180)
  const throttle = accelerating ? 1 : 0

  return {
    playbackRate: BASE_PLAYBACK_RATE[vehicle] + .58 * speedRatio + .14 * throttle,
    gain: active ? .16 + .2 * speedRatio + .14 * throttle : 0,
  }
}
