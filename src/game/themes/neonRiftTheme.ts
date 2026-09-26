import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import type { TrackDefinition, TrackRange } from '../../types/game'
import { addStripCollider, ROAD_SURFACE, type SurfaceResponse } from '../physics/trackColliders'
import { addHongKongStreetFurniture, type HongKongStreetLayout } from '../scene/hongKongStreetFurniture'
import { addHoloBrakeWall, addKerbs, addPuddles, addReferencePillars, addWarningLamps, combineAnimators, wetRoadAnimator, type SetPieceContext } from '../scene/neonSetPieces'
import { createFinishLine, createStripMesh } from '../scene/trackMeshes'
import type { TrackPath } from '../track/trackPath'
import type { StripSpec } from '../track/trackStrip'
import type { SceneryAnimator, TrackBuildContext, TrackThemeBuilder } from './trackTheme'

const MAGENTA = 0xff2bd6
const CYAN = 0x2bf5ff
const DEEP_BLUE = 0x1a2cff
const CITY_FLOOR_Y = -14
const WALL_HEIGHT = 1.2
const WALL_COLLIDER_HEIGHT = 3
const TUNNEL_HEIGHT = 8
const PILLAR_SPACING = 20
const ARCH_SPACING = 160
const TOWER_SPACING = 22
const STRIP_STEP = 2
/** Glass barriers absorb more energy than the Hong Kong façades so wall contact costs speed. */
const BARRIER_SURFACE: SurfaceResponse = { friction: .2, restitution: .35 }
const LANE_CENTERS = [-5.33, 0, 5.33]

/** Placed on the approaches to Turn 3 (s≈360), the aqueduct tunnel (705–955) and the viaduct crest (s≈1360), clear of the arches. */
const STREET_LAYOUT: HongKongStreetLayout = {
  roadHalfWidth: 8,
  postLateral: 8.3,
  gantries: [
    { s: 275, destinations: [{ chinese: '中環', english: 'Central', route: '4', arrowDegrees: 90 }, { chinese: '財閥廣場', english: 'Tycoon Plaza', arrowDegrees: 90 }] },
    { s: 640, destinations: [{ chinese: '海底隧道', english: 'Cross Harbour Tunnel', route: '1', arrowDegrees: 0 }, { chinese: '紅磡', english: 'Hung Hom', arrowDegrees: 0 }] },
    { s: 1175, destinations: [{ chinese: '跨港大橋', english: 'Harbour Viaduct', route: '3', arrowDegrees: 0 }, { chinese: '尖沙咀', english: 'Tsim Sha Tsui', arrowDegrees: 45 }] },
  ],
  speedLimits: [
    { s: 300, side: -1, limit: 50 },
    { s: 300, side: 1, limit: 50 },
    { s: 690, side: -1, limit: 70 },
    { s: 1230, side: -1, limit: 80 },
  ],
  markings: [
    { s: 110, kind: 'aheadArrow', laterals: LANE_CENTERS },
    { s: 190, kind: 'aheadArrow', laterals: LANE_CENTERS },
    { s: 325, kind: 'slow', laterals: LANE_CENTERS },
    { s: 470, kind: 'aheadArrow', laterals: LANE_CENTERS },
    { s: 740, kind: 'slow', laterals: LANE_CENTERS },
    { s: 1040, kind: 'aheadArrow', laterals: LANE_CENTERS },
    { s: 1310, kind: 'slow', laterals: LANE_CENTERS },
    { s: 1545, kind: 'aheadArrow', laterals: LANE_CENTERS },
  ],
  zebraCrossings: [40],
  laneLines: { laterals: [-2.67, 2.67], fromS: 5, toS: 1598, skip: [{ fromS: 36, toS: 44 }] },
}

