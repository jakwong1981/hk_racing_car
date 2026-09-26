import type { TrackControlPoint, TrackDefinition } from '../../types/game'

const ROUTE_START_Z = 25
const ROUTE_END_Z = -325
const CONTROL_POINT_SPACING = 10

const legacyCenterX = (z: number): number => Math.sin((z - 8) / 46) * 4.2 + Math.sin((z - 8) / 103) * 1.8

const routeControlPoints = (): TrackControlPoint[] => {
  const points: TrackControlPoint[] = []
  for (let z = ROUTE_START_Z; z >= ROUTE_END_Z; z -= CONTROL_POINT_SPACING) points.push({ x: legacyCenterX(z), y: 0, z })
  return points
}

/** Distance along the route for a legacy z coordinate; the S-curve is shallow enough that dz approximates arc length. */
export const hongKongRouteS = (z: number): number => ROUTE_START_Z - z

export const HONG_KONG_ROUTE: TrackDefinition = {
  id: 'hongKongRoute',
  englishName: 'Mong Kok Sprint',
  chineseName: '旺角夜衝',
  routeLabel: 'MONG KOK → KWAI CHUNG',
  theme: 'hongKong',
  closed: false,
  controlPoints: routeControlPoints(),
  roadWidth: 32,
  recoveryLateral: 22,
  laps: 2,
  startS: hongKongRouteS(8),
  finishS: hongKongRouteS(-292),
  checkpointS: [hongKongRouteS(-76), hongKongRouteS(-152), hongKongRouteS(-228)],
  boostPads: [{ s: hongKongRouteS(-104), lateral: -4, radius: 3.6 }],
  tunnels: [],
  kerbs: [],
  puddles: [],
  weather: [{ fromLap: 1, fromS: 0, kind: 'clear' }],
  corners: [],
  landmarks: [],
  props: [
    { kind: 'barrel', s: 150, lateral: -13.5, count: 5, spacing: 2.2 },
    { kind: 'barrel', s: 262, lateral: 13.5, count: 5, spacing: 2.2 },
  ],
}
