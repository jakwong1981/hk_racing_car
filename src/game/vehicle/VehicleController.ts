import RAPIER from '@dimforge/rapier3d-compat'
import type { ControlState, DifficultySpec, VehicleSpec } from '../../types/game'
import { hoverForceFor } from '../physicsModel'
import { turboImpulseFor, driftStageFor } from '../raceLogic'
import { forwardForYaw, rightForYaw, type TrackPoint } from '../track/trackPath'
import type { SurfaceCondition } from '../weatherModel'
import { advanceSpin, brakeForceFor, IDLE_SPIN, LATERAL_GRIP_RATE, limitYawRate, loadedGripFactor, REVERSE_ACCELERATION, spinYawRate, suspensionUnloading, yawRateCap, type SpinState } from './handlingModel'

export const GRAVITY = 18
const HOVER_RAY_LENGTH = 2.2
const MIN_DRIFT_SPEED = 4
const DRIFT_GRIP = .18
const SEAMLESS_GRIP = .05
const SPINNING_GRIP = .25
const DRIFT_STEER_MULTIPLIER = 1.42
const AQUAPLANE_STEER_MULTIPLIER = .3
const DRIFT_HOP_IMPULSE = 2.5
/** Releasing a drift leaves the tail out briefly; that slide must not be mistaken for a spin. */
const DRIFT_RELEASE_GRACE_MS = 600
const MAX_REVERSE_SPEED = 8

export interface VehiclePose { position: TrackPoint; yaw: number }
export interface DriveConditions { surface: SurfaceCondition; seamless: boolean }
export interface DriveResult { signedSpeed: number; driftMs: number; spinning: boolean; grip: number }

export class VehicleController {
  readonly body: RAPIER.RigidBody
  private readonly collider: RAPIER.Collider
  private currentYaw: number
  private driftMs = 0
  private driftWasActive = false
  private driftGraceMs = 0
  private spin: SpinState = IDLE_SPIN

  constructor(private readonly world: RAPIER.World, private readonly vehicle: VehicleSpec, private readonly difficulty: DifficultySpec, spawn: VehiclePose) {
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.position.x, spawn.position.y, spawn.position.z).setLinearDamping(.25).setAngularDamping(5).lockRotations().setCcdEnabled(true))
    this.collider = world.createCollider(RAPIER.ColliderDesc.ball(.85).setDensity(vehicle.mass).setFriction(.55).setRestitution(.42), this.body)
    this.currentYaw = spawn.yaw
  }

  get yaw(): number {
    return this.currentYaw
  }

  get position(): TrackPoint {
    return this.body.translation()
  }

  get velocity(): TrackPoint {
    return this.body.linvel()
  }

  applyDriveForces(dt: number, controls: ControlState, conditions: DriveConditions): DriveResult {
    this.body.resetForces(true)
    const { surface, seamless } = conditions
    const velocity = this.body.linvel()
    const forward = forwardForYaw(this.currentYaw)
    const signedSpeed = velocity.x * forward.x + velocity.z * forward.z
    const mass = this.body.mass()
    const spinning = this.spin.remainingMs > 0
    const turn = spinning ? 0 : Number(controls.left) - Number(controls.right)
    const drifting = !spinning && controls.drift && turn !== 0 && Math.abs(signedSpeed) > MIN_DRIFT_SPEED

    const unloading = this.applyHover(velocity.y)
    const tyreGrip = this.vehicle.grip * surface.grip * loadedGripFactor(unloading)
    this.applyLongitudinal(controls, spinning, signedSpeed, forward, mass, surface)

    const requestedYawRate = turn * this.vehicle.steering * (drifting ? DRIFT_STEER_MULTIPLIER : 1) * (surface.aquaplaning ? AQUAPLANE_STEER_MULTIPLIER : 1) * Math.min(Math.abs(signedSpeed) / 5, 1) * (signedSpeed >= 0 ? 1 : -1)
    // The drift hop itself extends the suspension, so drifts are capped on unloaded grip to stay responsive.
    const cap = yawRateCap(signedSpeed, drifting ? this.vehicle.grip * surface.grip : tyreGrip, drifting)
    this.driftGraceMs = Math.max(0, this.driftGraceMs - dt * 1000)
    this.spin = advanceSpin(this.spin, { dt, requestedYawRate, yawRateCap: cap, grip: tyreGrip, speed: signedSpeed, exempt: drifting || seamless || this.driftGraceMs > 0 })
    const nowSpinning = this.spin.remainingMs > 0
    this.currentYaw += (nowSpinning ? spinYawRate(this.spin) : limitYawRate(requestedYawRate, cap)) * dt

    const lateral = rightForYaw(this.currentYaw)
    const lateralSpeed = velocity.x * lateral.x + velocity.z * lateral.z
    const lateralGrip = nowSpinning ? SPINNING_GRIP * surface.grip : seamless ? SEAMLESS_GRIP : drifting ? DRIFT_GRIP * surface.grip : tyreGrip
    const lateralForce = lateralSpeed * lateralGrip * LATERAL_GRIP_RATE * mass
    this.body.addForce({ x: -lateral.x * lateralForce, y: 0, z: -lateral.z * lateralForce }, true)

    this.updateDrift(dt, drifting, forward)
    return { signedSpeed, driftMs: this.driftMs, spinning: nowSpinning, grip: tyreGrip }
  }

  placeAt(pose: VehiclePose): void {
    this.body.setTranslation(pose.position, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.currentYaw = pose.yaw
    this.spin = IDLE_SPIN
    this.driftMs = 0
    this.driftWasActive = false
  }

  private applyLongitudinal(controls: ControlState, spinning: boolean, signedSpeed: number, forward: TrackPoint, mass: number, surface: SurfaceCondition): void {
    const maxSpeed = this.vehicle.speed * this.difficulty.speedMultiplier / 3.6
    if (controls.accelerate && !spinning && signedSpeed < maxSpeed) {
      const thrust = this.vehicle.acceleration * this.vehicle.mass
      this.body.addForce({ x: forward.x * thrust, y: 0, z: forward.z * thrust }, true)
    }
    if (!controls.brake) return
    const force = signedSpeed > .5 ? brakeForceFor(mass, surface.brake) : signedSpeed > -MAX_REVERSE_SPEED ? mass * REVERSE_ACCELERATION : 0
    this.body.addForce({ x: -forward.x * force, y: 0, z: -forward.z * force }, true)
  }

  private applyHover(verticalSpeed: number): number {
    const ray = new RAPIER.Ray(this.body.translation(), { x: 0, y: -1, z: 0 })
    const hit = this.world.castRay(ray, HOVER_RAY_LENGTH, true, undefined, undefined, this.collider, this.body)
    if (hit) this.body.addForce({ x: 0, y: hoverForceFor(this.body.mass(), GRAVITY, hit.timeOfImpact, verticalSpeed), z: 0 }, true)
    return suspensionUnloading(hit?.timeOfImpact)
  }

  private updateDrift(dt: number, drifting: boolean, forward: TrackPoint): void {
    if (drifting) {
      this.driftMs += dt * 1000
      if (!this.driftWasActive) this.body.applyImpulse({ x: 0, y: DRIFT_HOP_IMPULSE, z: 0 }, true)
    } else if (this.driftWasActive) {
      const impulse = turboImpulseFor(driftStageFor(this.driftMs))
      this.body.applyImpulse({ x: forward.x * impulse, y: 0, z: forward.z * impulse }, true)
      this.driftMs = 0
      this.driftGraceMs = DRIFT_RELEASE_GRACE_MS
    }
    this.driftWasActive = drifting
  }
}
