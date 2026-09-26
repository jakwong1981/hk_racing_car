import type { VehicleId } from '../types/game'
import { engineSoundFrameFor, tunnelMixFor } from './audioModel'

const ENGINE_SAMPLE_URL = '/audio/small-car-engine2.mp3'
const REVERB_SECONDS = 2.4
const REVERB_DECAY = 3.2

export class VehicleAudioEngine {
  private context: AudioContext | undefined
  private audio: HTMLAudioElement | undefined
  private masterGain: GainNode | undefined
  private sampleGain: GainNode | undefined
  private dryGain: GainNode | undefined
  private wetGain: GainNode | undefined
  private playbackPending = false
  private muted = false

  constructor(private readonly vehicle: VehicleId) {
    this.initialize()
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    this.updateMasterGain()
  }

  update(speedKmh: number, accelerating: boolean, active: boolean): void {
    if (!this.context || !this.audio || !this.sampleGain) return
    if (this.context.state === 'suspended') void this.context.resume()
    this.startPlayback()

    const frame = engineSoundFrameFor(this.vehicle, speedKmh, accelerating, active)
    this.audio.playbackRate += (frame.playbackRate - this.audio.playbackRate) * .12
    this.sampleGain.gain.setTargetAtTime(frame.gain, this.context.currentTime, .09)
  }

  /** 0 in the open, 1 deep inside a tunnel; the mix swells into reverb on entry and opens up quickly on exit. */
  setTunnelBlend(blend: number): void {
    if (!this.context || !this.dryGain || !this.wetGain) return
    const mix = tunnelMixFor(blend)
    this.dryGain.gain.setTargetAtTime(mix.dry, this.context.currentTime, .12)
    this.wetGain.gain.setTargetAtTime(mix.wet, this.context.currentTime, mix.wet > this.wetGain.gain.value ? .25 : .08)
  }

  destroy(): void {
    this.audio?.pause()
    void this.context?.close()
    this.audio = undefined
    this.context = undefined
  }

  private initialize(): void {
    try {
      const context = new AudioContext({ latencyHint: 'interactive' })
      const audio = new Audio(ENGINE_SAMPLE_URL)
      const source = context.createMediaElementSource(audio)
      const lowPassFilter = context.createBiquadFilter()
      const sampleGain = context.createGain()
      const dryGain = context.createGain()
      const wetGain = context.createGain()
      const reverb = context.createConvolver()
      const masterGain = context.createGain()

      audio.loop = true
      audio.preload = 'auto'
      audio.preservesPitch = false
      lowPassFilter.type = 'lowpass'
      lowPassFilter.frequency.value = 1900
      sampleGain.gain.value = 0
      masterGain.gain.value = 0
      wetGain.gain.value = 0
      reverb.buffer = createImpulseResponse(context)
      source.connect(lowPassFilter).connect(sampleGain)
      sampleGain.connect(dryGain).connect(masterGain)
      sampleGain.connect(reverb).connect(wetGain).connect(masterGain)
      masterGain.connect(context.destination)

      this.context = context
      this.audio = audio
      this.masterGain = masterGain
      this.sampleGain = sampleGain
      this.dryGain = dryGain
      this.wetGain = wetGain
      this.updateMasterGain()
      if (context.state === 'suspended') void context.resume()
      this.startPlayback()
    } catch {
      this.context = undefined
    }
  }

  private startPlayback(): void {
    if (!this.audio?.paused || this.playbackPending) return
    this.playbackPending = true
    void this.audio.play().catch(() => undefined).finally(() => { this.playbackPending = false })
  }

  private updateMasterGain(): void {
    if (!this.context || !this.masterGain) return
    this.masterGain.gain.setTargetAtTime(this.muted ? 0 : .68, this.context.currentTime, .04)
  }
}

/** Exponentially decaying stereo noise approximates a concrete tunnel without shipping an impulse-response file. */
const createImpulseResponse = (context: AudioContext): AudioBuffer => {
  const length = Math.floor(context.sampleRate * REVERB_SECONDS)
  const buffer = context.createBuffer(2, length, context.sampleRate)
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel)
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / length, REVERB_DECAY)
  }
  return buffer
}
