import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { vehicleSpecFor } from '../config/gameConfig'
import type { ControlState, DifficultySpec, OpponentSpec, QualityLevel, RaceTelemetry, TrackDefinition, VehicleSpec } from '../types/game'
import { smoothVisualHeight } from './physicsModel'
import { FIXED_STEP, RaceSimulation, type CarView } from './RaceSimulation'
import { PropField } from './scene/propField'
import { RainEffect } from './scene/rainEffect'
import { STATIC_SCENERY, type SceneryAnimator, type TrackThemeBuilder } from './themes/trackTheme'
import { TRACK_THEMES } from './themes/trackThemes'
import { tunnelBlend } from './track/trackFeatures'
import { forwardForYaw, type TrackPoint } from './track/trackPath'
import { VehicleAudioEngine } from './VehicleAudioEngine'
import { buildVehicleVisual, type VehicleVisual } from './vehicle/vehicleFactory'

interface EngineOptions { canvas: HTMLCanvasElement; vehicle: VehicleSpec; difficulty: DifficultySpec; track: TrackDefinition; opponents: readonly OpponentSpec[]; quality: QualityLevel; controls: ControlState; telemetry: RaceTelemetry; onFinish: () => void }
interface CarRender { visual: VehicleVisual; previous: THREE.Vector3; current: THREE.Vector3; teleports: number; isPlayer: boolean }

const MAX_FRAME_SECONDS = .08
const CAMERA_DISTANCE = 8
const CAMERA_HEIGHT = 5.2
const CAMERA_LOOK_AHEAD = 8
const HEADLIGHT_REACH = 12
const VISUAL_RIDE_OFFSET = .7
const TUNNEL_FADE_METRES = 18
const RAIN_DROPS: Record<QualityLevel, number> = { high: 1400, low: 450 }
const PIXEL_RATIO_LIMIT: Record<QualityLevel, number> = { high: 2, low: 1 }
const BLOOM_PIXEL_RATIO = 1.5

export class GameEngine {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(62, 1, .1, 900)
  private readonly vehicleAudio: VehicleAudioEngine
  private readonly theme: TrackThemeBuilder
  private readonly cars = new Map<string, CarRender>()
  private simulation?: RaceSimulation
  private composer?: EffectComposer
  private rain?: RainEffect
  private props?: PropField
  private scenery: SceneryAnimator = STATIC_SCENERY
  private animationFrame = 0
  private lastTime = performance.now()
  private elapsedSeconds = 0
  private accumulator = 0
  private readonly cameraTarget = new THREE.Vector3()

