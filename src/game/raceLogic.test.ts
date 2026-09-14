import { describe, expect, it } from 'vitest'
import { driftChargeFor, driftStageFor, formatRaceTime, rankLeaderboard, turboImpulseFor } from './raceLogic'

describe('race logic', () => {
  it('charges drift through all stages', () => { expect(driftStageFor(0)).toBe(0); expect(driftStageFor(650)).toBe(1); expect(driftStageFor(1500)).toBe(2); expect(driftStageFor(2400)).toBe(3) })
  it('caps charge and scales impulse', () => { expect(driftChargeFor(5000)).toBe(100); expect(turboImpulseFor(3)).toBeGreaterThan(turboImpulseFor(2)) })
  it('formats timing and ranks lower times first', () => { expect(formatRaceTime(65430)).toBe('1:05.43'); expect(rankLeaderboard([{id:'a',name:'A',vehicle:'taxi',timeMs:20},{id:'b',name:'B',vehicle:'tram',timeMs:10}])[0]?.id).toBe('b') })
})