export const neonRiftTheme: TrackThemeBuilder = {
  atmosphere: { fogColor: 0x120a2a, clearFogDensity: .0065, stormFogDensity: .016, bloom: { strength: .7, radius: .4, threshold: .6 } },

  async buildScenery(context: TrackBuildContext): Promise<SceneryAnimator> {
    const { scene, path, track } = context
    scene.background = new THREE.Color(0x05030d)
    scene.fog = new THREE.FogExp2(neonRiftTheme.atmosphere.fogColor, neonRiftTheme.atmosphere.clearFogDensity)
    scene.add(new THREE.HemisphereLight(0x8c7bff, 0x140c24, 1.3))
    const skyGlow = new THREE.DirectionalLight(0x9fd8ff, .8)
    skyGlow.position.set(-40, 60, 30)
    scene.add(skyGlow)

    const halfWidth = track.roadWidth / 2
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x1b1e27, roughness: .32, metalness: .35, side: THREE.DoubleSide })
    const road = createStripMesh(path, fullLap(path, -halfWidth, halfWidth, 0), roadMaterial)
    road.receiveShadow = true
    scene.add(road)
    scene.add(createStripMesh(path, fullLap(path, -halfWidth + .35, -halfWidth + .6, .02), new THREE.MeshBasicMaterial({ color: MAGENTA })))
    scene.add(createStripMesh(path, fullLap(path, halfWidth - .6, halfWidth - .35, .02), new THREE.MeshBasicMaterial({ color: CYAN })))
    scene.add(createFinishLine(path, track.finishS, track.roadWidth, context.maxAnisotropy))
    addHongKongStreetFurniture(scene, path, STREET_LAYOUT)
    addBarrierWalls(scene, path, halfWidth)
    for (const tunnel of track.tunnels) addTunnel(scene, path, halfWidth, tunnel)
    addViaductPillars(scene, path, halfWidth)
    addArches(scene, path, track, halfWidth)
    addCityFloor(scene, path)
    addTowers(scene, path, halfWidth, track.landmarks.filter(landmark => landmark.kind === 'brakeBoard').map(landmark => landmarkPosition(path, landmark)))
    return buildSetPieces({ scene, path, track, cityFloorY: CITY_FLOOR_Y }, roadMaterial)
  },

  buildColliders(world: RAPIER.World, path: TrackPath, track: TrackDefinition): void {
    const halfWidth = track.roadWidth / 2
    addStripCollider(world, path, fullLap(path, -halfWidth - .3, halfWidth + .3, 0), ROAD_SURFACE)
    for (const side of [-1, 1]) {
      const lateral = side * (halfWidth + .3)
      addStripCollider(world, path, { fromS: 0, toS: path.length, step: STRIP_STEP, left: { lateral, height: 0 }, right: { lateral, height: WALL_COLLIDER_HEIGHT } }, BARRIER_SURFACE)
    }
  },
}

const buildSetPieces = (context: SetPieceContext, roadMaterial: THREE.MeshStandardMaterial): SceneryAnimator => {
  const { landmarks } = context.track
  const lamps = landmarks.find(landmark => landmark.kind === 'warningLamps')
  addKerbs(context, lamps?.activeRange)
  const animators: SceneryAnimator[] = [wetRoadAnimator(roadMaterial), addPuddles(context, context.track.puddles)]
  for (const landmark of landmarks) {
    if (landmark.kind === 'brakeBoard') animators.push(addHoloBrakeWall(context, landmark))
    if (landmark.kind === 'warningLamps') animators.push(addWarningLamps(context, landmark))
  }
  const pillars = landmarks.filter(landmark => landmark.kind === 'referencePillar')
  if (pillars.length > 0) animators.push(addReferencePillars(context, pillars))
  return combineAnimators(animators)
}

const fullLap = (path: TrackPath, leftLateral: number, rightLateral: number, height: number): StripSpec => ({
  fromS: 0,
  toS: path.length,
  step: STRIP_STEP,
  left: { lateral: leftLateral, height },
  right: { lateral: rightLateral, height },
})

const verticalStrip = (path: TrackPath, range: TrackRange, lateral: number, bottom: number, top: number): StripSpec => ({
  fromS: range.fromS,
  toS: range.toS,
  step: STRIP_STEP,
  left: { lateral, height: bottom },
  right: { lateral, height: top },
})

const addBarrierWalls = (scene: THREE.Scene, path: TrackPath, halfWidth: number): void => {
  const glass = new THREE.MeshStandardMaterial({ color: 0x2a2d3a, roughness: .15, metalness: .6, transparent: true, opacity: .78, side: THREE.DoubleSide })
  const lap: TrackRange = { fromS: 0, toS: path.length }
  for (const [side, color] of [[-1, MAGENTA], [1, CYAN]] as const) {
    const lateral = side * (halfWidth + .3)
    scene.add(createStripMesh(path, verticalStrip(path, lap, lateral, 0, WALL_HEIGHT), glass))
    scene.add(createStripMesh(path, { ...fullLap(path, lateral - .12, lateral + .12, WALL_HEIGHT) }, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })))
  }
}

const addTunnel = (scene: THREE.Scene, path: TrackPath, halfWidth: number, tunnel: TrackRange): void => {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3a3d4c, roughness: .85, emissive: 0x10121c, side: THREE.DoubleSide })
  const warningLamp = new THREE.MeshBasicMaterial({ color: 0xffb020, side: THREE.DoubleSide })
  const lateral = halfWidth + .3
  for (const side of [-1, 1]) {
    scene.add(createStripMesh(path, verticalStrip(path, tunnel, side * lateral, WALL_HEIGHT, TUNNEL_HEIGHT), concrete))
    scene.add(createStripMesh(path, verticalStrip(path, tunnel, side * (lateral - .05), 2.4, 2.65), warningLamp))
  }
  scene.add(createStripMesh(path, { fromS: tunnel.fromS, toS: tunnel.toS, step: STRIP_STEP, left: { lateral: -lateral, height: TUNNEL_HEIGHT }, right: { lateral, height: TUNNEL_HEIGHT } }, concrete))
  const ceilingLight = new THREE.MeshBasicMaterial({ color: 0xffc23a })
  scene.add(createStripMesh(path, { fromS: tunnel.fromS, toS: tunnel.toS, step: STRIP_STEP, left: { lateral: -.2, height: TUNNEL_HEIGHT - .05 }, right: { lateral: .2, height: TUNNEL_HEIGHT - .05 } }, ceilingLight))
}

