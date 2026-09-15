export const TRACK_FLOOR_Y = 0
export const HOVER_HEIGHT = 1.05
const HOVER_SPRING_STIFFNESS = 72
const HOVER_DAMPING = 2 * Math.sqrt(HOVER_SPRING_STIFFNESS)

export const hoverForceFor = (mass: number, gravity: number, distance: number, verticalSpeed: number): number => {
  const weightCompensation = mass * Math.abs(gravity)
  const springForce = (HOVER_HEIGHT - distance) * mass * HOVER_SPRING_STIFFNESS
  const dampingForce = verticalSpeed * mass * HOVER_DAMPING
  return weightCompensation + springForce - dampingForce
}

export const shouldRecoverKart = (x: number, y: number, z: number): boolean => y < -3 || Math.abs(x - trackCenterX(z)) > 22 || z > 25 || z < -325

export const smoothVisualHeight = (current: number, target: number, deltaSeconds: number): number => {
  const difference = target - current
  if (Math.abs(difference) < .002) return current
  return current + difference * (1 - Math.exp(-20 * deltaSeconds))
}

export const trackCenterX = (z: number): number => Math.sin((z - 8) / 46) * 4.2 + Math.sin((z - 8) / 103) * 1.8

export const trackHeadingAt = (z: number): number => {
  const delta = .5
  return Math.atan2(trackCenterX(z + delta) - trackCenterX(z - delta), delta * 2)
}

export interface TrackPoint { x: number; z: number; heading: number }

export const trackPointAt = (z: number, lateral = 0): TrackPoint => {
  const heading = trackHeadingAt(z)
  return { x: trackCenterX(z) + lateral * Math.cos(heading), z: z + lateral * Math.sin(heading), heading }
}

export const hasCrossedTrackLine = (x: number, z: number, lineZ: number): boolean => {
  const line = trackPointAt(lineZ)
  const forwardX = -Math.sin(line.heading)
  const forwardZ = -Math.cos(line.heading)
  return (x - line.x) * forwardX + (z - line.z) * forwardZ > 0
}

export interface DriveSample { speed: number; z: number; y: number }

export const simulateStraightDrive = (seconds: number, acceleration: number, maximumSpeed: number): DriveSample => {
  const step = 1 / 60
  let speed = 0
  let z = 8
  let y = HOVER_HEIGHT
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    speed = Math.min(maximumSpeed, speed + acceleration * step)
    z -= speed * step
    y += (HOVER_HEIGHT - y) * .25
  }
  return { speed, z, y }
}
