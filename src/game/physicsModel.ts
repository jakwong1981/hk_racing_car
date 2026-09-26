export const HOVER_HEIGHT = 1.05
const HOVER_SPRING_STIFFNESS = 72
const HOVER_DAMPING = 2 * Math.sqrt(HOVER_SPRING_STIFFNESS)

export const hoverForceFor = (mass: number, gravity: number, distance: number, verticalSpeed: number): number => {
  const weightCompensation = mass * Math.abs(gravity)
  const springForce = (HOVER_HEIGHT - distance) * mass * HOVER_SPRING_STIFFNESS
  const dampingForce = verticalSpeed * mass * HOVER_DAMPING
  return weightCompensation + springForce - dampingForce
}

export const smoothVisualHeight = (current: number, target: number, deltaSeconds: number): number => {
  const difference = target - current
  if (Math.abs(difference) < .002) return current
  return current + difference * (1 - Math.exp(-20 * deltaSeconds))
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
