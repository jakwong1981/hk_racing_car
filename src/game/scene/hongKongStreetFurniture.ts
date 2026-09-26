import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { TrackRange } from '../../types/game'
import type { TrackPath } from '../track/trackPath'
import { stripMeshData, type StripSpec } from '../track/trackStrip'
import { createStripMesh } from './trackMeshes'

export interface SignDestination { chinese: string; english: string; arrowDegrees: number; route?: string }
export interface GantrySign { s: number; destinations: readonly SignDestination[] }
export interface SpeedLimitSign { s: number; side: -1 | 1; limit: number }
export type RoadMarkingKind = 'slow' | 'aheadArrow'
export interface RoadMarking { s: number; kind: RoadMarkingKind; laterals: readonly number[] }
export interface LaneLines { laterals: readonly number[]; fromS: number; toS: number; skip: readonly TrackRange[] }

/** Distances are metres along the centerline; laterals are metres to the right of travel. */
export interface HongKongStreetLayout {
  roadHalfWidth: number
  postLateral: number
  gantries: readonly GantrySign[]
  speedLimits: readonly SpeedLimitSign[]
  markings: readonly RoadMarking[]
  zebraCrossings: readonly number[]
  laneLines?: LaneLines
}

const SIGN_GREEN = '#0b6b4b'
const PAINT_WHITE = '#f4f4f0'
const CHINESE_FONT = "'PingFang HK','Microsoft JhengHei','Noto Sans TC',sans-serif"
const LATIN_FONT = "Arial,'Helvetica Neue',sans-serif"
const GANTRY_HEIGHT = 7
const GANTRY_SIGN_HEIGHT = 2.6
const GANTRY_COLUMN_PIXELS = 512
const GANTRY_PIXEL_HEIGHT = 300
const MARKING_WIDTH = 2.4
const SLOW_MARKING_LENGTH = 7
const ARROW_MARKING_LENGTH = 5
const ZEBRA_DEPTH = 4
const KERB_TEXT_WIDTH = 2.2
const DASH_LENGTH = 3
const DASH_PERIOD = 9
const DASH_WIDTH = .15
const PAINT_HEIGHT = .03

export const addHongKongStreetFurniture = (scene: THREE.Scene, path: TrackPath, layout: HongKongStreetLayout): void => {
  for (const gantry of layout.gantries) scene.add(createGantry(path, gantry, layout.postLateral))
  for (const sign of layout.speedLimits) scene.add(createSpeedLimitSign(path, sign, layout.postLateral))
  const slowMaterial = paintMaterial(drawSlowMarking())
  const arrowMaterial = paintMaterial(drawAheadArrow())
  for (const marking of layout.markings) {
    const material = marking.kind === 'slow' ? slowMaterial : arrowMaterial
    const length = marking.kind === 'slow' ? SLOW_MARKING_LENGTH : ARROW_MARKING_LENGTH
    for (const lateral of marking.laterals) scene.add(paintedStrip(path, marking.s, length, lateral - MARKING_WIDTH / 2, lateral + MARKING_WIDTH / 2, material))
  }
  for (const s of layout.zebraCrossings) addZebraCrossing(scene, path, s, layout.roadHalfWidth, layout.postLateral)
  if (layout.laneLines) scene.add(createLaneLines(path, layout.laneLines))
}

const createGantry = (path: TrackPath, gantry: GantrySign, postLateral: number): THREE.Group => {
  const group = new THREE.Group()
  const steel = new THREE.MeshStandardMaterial({ color: 0x7c8584, roughness: .55, metalness: .5 })
  const beam = new THREE.Mesh(new THREE.BoxGeometry(postLateral * 2, .24, .24), steel)
  beam.position.y = GANTRY_HEIGHT
  group.add(beam)
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.26, GANTRY_HEIGHT, .26), steel)
    post.position.set(side * postLateral, GANTRY_HEIGHT / 2, 0)
    group.add(post)
  }
  const texture = canvasTexture(GANTRY_COLUMN_PIXELS * gantry.destinations.length, GANTRY_PIXEL_HEIGHT, context => drawGantryFace(context, gantry.destinations))
  const width = GANTRY_SIGN_HEIGHT * GANTRY_COLUMN_PIXELS / GANTRY_PIXEL_HEIGHT * gantry.destinations.length
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, GANTRY_SIGN_HEIGHT), new THREE.MeshBasicMaterial({ map: texture }))
  face.position.set(0, GANTRY_HEIGHT - GANTRY_SIGN_HEIGHT / 2 + .1, .16)
  group.add(face)
  const back = new THREE.Mesh(new THREE.PlaneGeometry(width, GANTRY_SIGN_HEIGHT), new THREE.MeshStandardMaterial({ color: 0x3b4242, side: THREE.BackSide }))
  back.position.copy(face.position)
  group.add(back)
  placeFacingDriver(group, path, gantry.s, 0)
  return group
}

