import type RAPIER from '@dimforge/rapier3d-compat'
import type * as THREE from 'three'
import type { TrackDefinition } from '../../types/game'
import type { TrackPath } from '../track/trackPath'
import type { WeatherState } from '../weatherModel'

export interface TrackBuildContext { scene: THREE.Scene; path: TrackPath; track: TrackDefinition; maxAnisotropy: number }
export interface SceneryFrame { timeSeconds: number; playerS: number; playerSpeed: number; brakeMultiplier: number; weather: WeatherState }
export interface SceneryAnimator { update(frame: SceneryFrame): void }
export interface BloomSettings { strength: number; radius: number; threshold: number }
export interface AtmosphereSettings { fogColor: number; clearFogDensity: number; stormFogDensity: number; bloom?: BloomSettings }

export const STATIC_SCENERY: SceneryAnimator = { update: () => undefined }

export interface TrackThemeBuilder {
  atmosphere: AtmosphereSettings
  buildScenery(context: TrackBuildContext): Promise<SceneryAnimator>
  buildColliders(world: RAPIER.World, path: TrackPath, track: TrackDefinition): void
}
