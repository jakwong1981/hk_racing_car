import { describe, expect, it } from 'vitest'
import { engineSoundFrameFor } from './audioModel'

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
})