const drawGantryFace = (context: CanvasRenderingContext2D, destinations: readonly SignDestination[]): void => {
  const { width, height } = context.canvas
  context.fillStyle = SIGN_GREEN
  context.fillRect(0, 0, width, height)
  context.strokeStyle = PAINT_WHITE
  context.lineWidth = 8
  context.beginPath()
  context.roundRect(10, 10, width - 20, height - 20, 18)
  context.stroke()
  destinations.forEach((destination, column) => {
    const left = column * GANTRY_COLUMN_PIXELS
    if (column > 0) {
      context.fillStyle = PAINT_WHITE
      context.fillRect(left - 2, 34, 4, height - 68)
    }
    const textCenter = left + (destination.route ? 316 : GANTRY_COLUMN_PIXELS / 2)
    const textWidth = destination.route ? 320 : 440
    if (destination.route) drawRouteBox(context, left + 40, 44, destination.route)
    context.fillStyle = PAINT_WHITE
    context.textAlign = 'center'
    context.textBaseline = 'alphabetic'
    context.font = `bold 74px ${CHINESE_FONT}`
    context.fillText(destination.chinese, textCenter, 112, textWidth)
    context.font = `bold 48px ${LATIN_FONT}`
    context.fillText(destination.english, textCenter, 170, textWidth)
    drawArrow(context, textCenter, 236, 60, destination.arrowDegrees)
  })
}

const drawRouteBox = (context: CanvasRenderingContext2D, x: number, y: number, route: string): void => {
  context.fillStyle = SIGN_GREEN
  context.strokeStyle = PAINT_WHITE
  context.lineWidth = 6
  context.beginPath()
  context.roundRect(x, y, 96, 84, 10)
  context.fill()
  context.stroke()
  context.fillStyle = PAINT_WHITE
  context.font = `bold 64px ${LATIN_FONT}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(route, x + 48, y + 46)
}

const drawArrow = (context: CanvasRenderingContext2D, x: number, y: number, size: number, degrees: number): void => {
  context.save()
  context.translate(x, y)
  context.rotate(degrees * Math.PI / 180)
  context.fillStyle = PAINT_WHITE
  context.fillRect(-size * .1, -size * .15, size * .2, size * .65)
  context.beginPath()
  context.moveTo(0, -size * .5)
  context.lineTo(size * .32, -size * .1)
  context.lineTo(-size * .32, -size * .1)
  context.closePath()
  context.fill()
  context.restore()
}

const createSpeedLimitSign = (path: TrackPath, sign: SpeedLimitSign, postLateral: number): THREE.Group => {
  const group = new THREE.Group()
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.6, 8), new THREE.MeshStandardMaterial({ color: 0x9aa2a3, metalness: .6, roughness: .4 }))
  pole.position.y = 1.3
  group.add(pole)
  const texture = canvasTexture(256, 256, context => {
    context.fillStyle = '#ffffff'
    context.beginPath()
    context.arc(128, 128, 124, 0, Math.PI * 2)
    context.fill()
    context.strokeStyle = '#d3202a'
    context.lineWidth = 30
    context.beginPath()
    context.arc(128, 128, 106, 0, Math.PI * 2)
    context.stroke()
    context.fillStyle = '#111'
    context.font = `bold 118px ${LATIN_FONT}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(String(sign.limit), 128, 136)
  })
  const disc = new THREE.Mesh(new THREE.CircleGeometry(.5, 32), new THREE.MeshBasicMaterial({ map: texture, transparent: true }))
  disc.position.set(0, 2.9, .06)
  group.add(disc)
  const back = new THREE.Mesh(new THREE.CircleGeometry(.5, 32), new THREE.MeshStandardMaterial({ color: 0x6d7475, side: THREE.BackSide }))
  back.position.copy(disc.position)
  group.add(back)
  placeFacingDriver(group, path, sign.s, sign.side * postLateral)
  return group
}

const addZebraCrossing = (scene: THREE.Scene, path: TrackPath, s: number, halfWidth: number, postLateral: number): void => {
  const fromS = s - ZEBRA_DEPTH / 2
  const stripeEdge = halfWidth - KERB_TEXT_WIDTH
  const stripeCount = Math.round(stripeEdge * 2 / .5)
  const stripes = canvasTexture(stripeCount * 16, 32, context => {
    context.fillStyle = PAINT_WHITE
    for (let stripe = 0; stripe < stripeCount; stripe += 2) context.fillRect(stripe * 16, 0, 16, 32)
  })
  scene.add(paintedStrip(path, fromS, ZEBRA_DEPTH, -stripeEdge, stripeEdge, paintMaterial(stripes)))
  // Traffic runs one way along +s, so a pedestrian on the left kerb must look right and one on the right kerb must look left.
  scene.add(paintedStrip(path, fromS, ZEBRA_DEPTH, -halfWidth, -stripeEdge, paintMaterial(drawKerbText('望右', 'LOOK RIGHT', Math.PI / 2))))
  scene.add(paintedStrip(path, fromS, ZEBRA_DEPTH, stripeEdge, halfWidth, paintMaterial(drawKerbText('望左', 'LOOK LEFT', -Math.PI / 2))))
  for (const side of [-1, 1]) scene.add(createBelishaBeacon(path, s, side * postLateral))
}

