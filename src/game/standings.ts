import type { CourseLayout, RaceProgress } from './raceProgress'

export interface CarStandingInput { id: string; progress: RaceProgress; s: number; finishTimeMs: number | undefined }
/** Gate times are keyed by `gateKey`, recorded in simulation milliseconds each time a car crosses a checkpoint or the line. */
export type GateTimes = ReadonlyMap<number, number>

export const gateKey = (course: CourseLayout, lap: number, gateIndex: number): number => (lap - 1) * (course.checkpointS.length + 1) + gateIndex

export const finishGateIndex = (course: CourseLayout): number => course.checkpointS.length

/** Metres driven since the start line; cars still behind the line on the opening lap report negative distance. */
export const raceDistance = (course: CourseLayout, progress: RaceProgress, s: number): number => {
  if (!course.closed) return (progress.lap - 1) * (course.finishS - course.startS) + (s - course.startS)
  let sinceLine = positiveModulo(s - course.finishS, course.length)
  if (progress.nextCheckpoint === 0 && sinceLine > course.length / 2) sinceLine -= course.length
  return (progress.lap - 1) * course.length + sinceLine
}

/** Finished cars rank by finishing time; everyone else by distance covered. */
export const rankCars = (course: CourseLayout, cars: readonly CarStandingInput[]): string[] => [...cars]
  .sort((a, b) => {
    if (a.finishTimeMs !== undefined && b.finishTimeMs !== undefined) return a.finishTimeMs - b.finishTimeMs
    if (a.finishTimeMs !== undefined) return -1
    if (b.finishTimeMs !== undefined) return 1
    return raceDistance(course, b.progress, b.s) - raceDistance(course, a.progress, a.s)
  })
  .map(car => car.id)

/** Seconds the other car trails the reference car at their latest shared gate; negative when it is ahead. */
export const gapSeconds = (reference: GateTimes, other: GateTimes): number | undefined => {
  let latest: number | undefined
  for (const key of other.keys()) if (reference.has(key) && (latest === undefined || key > latest)) latest = key
  if (latest === undefined) return undefined
  return ((other.get(latest) ?? 0) - (reference.get(latest) ?? 0)) / 1000
}

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus
