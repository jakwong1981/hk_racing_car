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

export const engineSoundFrameFor = (vehicle: VehicleId, speedKmh: number, accelerating: boolean, active: boolean): EngineSoundFrame => {
  const speedRatio = Math.min(1, Math.max(0, speedKmh) / 180)
  const throttle = accelerating ? 1 : 0

  return {
    playbackRate: BASE_PLAYBACK_RATE[vehicle] + .58 * speedRatio + .14 * throttle,
    gain: active ? .16 + .2 * speedRatio + .14 * throttle : 0,
  }
}
