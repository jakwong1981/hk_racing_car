import type RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { hongKongRouteS } from '../../config/tracks/hongKongRoute'
import type { TrackDefinition } from '../../types/game'
import { addBoxCollider, addStripCollider, REBOUND_SURFACE, ROAD_SURFACE } from '../physics/trackColliders'
import { addHongKongStreetFurniture, type HongKongStreetLayout } from '../scene/hongKongStreetFurniture'
import { createFinishLine, createStripMesh } from '../scene/trackMeshes'
import type { TrackPath } from '../track/trackPath'
import { STATIC_SCENERY, type SceneryAnimator, type TrackBuildContext, type TrackThemeBuilder } from './trackTheme'

const BUILDINGS_PER_SIDE = 28
const BUILDING_SPACING = 12
const FIRST_BUILDING_Z = 8
const SIDES = [-1, 1] as const
const AD_PATHS = ['/ads/adv1.jpeg', '/ads/adv2.jpeg', '/ads/adv3.jpeg']
const LANE_CENTERS = [-11.5, -3.8, 3.8, 11.5]
const FINISH_S = hongKongRouteS(-292)

/** Markings stay clear of the boost pad at s≈129 and the finish line. */
const STREET_LAYOUT: HongKongStreetLayout = {
  roadHalfWidth: 15,
  postLateral: 14,
  gantries: [
    { s: hongKongRouteS(-36), destinations: [{ chinese: '尖沙咀', english: 'Tsim Sha Tsui', arrowDegrees: 0 }, { chinese: '油麻地', english: 'Yau Ma Tei', arrowDegrees: 45 }] },
    { s: hongKongRouteS(-142), destinations: [{ chinese: '葵涌', english: 'Kwai Chung', arrowDegrees: 0 }, { chinese: '貨櫃碼頭', english: 'Container Port', arrowDegrees: 45 }] },
    { s: hongKongRouteS(-252), destinations: [{ chinese: '中環', english: 'Central', route: '1', arrowDegrees: 0 }, { chinese: '灣仔', english: 'Wan Chai', arrowDegrees: 45 }] },
  ],
  speedLimits: [
    { s: 30, side: -1, limit: 50 },
    { s: 200, side: 1, limit: 70 },
  ],
  markings: [
    { s: 95, kind: 'aheadArrow', laterals: LANE_CENTERS },
    { s: 200, kind: 'aheadArrow', laterals: LANE_CENTERS },
    { s: 245, kind: 'slow', laterals: LANE_CENTERS },
  ],
  zebraCrossings: [45],
  laneLines: { laterals: [-7.7, 7.7], fromS: 0, toS: 330, skip: [{ fromS: 41, toS: 49 }, { fromS: FINISH_S - 4, toS: FINISH_S + 4 }] },
}

interface BuildingLayout { z: number; side: number; index: number; width: number; height: number }

const buildingLayouts = (): BuildingLayout[] => SIDES.flatMap(side => Array.from({ length: BUILDINGS_PER_SIDE }, (_, index) => ({
  z: FIRST_BUILDING_Z - index * BUILDING_SPACING,
  side,
  index,
  width: 5 + (index % 3),
  height: 10 + (index * 7) % 20,
})))

/** Roadside props were authored against the legacy z axis; this keeps their spacing while following the spline. */
class LegacyRoute {
  constructor(private readonly path: TrackPath) {}
  at(z: number, lateral = 0): THREE.Vector3 {
    const point = this.path.pointAt(hongKongRouteS(z), lateral)
    return new THREE.Vector3(point.x, point.y, point.z)
  }
  yaw(z: number): number {
    return this.path.sampleAt(hongKongRouteS(z)).yaw
  }
}

