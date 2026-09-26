import type { TrackDefinition } from '../types/game'
import type { TrackProjection } from './track/trackPath'

export interface CourseLayout { length: number; closed: boolean; startS: number; finishS: number; checkpointS: readonly number[]; recoveryLateral: number }
export interface RaceProgress { lap: number; nextCheckpoint: number; lastS: number; resetS: number }
export type ProgressEvent = 'none' | 'checkpoint' | 'lap'
export interface ProgressUpdate { progress: RaceProgress; event: ProgressEvent }

/** Larger single-step movements along the centerline are treated as teleports or shortcuts, never as gate crossings. */
export const MAX_CROSSING_STEP = 25
const RECOVERY_DROP = -3

export const courseLayoutFor = (track: TrackDefinition, length: number): CourseLayout => ({
  length,
  closed: track.closed,
  startS: track.startS,
  finishS: track.finishS,
  checkpointS: track.checkpointS,
  recoveryLateral: track.recoveryLateral,
})

export const createRaceProgress = (course: CourseLayout): RaceProgress => ({ lap: 1, nextCheckpoint: 0, lastS: course.startS, resetS: course.startS })

export const hasCrossedForward = (course: CourseLayout, fromS: number, toS: number, gateS: number): boolean => {
  const travelled = alongTrack(course, fromS, toS)
  if (travelled <= 0 || travelled > MAX_CROSSING_STEP) return false
  const gateOffset = course.closed ? positiveModulo(gateS - fromS, course.length) : gateS - fromS
  return gateOffset > 0 && gateOffset <= travelled
}

export const advanceRaceProgress = (course: CourseLayout, progress: RaceProgress, currentS: number): ProgressUpdate => {
  const fromS = progress.lastS
  const nextGate = course.checkpointS[progress.nextCheckpoint]
  if (nextGate !== undefined && hasCrossedForward(course, fromS, currentS, nextGate)) {
    return { progress: { ...progress, nextCheckpoint: progress.nextCheckpoint + 1, lastS: currentS, resetS: nextGate }, event: 'checkpoint' }
  }
  const allCheckpointsPassed = progress.nextCheckpoint === course.checkpointS.length
  if (allCheckpointsPassed && hasCrossedForward(course, fromS, currentS, course.finishS)) {
    const resetS = course.closed ? course.finishS : course.startS
    return { progress: { lap: progress.lap + 1, nextCheckpoint: 0, lastS: course.closed ? currentS : course.startS, resetS }, event: 'lap' }
  }
  return { progress: { ...progress, lastS: currentS }, event: 'none' }
}

export const recoverToReset = (progress: RaceProgress): RaceProgress => ({ ...progress, lastS: progress.resetS })

export const isOutsideTrackVolume = (course: CourseLayout, projection: TrackProjection): boolean => {
  if (projection.vertical < RECOVERY_DROP) return true
  if (Math.abs(projection.lateral) > course.recoveryLateral) return true
  return !course.closed && (projection.s <= 0 || projection.s >= course.length)
}

const alongTrack = (course: CourseLayout, fromS: number, toS: number): number => {
  if (!course.closed) return toS - fromS
  const wrapped = positiveModulo(toS - fromS, course.length)
  return wrapped > course.length / 2 ? wrapped - course.length : wrapped
}

const positiveModulo = (value: number, modulus: number): number => ((value % modulus) + modulus) % modulus
