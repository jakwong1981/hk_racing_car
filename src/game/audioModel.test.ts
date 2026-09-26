import { describe, expect, it } from 'vitest'
import { engineSoundFrameFor, tunnelMixFor } from './audioModel'

describe('vehicle audio model', () => {
  it('raises sample playback rate and volume with speed and throttle', () => {
    const idle = engineSoundFrameFor('taxi', 0, false, true)
    const driving = engineSoundFrameFor('taxi', 120, true, true)

    expect(driving.playbackRate).toBeGreaterThan(idle.playbackRate)
    expect(driving.gain).toBeGreaterThan(idle.gain)
  })

  it('uses lower base playback rates for heavier vehicles', () => {
    const taxi = engineSoundFrameFor('taxi', 60, true, true)
    const doubleDecker = engineSoundFrameFor('doubleDecker', 60, true, true)

    expect(doubleDecker.playbackRate).toBeLessThan(taxi.playbackRate)
  })

  it('silences the sample outside active racing', () => {
    expect(engineSoundFrameFor('minibus', 80, true, false).gain).toBe(0)
  })

  it('amplifies and reverberates the engine inside tunnels and returns to a dry mix outside', () => {
    expect(tunnelMixFor(0)).toEqual({ dry: 1, wet: 0 })
    const inside = tunnelMixFor(1)
    expect(inside.dry).toBeGreaterThan(1)
    expect(inside.wet).toBeGreaterThan(.5)
    expect(tunnelMixFor(3)).toEqual(inside)
  })
})