export const hongKongTheme: TrackThemeBuilder = {
  atmosphere: { fogColor: 0x081014, clearFogDensity: .012, stormFogDensity: .02 },

  async buildScenery(context: TrackBuildContext): Promise<SceneryAnimator> {
    const { scene, path, track } = context
    const route = new LegacyRoute(path)
    scene.background = new THREE.Color(0x07090b)
    scene.fog = new THREE.FogExp2(hongKongTheme.atmosphere.fogColor, hongKongTheme.atmosphere.clearFogDensity)
    scene.add(new THREE.HemisphereLight(0x86b5bf, 0x101113, 1.35))
    const moon = new THREE.DirectionalLight(0xd9eaff, 2)
    moon.position.set(-8, 20, 6)
    scene.add(moon)

    const halfWidth = track.roadWidth / 2
    const road = createStripMesh(path, { fromS: hongKongRouteS(15.5), toS: hongKongRouteS(-305.5), step: 2, left: { lateral: -halfWidth, height: 0 }, right: { lateral: halfWidth, height: 0 } }, new THREE.MeshStandardMaterial({ color: 0xb7bbb8, roughness: .58, metalness: .08 }))
    road.receiveShadow = true
    scene.add(road)
    addWetPatches(scene, route)
    addLaneLines(scene, route)
    scene.add(createFinishLine(path, track.finishS, 30, context.maxAnisotropy))
    for (const layout of buildingLayouts()) addBuilding(scene, route, layout)
    for (let z = 0; z > -300; z -= 24) for (const side of SIDES) addShopfront(scene, route, side, z, Math.abs(z / 24))
    await addAdvertisements(scene, route)
    addBarriers(scene, route)
    addHongKongStreetFurniture(scene, path, STREET_LAYOUT)
    for (const pad of track.boostPads) addBoostPad(scene, path, pad.s, pad.lateral)
    return STATIC_SCENERY
  },

  buildColliders(world: RAPIER.World, path: TrackPath, track: TrackDefinition): void {
    const halfWidth = track.roadWidth / 2
    addStripCollider(world, path, { fromS: 0, toS: path.length, step: 2, left: { lateral: -halfWidth, height: 0 }, right: { lateral: halfWidth, height: 0 } }, ROAD_SURFACE)
    const route = new LegacyRoute(path)
    for (const layout of buildingLayouts()) {
      const center = route.at(layout.z, layout.side * (18 + layout.width / 2))
      addBoxCollider(world, { x: center.x, y: layout.height / 2, z: center.z, yaw: route.yaw(layout.z), halfWidth: layout.width / 2, halfHeight: layout.height / 2, halfDepth: 4.5 }, REBOUND_SURFACE)
    }
  },
}

const facingRoad = (yaw: number, side: number): number => yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2)

const addWetPatches = (scene: THREE.Scene, route: LegacyRoute): void => {
  for (let z = 10; z > -310; z -= 18) {
    const darker = z % 36 === 0
    const position = route.at(z, darker ? -5 : 5)
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(7 + (Math.abs(z) % 5), 5), new THREE.MeshStandardMaterial({ color: darker ? 0xa4aaa9 : 0x8d9695, roughness: .7, metalness: .04, transparent: true, opacity: .62 }))
    patch.rotation.set(-Math.PI / 2, 0, route.yaw(z))
    patch.position.set(position.x, .018, position.z)
    scene.add(patch)
  }
}

const addLaneLines = (scene: THREE.Scene, route: LegacyRoute): void => {
  const material = new THREE.MeshBasicMaterial({ color: 0xe4cf93 })
  const crossesZebra = (z: number): boolean => STREET_LAYOUT.zebraCrossings.some(s => Math.abs(hongKongRouteS(z) - s) < 6)
  for (let z = 15; z > -310; z -= 12) {
    if (crossesZebra(z)) continue
    const position = route.at(z)
    const line = new THREE.Mesh(new THREE.PlaneGeometry(.16, 5), material)
    line.rotation.set(-Math.PI / 2, 0, route.yaw(z))
    line.position.set(position.x, .012, position.z)
    scene.add(line)
  }
}

const addBuilding = (scene: THREE.Scene, route: LegacyRoute, layout: BuildingLayout): void => {
  const { z, side, index, width, height } = layout
  const yaw = route.yaw(z)
  const center = route.at(z, side * (18 + width / 2))
  const building = new THREE.Mesh(new THREE.BoxGeometry(width, height, 9), new THREE.MeshStandardMaterial({ color: index % 2 ? 0x171d20 : 0x202326, roughness: .84 }))
  building.rotation.y = yaw
  building.position.set(center.x, height / 2, center.z)
  scene.add(building)
  for (let floor = 3; floor < height - 2; floor += 3) {
    for (let offset = -2; offset <= 2; offset += 2) {
      if ((floor + offset + index) % 3 === 0) continue
      const position = route.at(z + offset, side * 15.99)
      const window = new THREE.Mesh(new THREE.PlaneGeometry(.55, .32), new THREE.MeshBasicMaterial({ color: (floor + index) % 4 === 0 ? 0xf3b847 : 0x92bcb2 }))
      window.position.set(position.x, floor, position.z)
      window.rotation.y = facingRoad(yaw, side)
      scene.add(window)
    }
  }
}

