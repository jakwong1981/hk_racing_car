import type { TrackDefinition } from '../../types/game'
import { landmarkPosition } from './trackFeatures'
import { TrackPath, type TrackPoint } from './trackPath'

export interface ExportedPoint { x: number; y: number; z: number }
export interface ExportedCheckpoint extends ExportedPoint { index: number; s: number }
export interface ExportedCorner extends ExportedPoint { turn: number; name: string; s: number }
export interface ExportedLandmark extends ExportedPoint { id: string; name: string; kind: string; s: number }
/** World-space coordinates for the operations dashboard map: metres, y up, the car drives toward -z at s = 0. */
export interface TrackExport {
  id: string
  name: string
  lengthMetres: number
  laps: number
  finishLine: ExportedPoint
  checkpoints: ExportedCheckpoint[]
  corners: ExportedCorner[]
  landmarks: ExportedLandmark[]
  centreline: ExportedPoint[]
}

const CENTRELINE_SPACING = 10

const rounded = (point: TrackPoint): ExportedPoint => ({ x: round(point.x), y: round(point.y), z: round(point.z) })
/** Adding zero folds -0 into 0, which JSON cannot represent. */
const round = (value: number): number => Math.round(value * 100) / 100 + 0

export const exportTrack = (track: TrackDefinition): TrackExport => {
  const path = TrackPath.fromControlPoints(track.controlPoints, track.closed)
  const centreline: ExportedPoint[] = []
  for (let s = 0; s < path.length; s += CENTRELINE_SPACING) centreline.push(rounded(path.pointAt(s)))
  return {
    id: track.id,
    name: `${track.chineseName} ${track.englishName}`,
    lengthMetres: round(path.length),
    laps: track.laps,
    finishLine: rounded(path.pointAt(track.finishS)),
    checkpoints: track.checkpointS.map((s, index) => ({ index: index + 1, s, ...rounded(path.pointAt(s)) })),
    corners: track.corners.map(corner => ({ turn: corner.turn, name: corner.name, s: corner.s, ...rounded(path.pointAt(corner.s)) })),
    landmarks: track.landmarks.map(landmark => ({ id: landmark.id, name: landmark.name, kind: landmark.kind, s: landmark.s, ...rounded(landmarkPosition(path, landmark)) })),
    centreline,
  }
}
