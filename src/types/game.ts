export type VehicleId = 'taxi' | 'minibus' | 'doubleDecker' | 'tram'
export type DifficultyId = 'learner' | 'probationary' | 'professional'
export type RacePhase = 'setup' | 'countdown' | 'racing' | 'paused' | 'finished'
export type DriftStage = 0 | 1 | 2 | 3

export interface VehicleSpec { id: VehicleId; englishName: string; chineseName: string; role: string; speed: number; acceleration: number; grip: number; steering: number; mass: number; color: number }
export interface DifficultySpec { id: DifficultyId; englishName: string; chineseName: string; cc: number; speedMultiplier: number; steeringAssist: number; collisionPenalty: number }
export interface ControlState { accelerate: boolean; brake: boolean; left: boolean; right: boolean; drift: boolean }
export interface RaceTelemetry { phase: RacePhase; speedKmh: number; lap: number; totalLaps: number; checkpoint: number; raceTimeMs: number; position: number; driftStage: DriftStage; driftCharge: number; seamlessRemainingMs: number }
export interface LeaderboardEntry { id: string; name: string; vehicle: VehicleId; timeMs: number; isPlayer?: boolean }
