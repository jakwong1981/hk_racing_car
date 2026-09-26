import type { TrackPoint } from './track/trackPath'

export type PropState = 'standing' | 'flying' | 'resting'
/** `restY` is the height of the prop's centre when it stands or lies on the road. */
export interface PropBody { position: TrackPoint; velocity: TrackPoint; rotation: TrackPoint; angularVelocity: TrackPoint; restY: number; state: PropState }

export const PROP_GRAVITY = 18
const HIT_RADIUS = .85 + .45
const HIT_HEIGHT = 2.5
const MIN_HIT_SPEED = 3
const LAUNCH_SCALE = 1.15
const OUTWARD_PUSH = 2
const LAUNCH_LIFT = 4
const BOUNCE = .3
const GROUND_FRICTION = .6
const BOUNCE_MIN_SPEED = 1.5
const MAX_SPIN = 9

export const standingProp = (position: TrackPoint): PropBody => ({
  position: { ...position },
  velocity: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  angularVelocity: { x: 0, y: 0, z: 0 },
  restY: position.y,
  state: 'standing',
})

/** Debris is visual only: the car's own velocity is read, never changed, so knocking props costs no momentum. */
export const knockProp = (prop: PropBody, carPosition: TrackPoint, carVelocity: TrackPoint, random: () => number): PropBody => {
  if (prop.state !== 'standing') return prop
  const dx = prop.position.x - carPosition.x
  const dz = prop.position.z - carPosition.z
  const distance = Math.hypot(dx, dz)
  const speed = Math.hypot(carVelocity.x, carVelocity.z)
  if (distance > HIT_RADIUS || Math.abs(prop.position.y - carPosition.y) > HIT_HEIGHT || speed < MIN_HIT_SPEED) return prop
  const outwardX = distance > 1e-3 ? dx / distance : 0
  const outwardZ = distance > 1e-3 ? dz / distance : 0
  const spin = (): number => (random() * 2 - 1) * MAX_SPIN
  return {
    ...prop,
    state: 'flying',
    velocity: { x: carVelocity.x * LAUNCH_SCALE + outwardX * OUTWARD_PUSH, y: LAUNCH_LIFT + random() * 2, z: carVelocity.z * LAUNCH_SCALE + outwardZ * OUTWARD_PUSH },
    angularVelocity: { x: spin(), y: spin(), z: spin() },
  }
}

export const stepProp = (prop: PropBody, dt: number): PropBody => {
  if (prop.state !== 'flying') return prop
  const velocity = { ...prop.velocity, y: prop.velocity.y - PROP_GRAVITY * dt }
  const position = { x: prop.position.x + velocity.x * dt, y: prop.position.y + velocity.y * dt, z: prop.position.z + velocity.z * dt }
  const rotation = { x: prop.rotation.x + prop.angularVelocity.x * dt, y: prop.rotation.y + prop.angularVelocity.y * dt, z: prop.rotation.z + prop.angularVelocity.z * dt }
  if (position.y > prop.restY) return { ...prop, position, velocity, rotation }
  if (Math.abs(velocity.y) > BOUNCE_MIN_SPEED) {
    return {
      ...prop,
      position: { ...position, y: prop.restY },
      velocity: { x: velocity.x * GROUND_FRICTION, y: -velocity.y * BOUNCE, z: velocity.z * GROUND_FRICTION },
      rotation,
      angularVelocity: { x: prop.angularVelocity.x * GROUND_FRICTION, y: prop.angularVelocity.y * GROUND_FRICTION, z: prop.angularVelocity.z * GROUND_FRICTION },
    }
  }
  return { ...prop, state: 'resting', position: { ...position, y: prop.restY }, velocity: { x: 0, y: 0, z: 0 }, rotation: { x: Math.PI / 2, y: rotation.y, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } }
}
