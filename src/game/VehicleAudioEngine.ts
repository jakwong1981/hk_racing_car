import type { VehicleId } from '../types/game'
import { engineSoundFrameFor } from './audioModel'

const ENGINE_SAMPLE_URL = '/audio/small-car-engine2.mp3'

export class VehicleAudioEngine {
  private context: AudioContext | undefined
  private audio: HTMLAudioElement | undefined
  private masterGain: GainNode | undefined
  private sampleGain: GainNode | undefined
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
      const masterGain = context.createGain()

      audio.loop = true
      audio.preload = 'auto'
      audio.preservesPitch = false
      lowPassFilter.type = 'lowpass'
      lowPassFilter.frequency.value = 1900
      sampleGain.gain.value = 0
      masterGain.gain.value = 0
      source.connect(lowPassFilter).connect(sampleGain).connect(masterGain).connect(context.destination)

      this.context = context
      this.audio = audio
      this.masterGain = masterGain
      this.sampleGain = sampleGain
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