  constructor(private readonly options: EngineOptions) {
    this.theme = TRACK_THEMES[options.track.theme]
    this.vehicleAudio = new VehicleAudioEngine(options.vehicle.id)
    this.renderer = new THREE.WebGLRenderer({ canvas: options.canvas, antialias: options.quality === 'high' })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, PIXEL_RATIO_LIMIT[options.quality]))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  async start(): Promise<void> {
    const { track, vehicle, difficulty, controls, telemetry, opponents, quality, onFinish } = this.options
    this.simulation = await RaceSimulation.create({ vehicle, difficulty, track, theme: this.theme, controls, telemetry, opponents, onFinish })
    this.scenery = await this.theme.buildScenery({ scene: this.scene, path: this.simulation.path, track, maxAnisotropy: this.renderer.capabilities.getMaxAnisotropy() })
    await this.buildCars(this.simulation.carViews)
    this.rain = new RainEffect(this.scene, RAIN_DROPS[quality])
    this.props = new PropField(this.scene, this.simulation.path, track.props)
    this.composer = this.createComposer()
    this.resize()
    window.addEventListener('resize', this.resize)
    this.lastTime = performance.now()
    this.loop(this.lastTime)
  }

  setMuted(muted: boolean): void {
    this.vehicleAudio.setMuted(muted)
  }

  destroy(): void {
    cancelAnimationFrame(this.animationFrame)
    window.removeEventListener('resize', this.resize)
    this.vehicleAudio.destroy()
    this.composer?.dispose()
    this.renderer.dispose()
  }

  private async buildCars(views: readonly CarView[]): Promise<void> {
    const loadModel = this.options.quality === 'high'
    const visuals = await Promise.all(views.map(view => buildVehicleVisual(view.isPlayer ? this.options.vehicle : vehicleSpecFor(view.vehicle), this.scene, { role: view.isPlayer ? 'player' : 'rival', loadModel: view.isPlayer || loadModel })))
    views.forEach((view, index) => {
      const visual = visuals[index]
      if (!visual) return
      visual.group.rotation.order = 'YXZ'
      this.scene.add(visual.group)
      const position = new THREE.Vector3(view.position.x, view.position.y, view.position.z)
      this.cars.set(view.id, { visual, previous: position.clone(), current: position.clone(), teleports: view.teleports, isPlayer: view.isPlayer })
    })
  }

  private createComposer(): EffectComposer | undefined {
    const bloom = this.theme.atmosphere.bloom
    if (!bloom || this.options.quality !== 'high') return undefined
    const composer = new EffectComposer(this.renderer)
    composer.setPixelRatio(Math.min(devicePixelRatio, BLOOM_PIXEL_RATIO))
    composer.addPass(new RenderPass(this.scene, this.camera))
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), bloom.strength, bloom.radius, bloom.threshold))
    composer.addPass(new OutputPass())
    return composer
  }

  private loop = (time: number): void => {
    const frame = Math.min((time - this.lastTime) / 1000, MAX_FRAME_SECONDS)
    this.lastTime = time
    this.elapsedSeconds += frame
    const { telemetry, controls } = this.options
    const racing = telemetry.phase === 'racing'
    if (racing && this.simulation) this.advanceSimulation(this.simulation, frame)
    this.vehicleAudio.update(telemetry.speedKmh, controls.accelerate, racing)
    this.syncVisuals(frame, racing)
    if (this.composer) this.composer.render(frame)
    else this.renderer.render(this.scene, this.camera)
    this.animationFrame = requestAnimationFrame(this.loop)
  }

  private advanceSimulation(simulation: RaceSimulation, frame: number): void {
    this.accumulator += frame
    while (this.accumulator >= FIXED_STEP) {
      simulation.step()
      for (const view of simulation.carViews) {
        const car = this.cars.get(view.id)
        if (!car) continue
        car.previous.copy(car.current)
        car.current.set(view.position.x, view.position.y, view.position.z)
        if (view.teleports !== car.teleports) {
          car.previous.copy(car.current)
          car.teleports = view.teleports
        }
      }
      this.accumulator -= FIXED_STEP
    }
    this.options.telemetry.raceTimeMs += frame * 1000
  }

  private syncVisuals(frame: number, racing: boolean): void {
    const simulation = this.simulation
    if (!simulation) return
    const alpha = Math.min(1, this.accumulator / FIXED_STEP)
    const views = simulation.carViews
    for (const view of views) {
      const car = this.cars.get(view.id)
      if (!car) continue
      const kart = car.visual.group
      const visualHeight = kart.position.y
      kart.position.lerpVectors(car.previous, car.current, alpha)
      kart.position.y = smoothVisualHeight(visualHeight, kart.position.y - VISUAL_RIDE_OFFSET, frame)
      kart.rotation.y = view.yaw
      kart.rotation.x += (Math.atan(view.grade) - kart.rotation.x) * (1 - Math.exp(-8 * frame))
      if (car.isPlayer) this.followPlayer(car.visual, kart.position, view.yaw, frame)
    }
    const weather = simulation.weatherState
    this.scenery.update({ timeSeconds: this.elapsedSeconds, playerS: simulation.playerS, playerSpeed: simulation.playerSpeed, brakeMultiplier: simulation.playerSurface.brake, weather })
    this.updateAtmosphere(frame, weather.rain)
    if (racing) this.props?.update(frame, views)
    this.vehicleAudio.setTunnelBlend(tunnelBlend(simulation.path, this.options.track.tunnels, simulation.playerS, TUNNEL_FADE_METRES))
  }

  private followPlayer(visual: VehicleVisual, position: THREE.Vector3, yaw: number, frame: number): void {
    const forward = forwardForYaw(yaw)
    this.updateHeadlights(visual, position, forward)
    this.cameraTarget.set(position.x - forward.x * CAMERA_DISTANCE, position.y + CAMERA_HEIGHT, position.z - forward.z * CAMERA_DISTANCE)
    this.camera.position.lerp(this.cameraTarget, 1 - Math.pow(.001, frame))
    this.camera.lookAt(position.x + forward.x * CAMERA_LOOK_AHEAD, position.y + 1.2, position.z + forward.z * CAMERA_LOOK_AHEAD)
  }

  private updateAtmosphere(frame: number, rain: number): void {
    const { clearFogDensity, stormFogDensity } = this.theme.atmosphere
    if (this.scene.fog instanceof THREE.FogExp2) {
      const target = clearFogDensity + (stormFogDensity - clearFogDensity) * rain
      this.scene.fog.density += (target - this.scene.fog.density) * (1 - Math.exp(-1.5 * frame))
    }
    this.rain?.update(frame, rain, this.camera)
  }

  private updateHeadlights(visual: VehicleVisual, position: THREE.Vector3, forward: TrackPoint): void {
    const on = this.options.controls.headlights
    this.options.telemetry.headlightsOn = on
    visual.headlights.forEach(light => { light.visible = on })
    visual.headlightTargets.forEach(target => target.position.set(position.x + forward.x * HEADLIGHT_REACH, position.y + .35, position.z + forward.z * HEADLIGHT_REACH))
  }

  private resize = (): void => {
    const width = innerWidth
    const height = innerHeight
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.composer?.setSize(width, height)
  }
}
