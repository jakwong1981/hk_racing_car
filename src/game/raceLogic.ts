import type { DriftStage, LeaderboardEntry } from '../types/game'

export const driftStageFor = (milliseconds: number): DriftStage => milliseconds >= 2400 ? 3 : milliseconds >= 1500 ? 2 : milliseconds >= 650 ? 1 : 0
export const driftChargeFor = (milliseconds: number): number => Math.min(100, Math.round(milliseconds / 24))
export const turboImpulseFor = (stage: DriftStage): number => [0, 4.5, 7.5, 11][stage]
export const formatRaceTime = (milliseconds: number): string => { const minutes = Math.floor(milliseconds / 60000); const seconds = Math.floor(milliseconds % 60000 / 1000); const millis = Math.floor(milliseconds % 1000 / 10); return `${minutes}:${seconds.toString().padStart(2,'0')}.${millis.toString().padStart(2,'0')}` }
export const rankLeaderboard = (entries: readonly LeaderboardEntry[]): LeaderboardEntry[] => [...entries].sort((a,b) => a.timeMs - b.timeMs)