const addViaductPillars = (scene: THREE.Scene, path: TrackPath, halfWidth: number): void => {
  const positions: THREE.Vector3[] = []
  for (let s = 0; s < path.length; s += PILLAR_SPACING) {
    const deckHeight = path.sampleAt(s).y
    if (deckHeight < .5) continue
    for (const side of [-1, 1]) {
      const point = path.pointAt(s, side * (halfWidth - 1.2))
      positions.push(new THREE.Vector3(point.x, point.y, point.z))
    }
  }
  if (positions.length === 0) return
  const pillars = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1, 1.4), new THREE.MeshStandardMaterial({ color: 0x2c3040, roughness: .7, emissive: DEEP_BLUE, emissiveIntensity: .25 }), positions.length)
  const matrix = new THREE.Matrix4()
  positions.forEach((top, index) => {
    const height = top.y - .3 - CITY_FLOOR_Y
    matrix.compose(new THREE.Vector3(top.x, CITY_FLOOR_Y + height / 2, top.z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1))
    pillars.setMatrixAt(index, matrix)
  })
  scene.add(pillars)
}

const addArches = (scene: THREE.Scene, path: TrackPath, track: TrackDefinition, halfWidth: number): void => {
  const insideTunnel = (s: number): boolean => track.tunnels.some(tunnel => s >= tunnel.fromS - 20 && s <= tunnel.toS + 20)
  for (let s = ARCH_SPACING / 2; s < path.length; s += ARCH_SPACING) {
    if (insideTunnel(s)) continue
    const sample = path.sampleAt(s)
    const color = Math.round(s / ARCH_SPACING) % 2 === 0 ? MAGENTA : CYAN
    const material = new THREE.MeshBasicMaterial({ color })
    const arch = new THREE.Group()
    const span = halfWidth * 2 + 2
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, .35, .35), material)
    beam.position.y = 7.5
    arch.add(beam)
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(.35, 7.5, .35), material)
      post.position.set(side * span / 2, 3.75, 0)
      arch.add(post)
    }
    arch.position.set(sample.x, sample.y, sample.z)
    arch.rotation.y = sample.yaw
    scene.add(arch)
  }
}

const addCityFloor = (scene: THREE.Scene, path: TrackPath): void => {
  const bounds = new THREE.Box3()
  for (let s = 0; s < path.length; s += 10) {
    const point = path.pointAt(s)
    bounds.expandByPoint(new THREE.Vector3(point.x, point.y, point.z))
  }
  const size = bounds.getSize(new THREE.Vector3())
  const center = bounds.getCenter(new THREE.Vector3())
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(size.x + 600, size.z + 600), new THREE.MeshStandardMaterial({ color: 0x07060d, roughness: .95 }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(center.x, CITY_FLOOR_Y, center.z)
  scene.add(floor)
}

/** `keepClear` points (the brake wall) get an open plaza so towers never hide them from the approach. */
const addTowers = (scene: THREE.Scene, path: TrackPath, halfWidth: number, keepClear: readonly TrackPoint[]): void => {
  const random = seededRandom(0x5eed)
  const towers: THREE.Matrix4[] = []
  for (let s = 0; s < path.length; s += TOWER_SPACING) {
    for (const side of [-1, 1]) {
      const width = 8 + random() * 8
      const depth = 8 + random() * 8
      const height = 24 + random() * 50
      const lateral = side * (halfWidth + 6 + Math.max(width, depth) / 2 + random() * 12)
      const point = path.pointAt(s, lateral)
      const clearance = Math.abs(path.project({ x: point.x, y: 0, z: point.z }).lateral)
      if (clearance < halfWidth + Math.max(width, depth) / 2 + 3) continue
      if (keepClear.some(clear => Math.hypot(clear.x - point.x, clear.z - point.z) < Math.max(width, depth) / 2 + PLAZA_RADIUS)) continue
      towers.push(new THREE.Matrix4().compose(
        new THREE.Vector3(point.x, CITY_FLOOR_Y + height / 2, point.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), path.sampleAt(s).yaw),
        new THREE.Vector3(width, height, depth),
      ))
    }
  }
  const windows = createWindowTexture(random)
  const material = new THREE.MeshStandardMaterial({ color: 0x0d0f18, roughness: .8, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: .9 })
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, towers.length)
  towers.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  scene.add(mesh)
}

const createWindowTexture = (random: () => number): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for the tower window texture')
  context.fillStyle = '#000'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const palette = ['#ff2bd6', '#2bf5ff', '#3a4bff', '#ffc23a']
  for (let y = 6; y < canvas.height; y += 10) {
    for (let x = 6; x < canvas.width; x += 12) {
      if (random() > .32) continue
      context.fillStyle = palette[Math.floor(random() * palette.length)] ?? '#2bf5ff'
      context.fillRect(x, y, 6, 4)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const seededRandom = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