const drawKerbText = (chinese: string, english: string, rotation: number): THREE.CanvasTexture => canvasTexture(220, 400, context => {
  context.translate(110, 200)
  context.rotate(rotation)
  context.fillStyle = PAINT_WHITE
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `bold 92px ${CHINESE_FONT}`
  context.fillText(chinese, 0, -42, 360)
  context.font = `bold 52px ${LATIN_FONT}`
  context.fillText(english, 0, 52, 380)
})

const createBelishaBeacon = (path: TrackPath, s: number, lateral: number): THREE.Group => {
  const group = new THREE.Group()
  const bands = canvasTexture(16, 128, context => {
    for (let band = 0; band < 8; band += 1) {
      context.fillStyle = band % 2 === 0 ? '#f2f2ee' : '#151515'
      context.fillRect(0, band * 16, 16, 16)
    }
  })
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 2.6, 10), new THREE.MeshStandardMaterial({ map: bands, roughness: .5 }))
  pole.position.y = 1.3
  group.add(pole)
  const globe = new THREE.Mesh(new THREE.SphereGeometry(.2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffa21a }))
  globe.position.y = 2.75
  group.add(globe)
  placeFacingDriver(group, path, s, lateral)
  return group
}

const drawSlowMarking = (): THREE.CanvasTexture => canvasTexture(240, 700, context => {
  context.fillStyle = PAINT_WHITE
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  // Road text is read nearest-first, so the first word sits at the bottom of the texture (closest to the driver).
  context.font = `bold 190px ${CHINESE_FONT}`
  context.fillText('慢', 120, 590)
  context.fillText('駛', 120, 360)
  context.font = `bold 96px ${LATIN_FONT}`
  context.fillText('SLOW', 120, 140, 230)
})

const drawAheadArrow = (): THREE.CanvasTexture => canvasTexture(160, 520, context => {
  context.fillStyle = PAINT_WHITE
  context.fillRect(62, 200, 36, 300)
  context.beginPath()
  context.moveTo(80, 20)
  context.lineTo(140, 210)
  context.lineTo(20, 210)
  context.closePath()
  context.fill()
})

const createLaneLines = (path: TrackPath, lines: LaneLines): THREE.Mesh => {
  const geometries: THREE.BufferGeometry[] = []
  const skipped = (s: number): boolean => lines.skip.some(range => s + DASH_LENGTH >= range.fromS && s <= range.toS)
  for (const lateral of lines.laterals) {
    for (let s = lines.fromS; s + DASH_LENGTH <= lines.toS; s += DASH_PERIOD) {
      if (skipped(s)) continue
      geometries.push(stripGeometry(path, { fromS: s, toS: s + DASH_LENGTH, step: DASH_LENGTH, left: { lateral: lateral - DASH_WIDTH / 2, height: PAINT_HEIGHT }, right: { lateral: lateral + DASH_WIDTH / 2, height: PAINT_HEIGHT } }))
    }
  }
  const merged = mergeGeometries(geometries)
  geometries.forEach(geometry => geometry.dispose())
  return new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ color: PAINT_WHITE, polygonOffset: true, polygonOffsetFactor: -2 }))
}

const stripGeometry = (path: TrackPath, spec: StripSpec): THREE.BufferGeometry => {
  const data = stripMeshData(path, spec)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
  return geometry
}

/** Texture v runs along travel, so the bottom of each canvas is the edge nearest an approaching driver. */
const paintedStrip = (path: TrackPath, fromS: number, length: number, leftLateral: number, rightLateral: number, material: THREE.Material): THREE.Mesh => {
  const mesh = createStripMesh(path, { fromS, toS: fromS + length, step: Math.min(1, length), left: { lateral: leftLateral, height: PAINT_HEIGHT }, right: { lateral: rightLateral, height: PAINT_HEIGHT }, uvLength: length }, material)
  mesh.renderOrder = 2
  return mesh
}

const paintMaterial = (texture: THREE.Texture): THREE.MeshBasicMaterial => new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide })

const placeFacingDriver = (object: THREE.Object3D, path: TrackPath, s: number, lateral: number): void => {
  const point = path.pointAt(s, lateral)
  object.position.set(point.x, point.y, point.z)
  object.rotation.y = path.sampleAt(s).yaw
}

const canvasTexture = (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for Hong Kong street furniture textures')
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}