const addShopfront = (scene: THREE.Scene, route: LegacyRoute, side: number, z: number, index: number): void => {
  const colors = [0xd52f3a, 0xf0b52f, 0x2e8b65]
  const yaw = route.yaw(z)
  const shopPosition = route.at(z, side * 15.82)
  const shop = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.8, 5.8), new THREE.MeshBasicMaterial({ color: colors[index % 3] }))
  shop.rotation.y = yaw
  shop.position.set(shopPosition.x, 1.7, shopPosition.z)
  scene.add(shop)

  const canvas = document.createElement('canvas')
  canvas.width = 160
  canvas.height = 480
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = ['#d52f3a', '#dfac27', '#237356'][index % 3] ?? '#d52f3a'
    context.fillRect(0, 0, 160, 480)
    context.strokeStyle = '#f4f0db'
    context.lineWidth = 8
    context.strokeRect(6, 6, 148, 468)
    context.fillStyle = '#fff'
    context.font = 'bold 52px sans-serif'
    context.textAlign = 'center'
    const names = ['茶餐廳', '藥 房', '金 舖', '電 器']
    ;[...(names[index % 4] ?? '商店')].forEach((letter, row) => context.fillText(letter, 80, 80 + row * 70))
  }
  const signPosition = route.at(z + 2, side * 14.9)
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas) }))
  sign.position.set(signPosition.x, 4.2, signPosition.z)
  sign.rotation.y = facingRoad(yaw, side)
  scene.add(sign)
}

const addAdvertisements = async (scene: THREE.Scene, route: LegacyRoute): Promise<void> => {
  const textures = await Promise.all(AD_PATHS.map(path => new THREE.TextureLoader().loadAsync(path)))
  textures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace })
  for (const side of SIDES) {
    const textureOrder = shuffledIndices(textures.length)
    for (let index = 0; index < 10; index += 1) {
      const texture = textures[textureOrder[index % textureOrder.length] ?? 0]
      if (!texture) continue
      const aspect = texture.image.width / texture.image.height
      const height = aspect > 1.35 ? 3.45 : 4.25
      const width = Math.min(6.6, height * aspect)
      const z = -8 - index * 30 + (side === 1 ? 3 : -3)
      const position = route.at(z, side * 15.35)
      const board = new THREE.Group()
      board.position.set(position.x, height + 1.2, position.z)
      board.rotation.y = facingRoad(route.yaw(z), side)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .28, height + .28, .16), new THREE.MeshStandardMaterial({ color: 0x202326, roughness: .6, metalness: .25 }))
      frame.position.z = -.06
      board.add(frame)
      const poster = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide, depthWrite: false }))
      poster.position.z = .035
      poster.renderOrder = 1
      board.add(poster)
      const lamp = new THREE.PointLight(0xffdca6, 3.2, 10)
      lamp.position.set(0, height / 2 + .45, -.45)
      board.add(lamp)
      scene.add(board)
    }
  }
}

const shuffledIndices = (count: number): number[] => {
  const order = Array.from({ length: count }, (_, index) => index)
  for (let index = order.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[order[index], order[swapIndex]] = [order[swapIndex]!, order[index]!]
  }
  return order
}

const addBarriers = (scene: THREE.Scene, route: LegacyRoute): void => {
  for (let z = 4; z > -310; z -= 16) {
    for (const side of SIDES) {
      const position = route.at(z, side * 15.4)
      const barrier = new THREE.Mesh(new THREE.BoxGeometry(.55, .72, 6), new THREE.MeshStandardMaterial({ color: Math.abs(z) % 32 < 2 ? 0xd23838 : 0xe7e6dc, roughness: .7 }))
      barrier.rotation.y = route.yaw(z)
      barrier.position.set(position.x, .36, position.z)
      scene.add(barrier)
    }
  }
}

const addBoostPad = (scene: THREE.Scene, path: TrackPath, s: number, lateral: number): void => {
  const position = path.pointAt(s, lateral)
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.4, 32), new THREE.MeshBasicMaterial({ color: 0x39f7e2, transparent: true, opacity: .5, side: THREE.DoubleSide }))
  water.rotation.x = -Math.PI / 2
  water.position.set(position.x, position.y + .03, position.z)
  scene.add(water)
}
