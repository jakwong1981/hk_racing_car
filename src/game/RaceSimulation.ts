import RAPIER from '@dimforge/rapier3d-compat'
import { vehicleSpecFor } from '../config/gameConfig'
import type { ControlState, DifficultySpec, OpponentSpec, RaceStanding, RaceTelemetry, TrackDefinition, VehicleId, VehicleSpec } from '../types/game'
import { aiControlsFor, headingErrorTo, lookAheadMetres, rubberBandFactor } from './ai/aiDriver'
import { driftChargeFor, driftStageFor } from './raceLogic'
import { advanceRaceProgress, courseLayoutFor, createRaceProgress, isOutsideTrackVolume, recoverToReset, type CourseLayout, type ProgressEvent, type RaceProgress } from './raceProgress'
import { finishGateIndex, gapSeconds, gateKey, raceDistance, rankCars } from './standings'
import type { TrackThemeBuilder } from './themes/trackTheme'
import { RacingLine, SpeedProfile } from './track/racingLine'
import { zoneContains } from './track/trackFeatures'
import { TrackPath, yawForDirection, type TrackPoint, type TrackProjection } from './track/trackPath'
import { GRAVITY, VehicleController, type DriveResult, type VehiclePose } from './vehicle/VehicleController'
import { DRY_SURFACE, surfaceConditionFor, weatherAt, type SurfaceCondition, type WeatherState } from './weatherModel'

export interface SimulationOptions { vehicle: VehicleSpec; difficulty: DifficultySpec; track: TrackDefinition; theme: TrackThemeBuilder; controls: ControlState; telemetry: RaceTelemetry; opponents: readonly OpponentSpec[]; onFinish: () => void }
/** `teleported` tells renderers to skip interpolation because the player was placed rather than driven. */
export interface StepOutcome { event: ProgressEvent | 'recovered'; teleported: boolean }
/** `teleports` increments whenever the car is placed rather than driven, so renderers can snap instead of interpolating. */
export interface CarView { id: string; vehicle: VehicleId; isPlayer: boolean; position: TrackPoint; velocity: TrackPoint; yaw: number; grade: number; teleports: number }

export const FIXED_STEP = 1 / 60
export const PLAYER_ID = 'player'
const SPAWN_HEIGHT = 1.1
const SEAMLESS_DURATION_MS = 5000
const MAX_DISPLAY_SPEED_KMH = 200
const GRID_SPACING = 7
const GRID_LATERAL = 2.5
const PLAYER_GRID_SLOT = 2
const RACING_LINE_EDGE_MARGIN = 2.2
const STUCK_SPEED = 1.5
const STUCK_RECOVERY_MS = 2500
const STANDINGS_INTERVAL_STEPS = 6
const TARGET_SPEED_PREVIEW = 6

interface RaceCar {
  id: string
  name: string
  spec: VehicleSpec
  isPlayer: boolean
  skill: number
  laneOffset: number
  controller: VehicleController
  controls: ControlState
  progress: RaceProgress
  projection: TrackProjection
  gridS: number
  gridLateral: number
  gateTimes: Map<number, number>
  finishTimeMs: number | undefined
  surface: SurfaceCondition
  drive: DriveResult
  stuckMs: number
  teleports: number
}

export class RaceSimulation {
  readonly path: TrackPath
  private readonly course: CourseLayout
  private readonly racingLine: RacingLine
  private readonly speedProfile: SpeedProfile
  private readonly cars: RaceCar[]
  private readonly player: RaceCar
  private weather: WeatherState
  private elapsedMs = 0
  private stepCount = 0
  private finishReported = false

  private constructor(private readonly world: RAPIER.World, private readonly options: SimulationOptions) {
    const { track } = options
    this.path = TrackPath.fromControlPoints(track.controlPoints, track.closed)
    this.course = courseLayoutFor(track, this.path.length)
    this.racingLine = RacingLine.fromPath(this.path, track.roadWidth / 2 - RACING_LINE_EDGE_MARGIN)
    this.speedProfile = SpeedProfile.fromPath(this.path)
    world.timestep = FIXED_STEP
    options.theme.buildColliders(world, this.path, track)
    this.cars = this.buildGrid()
    const player = this.cars.find(car => car.isPlayer)
    if (!player) throw new Error('The starting grid must contain the player')
    this.player = player
    this.weather = weatherAt(track.weather, 0, this.lapLength, track.laps)
    this.resetTelemetry()
  }

