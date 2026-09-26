import { describe, expect, it } from 'vitest'
import type { CourseLayout, RaceProgress } from './raceProgress'
import { gapSeconds, raceDistance, rankCars } from './standings'

const course: CourseLayout = { length: 1600, closed: true, startS: 1590, finishS: 0, checkpointS: [400, 800, 1200], recoveryLateral: 14 }
const progress = (lap: number, nextCheckpoint: number): RaceProgress => ({ lap, nextCheckpoint, lastS: 0, resetS: 0 })

describe('standings', () => {
  it('counts grid positions behind the line as negative distance on the opening lap', () => {
    expect(raceDistance(course, progress(1, 0), 1576)).toBe(-24)
    expect(raceDistance(course, progress(1, 0), 30)).toBe(30)
    expect(raceDistance(course, progress(2, 1), 500)).toBe(2100)
  })

  it('ranks by laps and distance, with finishers ordered by time ahead of everyone', () => {
    const order = rankCars(course, [
      { id: 'slow', progress: progress(2, 0), s: 100, finishTimeMs: undefined },
      { id: 'fast', progress: progress(2, 2), s: 900, finishTimeMs: undefined },
      { id: 'grid', progress: progress(1, 0), s: 1583, finishTimeMs: undefined },
      { id: 'winner', progress: progress(3, 0), s: 20, finishTimeMs: 90000 },
      { id: 'second', progress: progress(3, 0), s: 60, finishTimeMs: 91500 },
    ])
    expect(order).toEqual(['winner', 'second', 'fast', 'slow', 'grid'])
  })

  it('measures gaps at the latest gate both cars have crossed', () => {
    const player = new Map([[1, 10000], [2, 20000], [3, 30000]])
    const behind = new Map([[1, 10400], [2, 21200]])
    const ahead = new Map([[1, 9800], [2, 19500], [3, 29100], [4, 38000]])
    expect(gapSeconds(player, behind)).toBeCloseTo(1.2)
    expect(gapSeconds(player, ahead)).toBeCloseTo(-.9)
    expect(gapSeconds(player, new Map())).toBeUndefined()
  })
})
