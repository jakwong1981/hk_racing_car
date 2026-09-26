export type VehicleId = 'taxi' | 'minibus' | 'doubleDecker' | 'tram'
export type DifficultyId = 'learner' | 'probationary' | 'professional'
export type TrackId = 'hongKongRoute' | 'neonRift'
export type TrackTheme = 'hongKong' | 'neonRift'
export type RacePhase = 'setup' | 'countdown' | 'racing' | 'paused' | 'finished'
export type DriftStage = 0 | 1 | 2 | 3
export type WeatherKind = 'clear' | 'damp' | 'storm' | 'drying'
export type QualityLevel = 'high' | 'low'

export interface VehicleSpec { id: VehicleId; englishName: string; chineseName: string; role: string; speed: number; acceleration: number; grip: number; steering: number; mass: number; color: number }
export interface DifficultySpec { id: DifficultyId; englishName: string; chineseName: string; cc: number; speedMultiplier: number; steeringAssist: number; collisionPenalty: number; opponentPace: number }
export interface OpponentSpec { id: string; name: string; vehicle: VehicleId; skill: number; laneOffset: number }
export interface ControlState { accelerate: boolean; brake: boolean; left: boolean; right: boolean; drift: boolean; headlights: boolean }
export interface RaceStanding { id: string; name: string; vehicle: VehicleId; isPlayer: boolean; position: number; lap: number; gapSeconds: number | undefined; finished: boolean }
export interface RaceTelemetry {
  phase: RacePhase
  speedKmh: number
  lap: number
  totalLaps: number
  checkpoint: number
  totalCheckpoints: number
  raceTimeMs: number
  position: number
  driftStage: DriftStage
  driftCharge: number
  seamlessRemainingMs: number
  headlightsOn: boolean
  weather: WeatherKind
  surfaceGripPercent: number
  aquaplaning: boolean
  spinning: boolean
  standings: RaceStanding[]
}
export interface LeaderboardEntry { id: string; name: string; vehicle: VehicleId; timeMs: number; isPlayer?: boolean }

export interface TrackControlPoint { x: number; y: number; z: number }
export interface TrackRange { fromS: number; toS: number }
export interface BoostPad { s: number; lateral: number; radius: number }
export interface SurfaceZone extends TrackRange { fromLateral: number; toLateral: number }
/** A weather stage starts once the leader reaches `fromLap` at distance `fromS`, and lasts until the next stage. */
export interface WeatherStage { fromLap: number; fromS: number; kind: WeatherKind }
export interface CornerMarker { turn: number; name: string; s: number }
export type LandmarkKind = 'brakeBoard' | 'warningLamps' | 'referencePillar'
/** `ahead` projects the landmark along the heading at `s`, for objects that sit beyond a corner rather than beside it. */
export interface TrackLandmark { id: string; name: string; kind: LandmarkKind; s: number; lateral: number; height: number; ahead?: number; activeRange?: TrackRange }
export type PropKind = 'barrel' | 'sign'
export interface PropCluster { kind: PropKind; s: number; lateral: number; count: number; spacing: number }

/** Distances (`s`) are metres along the centerline from the first control point; lateral offsets are metres to the right of travel. */
export interface TrackDefinition {
  id: TrackId
  englishName: string
  chineseName: string
  routeLabel: string
  theme: TrackTheme
  closed: boolean
  controlPoints: readonly TrackControlPoint[]
  roadWidth: number
  recoveryLateral: number
  laps: number
  startS: number
  finishS: number
  checkpointS: readonly number[]
  boostPads: readonly BoostPad[]
  tunnels: readonly TrackRange[]
  kerbs: readonly SurfaceZone[]
  puddles: readonly SurfaceZone[]
  weather: readonly WeatherStage[]
  corners: readonly CornerMarker[]
  landmarks: readonly TrackLandmark[]
  props: readonly PropCluster[]
}