  static async create(options: SimulationOptions): Promise<RaceSimulation> {
    await RAPIER.init()
    return new RaceSimulation(new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 }), options)
  }

  get position(): TrackPoint {
    return this.player.controller.position
  }

  get yaw(): number {
    return this.player.controller.yaw
  }

  get trackGrade(): number {
    return this.path.sampleAt(this.player.projection.s).grade
  }

  get playerS(): number {
    return this.player.projection.s
  }

  get playerSpeed(): number {
    return this.player.drive.signedSpeed
  }

  get playerSurface(): SurfaceCondition {
    return this.player.surface
  }

  get weatherState(): WeatherState {
    return this.weather
  }

  get carViews(): CarView[] {
    return this.cars.map(car => ({
      id: car.id,
      vehicle: car.spec.id,
      isPlayer: car.isPlayer,
      position: car.controller.position,
      velocity: car.controller.velocity,
      yaw: car.controller.yaw,
      grade: this.path.sampleAt(car.projection.s).grade,
      teleports: car.teleports,
    }))
  }

  step(): StepOutcome {
    const { telemetry, controls } = this.options
    this.elapsedMs += FIXED_STEP * 1000
    this.stepCount += 1
    this.weather = weatherAt(this.options.track.weather, Math.max(0, this.leaderDistance()), this.lapLength, this.options.track.laps)

    for (const car of this.cars) {
      car.surface = this.surfaceFor(car)
      if (!car.isPlayer) this.driveRival(car)
      const seamless = car.isPlayer && telemetry.seamlessRemainingMs > 0
      car.drive = car.controller.applyDriveForces(FIXED_STEP, car.isPlayer ? controls : car.controls, { surface: car.surface, seamless })
    }
    telemetry.driftStage = driftStageFor(this.player.drive.driftMs)
    telemetry.driftCharge = driftChargeFor(this.player.drive.driftMs)
    telemetry.seamlessRemainingMs = Math.max(0, telemetry.seamlessRemainingMs - FIXED_STEP * 1000)
    this.world.step()

    let outcome: StepOutcome = { event: 'none', teleported: false }
    for (const car of this.cars) {
      const carOutcome = this.advanceCar(car)
      if (car.isPlayer) outcome = carOutcome
    }
    this.publishTelemetry()
    return outcome
  }

  private get lapLength(): number {
    return this.course.closed ? this.path.length : this.course.finishS - this.course.startS
  }

  private buildGrid(): RaceCar[] {
    const { vehicle, difficulty, opponents } = this.options
    const entrants = opponents.map(opponent => ({ id: opponent.id, name: opponent.name, spec: vehicleSpecFor(opponent.vehicle), isPlayer: false, skill: opponent.skill, laneOffset: opponent.laneOffset }))
    entrants.splice(Math.min(PLAYER_GRID_SLOT, entrants.length), 0, { id: PLAYER_ID, name: 'YOU 你', spec: vehicle, isPlayer: true, skill: 1, laneOffset: 0 })
    return entrants.map((entrant, slot) => {
      const gridS = this.course.closed ? this.course.startS - slot * GRID_SPACING : this.course.startS + (entrants.length - 1 - slot) * GRID_SPACING
      const gridLateral = entrants.length > 1 ? (slot % 2 === 0 ? -GRID_LATERAL : GRID_LATERAL) : 0
      const pose = this.poseAt(gridS, gridLateral)
      return {
        ...entrant,
        controller: new VehicleController(this.world, entrant.spec, difficulty, pose),
        controls: { accelerate: false, brake: false, left: false, right: false, drift: false, headlights: true },
        progress: { ...createRaceProgress(this.course), lastS: gridS, resetS: gridS },
        projection: { s: gridS, lateral: gridLateral, vertical: SPAWN_HEIGHT },
        gridS,
        gridLateral,
        gateTimes: new Map<number, number>(),
        finishTimeMs: undefined,
        surface: DRY_SURFACE,
        drive: { signedSpeed: 0, driftMs: 0, spinning: false, grip: entrant.spec.grip },
        stuckMs: 0,
        teleports: 0,
      }
    })
  }

  private surfaceFor(car: RaceCar): SurfaceCondition {
    const { s, lateral } = car.projection
    const { track } = this.options
    return surfaceConditionFor({
      weather: this.weather,
      lateral,
      racingLineLateral: this.racingLine.lateralAt(s),
      inPuddle: track.puddles.some(zone => zoneContains(this.path, zone, s, lateral)),
      onKerb: track.kerbs.some(zone => zoneContains(this.path, zone, s, lateral)),
      speed: car.drive.signedSpeed,
    })
  }

  private driveRival(car: RaceCar): void {
    const { s } = car.projection
    const speed = car.drive.signedSpeed
    const aimS = s + lookAheadMetres(speed)
    const edge = this.options.track.roadWidth / 2 - RACING_LINE_EDGE_MARGIN
    const aimLateral = Math.max(-edge, Math.min(edge, this.racingLine.lateralAt(aimS) + car.laneOffset))
    const aim = this.path.pointAt(aimS, aimLateral)
    const position = car.controller.position
    const headingError = headingErrorTo(car.controller.yaw, yawForDirection(aim.x - position.x, aim.z - position.z))
    const grip = car.spec.grip * car.surface.grip
    const cornerSpeed = Math.min(this.speedProfile.speedAt(s, grip), this.speedProfile.speedAt(s + TARGET_SPEED_PREVIEW, grip))
    const topSpeed = car.spec.speed * this.options.difficulty.speedMultiplier / 3.6
    const behindPlayer = this.distanceOf(this.player) - this.distanceOf(car)
    const pace = car.skill * this.options.difficulty.opponentPace * rubberBandFactor(behindPlayer)
    Object.assign(car.controls, aiControlsFor({ headingError, speed, targetSpeed: Math.min(cornerSpeed, topSpeed) * pace }))
  }

  private advanceCar(car: RaceCar): StepOutcome {
    const projection = this.path.project(car.controller.position, car.progress.lastS)
    if (isOutsideTrackVolume(this.course, projection) || this.isStuck(car)) {
      this.recover(car)
      return { event: 'recovered', teleported: true }
    }
    car.projection = projection
    if (car.isPlayer && this.isOnBoostPad(car.controller.position)) this.options.telemetry.seamlessRemainingMs = SEAMLESS_DURATION_MS
    const update = advanceRaceProgress(this.course, car.progress, projection.s)
    car.progress = update.progress
    if (update.event === 'checkpoint') car.gateTimes.set(gateKey(this.course, car.progress.lap, car.progress.nextCheckpoint - 1), this.elapsedMs)
    if (update.event !== 'lap') return { event: update.event, teleported: false }

    car.gateTimes.set(gateKey(this.course, car.progress.lap - 1, finishGateIndex(this.course)), this.elapsedMs)
    const teleported = !this.course.closed
    if (teleported) this.place(car, car.gridS, car.gridLateral)
    if (car.progress.lap > this.options.track.laps && car.finishTimeMs === undefined) car.finishTimeMs = this.elapsedMs
    return { event: 'lap', teleported }
  }

  /** Only rivals are rescued automatically; a stationary player is a choice, not a fault. */
  private isStuck(car: RaceCar): boolean {
    if (car.isPlayer) return false
    car.stuckMs = Math.abs(car.drive.signedSpeed) < STUCK_SPEED ? car.stuckMs + FIXED_STEP * 1000 : 0
    return car.stuckMs > STUCK_RECOVERY_MS
  }

  private recover(car: RaceCar): void {
    car.progress = recoverToReset(car.progress)
    car.stuckMs = 0
    this.place(car, car.progress.resetS, 0)
  }

  private place(car: RaceCar, s: number, lateral: number): void {
    car.controller.placeAt(this.poseAt(s, lateral))
    car.projection = { s, lateral, vertical: SPAWN_HEIGHT }
    car.teleports += 1
  }

  private publishTelemetry(): void {
    const { telemetry } = this.options
    const player = this.player
    telemetry.speedKmh = Math.min(MAX_DISPLAY_SPEED_KMH, Math.abs(player.drive.signedSpeed) * 3.6)
    telemetry.checkpoint = player.progress.nextCheckpoint
    telemetry.lap = player.progress.lap
    telemetry.weather = this.weather.kind
    telemetry.surfaceGripPercent = Math.round(player.surface.grip * 100)
    telemetry.aquaplaning = player.surface.aquaplaning
    telemetry.spinning = player.drive.spinning
    const playerFinished = player.finishTimeMs !== undefined
    if (playerFinished || this.stepCount % STANDINGS_INTERVAL_STEPS === 0) this.publishStandings()
    if (playerFinished && !this.finishReported) {
      this.finishReported = true
      this.options.onFinish()
    }
  }

  private publishStandings(): void {
    const { telemetry, track } = this.options
    const order = rankCars(this.course, this.cars.map(car => ({ id: car.id, progress: car.progress, s: car.projection.s, finishTimeMs: car.finishTimeMs })))
    const standings: RaceStanding[] = order.map((id, index) => {
      const car = this.cars.find(candidate => candidate.id === id)
      if (!car) throw new Error(`Ranked car ${id} is not on the grid`)
      return {
        id,
        name: car.name,
        vehicle: car.spec.id,
        isPlayer: car.isPlayer,
        position: index + 1,
        lap: Math.min(car.progress.lap, track.laps),
        gapSeconds: car.isPlayer ? undefined : gapSeconds(this.player.gateTimes, car.gateTimes),
        finished: car.finishTimeMs !== undefined,
      }
    })
    telemetry.standings = standings
    telemetry.position = standings.find(standing => standing.isPlayer)?.position ?? telemetry.position
  }

  private distanceOf(car: RaceCar): number {
    return raceDistance(this.course, car.progress, car.projection.s)
  }

  private leaderDistance(): number {
    return Math.max(...this.cars.map(car => this.distanceOf(car)))
  }

  private resetTelemetry(): void {
    const { telemetry, track } = this.options
    telemetry.lap = this.player.progress.lap
    telemetry.totalLaps = track.laps
    telemetry.checkpoint = 0
    telemetry.totalCheckpoints = track.checkpointS.length
    telemetry.weather = this.weather.kind
    telemetry.surfaceGripPercent = 100
    telemetry.aquaplaning = false
    telemetry.spinning = false
    this.publishStandings()
  }

  private poseAt(s: number, lateral: number): VehiclePose {
    return { position: this.path.pointAt(s, lateral, SPAWN_HEIGHT), yaw: this.path.sampleAt(s).yaw }
  }

  private isOnBoostPad(position: TrackPoint): boolean {
    return this.options.track.boostPads.some(pad => {
      const center = this.path.pointAt(pad.s, pad.lateral)
      return Math.hypot(position.x - center.x, position.z - center.z) < pad.radius
    })
  }
}
