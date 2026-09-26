import { describe, expect, it } from 'vitest'
import { advanceRaceProgress, createRaceProgress, hasCrossedForward, isOutsideTrackVolume, recoverToReset, type CourseLayout, type RaceProgress } from './raceProgress'

const loop: CourseLayout = { length: 1000, closed: true, startS: 990, finishS: 0, checkpointS: [250, 500, 750], recoveryLateral: 14 }
const sprint: CourseLayout = { length: 350, closed: false, startS: 17, finishS: 317, checkpointS: [100, 200], recoveryLateral: 22 }

const drive = (course: CourseLayout, progress: RaceProgress, metres: number): RaceProgress => {
  let current = progress
  let s = current.lastS
  for (let travelled = 0; travelled < metres; travelled += 1) {
    s = course.closed ? (s + 1) % course.length : s + 1
    current = advanceRaceProgress(course, current, s).progress
  }
  return current
}

const driveTo = (course: CourseLayout, progress: RaceProgress, targetS: number): RaceProgress =>
  drive(course, progress, ((targetS - progress.lastS) % course.length + course.length) % course.length)

describe('gate crossing', () => {
  it('detects forward crossings across the closed-loop seam', () => {
    expect(hasCrossedForward(loop, 998, 2, 0)).toBe(true)
    expect(hasCrossedForward(loop, 2, 998, 0)).toBe(false)
  })

  it('ignores reverse travel and teleport-sized jumps', () => {
    expect(hasCrossedForward(loop, 260, 240, 250)).toBe(false)
    expect(hasCrossedForward(loop, 100, 400, 250)).toBe(false)
  })

  it('does not count starting exactly on a gate', () => {
    expect(hasCrossedForward(loop, 250, 251, 250)).toBe(false)
  })
})

describe('race progress', () => {
  it('starts on lap one at the grid without counting the first finish-line pass', () => {
    const progress = driveTo(loop, createRaceProgress(loop), 10)

    expect(progress.lap).toBe(1)
    expect(progress.nextCheckpoint).toBe(0)
  })

  it('counts a lap only after every checkpoint is passed in order', () => {
    const progress = driveTo(loop, createRaceProgress(loop), 5)
    const completed = drive(loop, progress, loop.length)

    expect(completed.lap).toBe(2)
    expect(completed.nextCheckpoint).toBe(0)
  })

  it('rejects a shortcut that skips a checkpoint', () => {
    const atFirstGate = driveTo(loop, createRaceProgress(loop), 260)
    const afterShortcut = advanceRaceProgress(loop, atFirstGate, 900).progress
    const acrossFinish = driveTo(loop, afterShortcut, 5)

    expect(acrossFinish.lap).toBe(1)
    expect(acrossFinish.nextCheckpoint).toBe(1)
  })

  it('moves the reset point to the last checkpoint and back to the finish after a closed lap', () => {
    const atSecondGate = driveTo(loop, createRaceProgress(loop), 510)
    expect(atSecondGate.resetS).toBe(500)

    const lapped = driveTo(loop, atSecondGate, 5)
    expect(lapped.resetS).toBe(0)
    expect(recoverToReset(atSecondGate).lastS).toBe(500)
  })

  it('returns open sprints to the start grid after each lap', () => {
    const update = advanceRaceProgress(sprint, { lap: 1, nextCheckpoint: 2, lastS: 316.5, resetS: 200 }, 317.5)

    expect(update.event).toBe('lap')
    expect(update.progress).toEqual({ lap: 2, nextCheckpoint: 0, lastS: 17, resetS: 17 })
  })
})

describe('track volume', () => {
  it('recovers vehicles that drop below, leave the side of, or run off the end of the course', () => {
    expect(isOutsideTrackVolume(loop, { s: 400, lateral: 3, vertical: -3.1 })).toBe(true)
    expect(isOutsideTrackVolume(loop, { s: 400, lateral: 14.5, vertical: 1 })).toBe(true)
    expect(isOutsideTrackVolume(sprint, { s: 350, lateral: 0, vertical: 1 })).toBe(true)
    expect(isOutsideTrackVolume(loop, { s: 0, lateral: 0, vertical: 1 })).toBe(false)
    expect(isOutsideTrackVolume(sprint, { s: 180, lateral: 21, vertical: 1 })).toBe(false)
  })
})
