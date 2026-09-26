import { describe, expect, it } from 'vitest'
import { DIFFICULTIES, opponentsFor, VEHICLES } from '../config/gameConfig'
import { HONG_KONG_ROUTE } from '../config/tracks/hongKongRoute'
import { NEON_RIFT } from '../config/tracks/neonRift'
import type { ControlState, RaceTelemetry, TrackDefinition } from '../types/game'
import { FIXED_STEP, RaceSimulation, type StepOutcome } from './RaceSimulation'
import { TRACK_THEMES } from './themes/trackThemes'
import { yawForDirection } from './track/trackPath'

const LOOK_AHEAD_METRES = 14
const CORNER_SCAN_METRES = 45

interface LapReport { lapSeconds: number | undefined; recoveries: number; finished: boolean; checkpointsSeen: number }

const createTelemetry = (): RaceTelemetry => ({ phase: 'racing', speedKmh: 0, lap: 1, totalLaps: 1, checkpoint: 0, totalCheckpoints: 0, raceTimeMs: 0, position: 1, driftStage: 0, driftCharge: 0, seamlessRemainingMs: 0, headlightsOn: true, weather: 'clear', surfaceGripPercent: 100, aquaplaning: false, spinning: false, standings: [] })

const driveOneLap = async (track: TrackDefinition, maxSeconds: number): Promise<LapReport> => {
  const controls: ControlState = { accelerate: false, brake: false, left: false, right: false, drift: false, headlights: true }
  const telemetry = createTelemetry()
  let finished = false
  const simulation = await RaceSimulation.create({ vehicle: VEHICLES[0]!, difficulty: DIFFICULTIES[2]!, track: { ...track, laps: 1 }, theme: TRACK_THEMES[track.theme], controls, telemetry, opponents: [], onFinish: () => { finished = true } })
  let recoveries = 0
  let checkpointsSeen = 0
  let lapSeconds: number | undefined
  let lastS = track.startS

  for (let step = 0; step < maxSeconds / FIXED_STEP && !finished; step += 1) {
    const position = simulation.position
    const s = simulation.path.project(position, lastS).s
    lastS = s
    const target = simulation.path.pointAt(s + LOOK_AHEAD_METRES)
    const yawError = yawForDirection(target.x - position.x, target.z - position.z) - simulation.yaw
    const headingError = Math.atan2(Math.sin(yawError), Math.cos(yawError))
    controls.left = headingError > .03
    controls.right = headingError < -.03

    let sharpestTurn = 0
    for (let ahead = 5; ahead <= CORNER_SCAN_METRES; ahead += 5) {
      const from = simulation.path.sampleAt(s + ahead - 5).yaw
      const to = simulation.path.sampleAt(s + ahead).yaw
      sharpestTurn = Math.max(sharpestTurn, Math.abs(Math.atan2(Math.sin(to - from), Math.cos(to - from))) / 5)
    }
    const targetSpeed = Math.max(14, Math.min(60, .45 / Math.max(sharpestTurn, .001)))
    const speed = telemetry.speedKmh / 3.6
    controls.accelerate = speed < targetSpeed
    controls.brake = speed > targetSpeed + 4

    const outcome: StepOutcome = simulation.step()
    if (outcome.event === 'recovered') recoveries += 1
    checkpointsSeen = Math.max(checkpointsSeen, telemetry.checkpoint)
    if (finished) lapSeconds = (step + 1) * FIXED_STEP
  }

  return { lapSeconds, recoveries, finished, checkpointsSeen }
}

interface FieldReport { finished: boolean; standings: RaceTelemetry['standings']; rivalTeleports: number; weatherSeen: Set<string> }

/** Runs the scripted player plus the full rival field until the player finishes; rivals drive themselves. */
const raceField = async (track: TrackDefinition, maxSeconds: number): Promise<FieldReport> => {
  const controls: ControlState = { accelerate: false, brake: false, left: false, right: false, drift: false, headlights: true }
  const telemetry = createTelemetry()
  let finished = false
  const simulation = await RaceSimulation.create({ vehicle: VEHICLES[0]!, difficulty: DIFFICULTIES[2]!, track, theme: TRACK_THEMES[track.theme], controls, telemetry, opponents: opponentsFor(VEHICLES[0]!.id), onFinish: () => { finished = true } })
  const weatherSeen = new Set<string>()
  let lastS = simulation.playerS
  for (let step = 0; step < maxSeconds / FIXED_STEP && !finished; step += 1) {
    const position = simulation.position
    lastS = simulation.path.project(position, lastS).s
    const target = simulation.path.pointAt(lastS + LOOK_AHEAD_METRES)
    const headingError = Math.atan2(Math.sin(yawForDirection(target.x - position.x, target.z - position.z) - simulation.yaw), Math.cos(yawForDirection(target.x - position.x, target.z - position.z) - simulation.yaw))
    controls.left = headingError > .03
    controls.right = headingError < -.03
    controls.accelerate = telemetry.speedKmh / 3.6 < 22
    controls.brake = telemetry.speedKmh / 3.6 > 26
    simulation.step()
    weatherSeen.add(telemetry.weather)
  }
  const rivalTeleports = simulation.carViews.filter(view => !view.isPlayer).reduce((total, view) => total + view.teleports, 0)
  return { finished, standings: telemetry.standings, rivalTeleports, weatherSeen }
}

describe('race simulation with rivals', () => {
  it('fields three AI rivals that lap Neon Rift cleanly and publish consistent standings', async () => {
    const report = await raceField({ ...NEON_RIFT, laps: 1 }, 200)

    expect(report.finished).toBe(true)
    expect(report.rivalTeleports).toBe(0)
    expect(report.standings.map(standing => standing.position)).toEqual([1, 2, 3, 4])
    expect(report.standings.filter(standing => standing.finished).length).toBeGreaterThanOrEqual(2)
  }, 60000)

  it('keeps rivals on the road through a full storm lap', async () => {
    const storm: TrackDefinition = { ...NEON_RIFT, laps: 1, weather: [{ fromLap: 1, fromS: 0, kind: 'storm' }] }
    const report = await raceField(storm, 240)

    expect(report.finished).toBe(true)
    expect(report.weatherSeen).toEqual(new Set(['storm']))
    expect(report.rivalTeleports).toBeLessThanOrEqual(1)
  }, 60000)
})

describe('race simulation', () => {
  it('lets a scripted driver complete a Neon Rift lap through the tunnel chicane and viaduct without recovery', async () => {
    const report = await driveOneLap(NEON_RIFT, 180)
    console.info(`Neon Rift scripted lap: ${report.lapSeconds?.toFixed(1)} s`)

    expect(report.recoveries).toBe(0)
    expect(report.finished).toBe(true)
    expect(report.checkpointsSeen).toBe(NEON_RIFT.checkpointS.length)
    expect(report.lapSeconds).toBeGreaterThan(25)
    expect(report.lapSeconds).toBeLessThan(150)
  }, 60000)

  it('keeps the Mong Kok sprint finishable after the spline port', async () => {
    const report = await driveOneLap(HONG_KONG_ROUTE, 60)
    console.info(`Mong Kok scripted lap: ${report.lapSeconds?.toFixed(1)} s`)

    expect(report.recoveries).toBe(0)
    expect(report.finished).toBe(true)
    expect(report.lapSeconds).toBeGreaterThan(5)
  }, 30000)
})
