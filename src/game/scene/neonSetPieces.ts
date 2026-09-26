import * as THREE from 'three'
import type { SurfaceZone, TrackDefinition, TrackLandmark } from '../../types/game'
import type { SceneryAnimator, SceneryFrame } from '../themes/trackTheme'
import { brakeWarningActive, landmarkPosition } from '../track/trackFeatures'
import type { TrackPath } from '../track/trackPath'
import { BRAKE_DECELERATION } from '../vehicle/handlingModel'
import { createStripMesh } from './trackMeshes'

const CHINESE_FONT = "'PingFang HK','Microsoft JhengHei','Noto Sans TC',sans-serif"
const LATIN_FONT = "Arial,'Helvetica Neue',sans-serif"
/** Turn 3 is taken at roughly this speed; the wall warns once the player can only just slow to it. */
const T3_CORNER_SPEED = 24
const PLANNED_BRAKE_FRACTION = .85
const BOARD_WIDTH = 22
const BOARD_HEIGHT = 9.6
const BOARD_CENTER_HEIGHT = 8.5
const LAMP_SPACING = 6
const LAMP_HEIGHT = 2.1
const LAMP_BLINK_HZ = 3
const PILLAR_TOP_ABOVE_DECK = 16
const KERB_STRIPE_METRES = 2
const PAINT_HEIGHT = .025

export interface SetPieceContext { scene: THREE.Scene; path: TrackPath; track: TrackDefinition; cityFloorY: number }

export const addHoloBrakeWall = (context: SetPieceContext, landmark: TrackLandmark): SceneryAnimator => {
  const approach = landmark.activeRange
  if (!approach) throw new Error(`Brake board ${landmark.id} needs an approach range`)
  const normal = new THREE.MeshBasicMaterial({ map: boardTexture(drawPlazaAdvert), transparent: true, opacity: .92, side: THREE.DoubleSide })
  const warning = new THREE.MeshBasicMaterial({ map: boardTexture(drawBrakeWarning), transparent: true, opacity: .95, side: THREE.DoubleSide })
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_WIDTH, BOARD_HEIGHT), normal)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(BOARD_WIDTH + .6, BOARD_HEIGHT + .6, .3), new THREE.MeshStandardMaterial({ color: 0x151826, roughness: .4, metalness: .7 }))
  frame.position.z = -.25
  const group = new THREE.Group()
  group.add(frame, board)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.5, BOARD_CENTER_HEIGHT, .5), frame.material)
    leg.position.set(side * BOARD_WIDTH * .4, -BOARD_CENTER_HEIGHT / 2, -.25)
    group.add(leg)
  }
  const position = landmarkPosition(context.path, landmark)
  group.position.set(position.x, position.y + BOARD_CENTER_HEIGHT, position.z)
  group.rotation.y = context.path.sampleAt(landmark.s).yaw
  context.scene.add(group)

  return {
    update(frame: SceneryFrame): void {
      const active = brakeWarningActive({ s: frame.playerS, speed: frame.playerSpeed, approach, cornerSpeed: T3_CORNER_SPEED, deceleration: BRAKE_DECELERATION * PLANNED_BRAKE_FRACTION * frame.brakeMultiplier })
      board.material = active ? warning : normal
      normal.opacity = .86 + .1 * Math.sin(frame.timeSeconds * 9) * Math.sin(frame.timeSeconds * 2.3)
    },
  }
}

export const addWarningLamps = (context: SetPieceContext, landmark: TrackLandmark): SceneryAnimator => {
  const range = landmark.activeRange
  if (!range) throw new Error(`Warning lamps ${landmark.id} need a range`)
  const lateral = context.track.roadWidth / 2 + .15
  const phases = [new THREE.MeshBasicMaterial({ color: 0xffb020 }), new THREE.MeshBasicMaterial({ color: 0xffb020 })]
  const geometry = new THREE.BoxGeometry(.32, .32, .14)
  const positions: THREE.Vector3[][] = [[], []]
  let index = 0
  for (let s = range.fromS; s <= range.toS; s += LAMP_SPACING, index += 1) {
    for (const side of [-1, 1]) {
      const point = context.path.pointAt(s, side * lateral, LAMP_HEIGHT)
      positions[index % 2]?.push(new THREE.Vector3(point.x, point.y, point.z))
    }
  }
  const meshes = positions.map((points, phase) => {
    const mesh = new THREE.InstancedMesh(geometry, phases[phase], points.length)
    const matrix = new THREE.Matrix4()
    points.forEach((point, instance) => mesh.setMatrixAt(instance, matrix.makeTranslation(point.x, point.y, point.z)))
    context.scene.add(mesh)
    return mesh
  })
  return {
    update(frame: SceneryFrame): void {
      const lit = Math.floor(frame.timeSeconds * LAMP_BLINK_HZ) % 2
      meshes.forEach((mesh, phase) => { mesh.visible = phase === lit })
    },
  }
}

/** The second pillar is the turn-in reference, so it burns brighter and pulses. */
export const addReferencePillars = (context: SetPieceContext, landmarks: readonly TrackLandmark[]): SceneryAnimator => {
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a4052, roughness: .45, metalness: .8 })
  const blue = new THREE.MeshBasicMaterial({ color: 0x2255ff })
  const reference = new THREE.MeshBasicMaterial({ color: 0x66b3ff })
  landmarks.forEach((landmark, index) => {
    const base = landmarkPosition(context.path, landmark)
    const top = base.y + PILLAR_TOP_ABOVE_DECK
    const height = top - context.cityFloorY
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(1, height, 1), steel)
    pillar.position.set(base.x, context.cityFloorY + height / 2, base.z)
    pillar.rotation.y = context.path.sampleAt(landmark.s).yaw
    const glow = index === 1 ? reference : blue
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.06, PILLAR_TOP_ABOVE_DECK, .22), glow)
    strip.position.y = height / 2 - PILLAR_TOP_ABOVE_DECK / 2
    strip.position.z = .45
    pillar.add(strip)
    const crown = new THREE.Mesh(new THREE.SphereGeometry(index === 1 ? .9 : .55, 16, 12), glow)
    crown.position.y = height / 2 + .4
    pillar.add(crown)
    context.scene.add(pillar)
  })
  const bright = new THREE.Color(0xd6ecff)
  const base = new THREE.Color(0x66b3ff)
  return {
    update(frame: SceneryFrame): void {
      reference.color.copy(base).lerp(bright, .5 + .5 * Math.sin(frame.timeSeconds * 4))
    },
  }
}

export const addKerbs = (context: SetPieceContext, glowRange: { fromS: number; toS: number } | undefined): void => {
  const stripes = boardTexture(context2d => {
    const { width, height } = context2d.canvas
    context2d.fillStyle = '#d8202c'
    context2d.fillRect(0, 0, width, height / 2)
    context2d.fillStyle = '#f2f2ee'
    context2d.fillRect(0, height / 2, width, height / 2)
  }, 16, 64)
  stripes.wrapT = THREE.RepeatWrapping
  const kerbMaterial = new THREE.MeshStandardMaterial({ map: stripes, roughness: .55, polygonOffset: true, polygonOffsetFactor: -1 })
  const glowMaterial = new THREE.MeshBasicMaterial({ color: 0x7ff9ff, polygonOffset: true, polygonOffsetFactor: -2 })
  for (const zone of context.track.kerbs) {
    context.scene.add(createStripMesh(context.path, { fromS: zone.fromS, toS: zone.toS, step: 1, left: { lateral: zone.fromLateral, height: PAINT_HEIGHT }, right: { lateral: zone.toLateral, height: PAINT_HEIGHT }, uvLength: KERB_STRIPE_METRES }, kerbMaterial))
    if (!glowRange || zone.toS < glowRange.fromS || zone.fromS > glowRange.toS) continue
    const inner = Math.abs(zone.fromLateral) < Math.abs(zone.toLateral) ? zone.fromLateral : zone.toLateral
    const toward = Math.sign(-inner) * .12
    context.scene.add(createStripMesh(context.path, { fromS: zone.fromS, toS: zone.toS, step: 1, left: { lateral: Math.min(inner, inner + toward), height: PAINT_HEIGHT + .005 }, right: { lateral: Math.max(inner, inner + toward), height: PAINT_HEIGHT + .005 } }, glowMaterial))
  }
}

export const addPuddles = (context: SetPieceContext, puddles: readonly SurfaceZone[]): SceneryAnimator => {
  const alpha = boardTexture(context2d => {
    const { width, height } = context2d.canvas
    context2d.fillStyle = '#000'
    context2d.fillRect(0, 0, width, height)
    const random = seeded(0x7a11)
    for (let blob = 0; blob < 7; blob += 1) {
      const x = width * (.2 + random() * .6)
      const y = height * (.12 + random() * .76)
      const radius = width * (.18 + random() * .22)
      const gradient = context2d.createRadialGradient(x, y, 0, x, y, radius)
      gradient.addColorStop(0, '#fff')
      gradient.addColorStop(1, 'rgba(0,0,0,0)')
      context2d.fillStyle = gradient
      context2d.fillRect(0, 0, width, height)
    }
  }, 128, 256)
  alpha.colorSpace = THREE.NoColorSpace
  const material = new THREE.MeshStandardMaterial({ color: 0x2c3658, roughness: .03, metalness: .92, transparent: true, opacity: 0, alphaMap: alpha, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })
  for (const zone of puddles) {
    context.scene.add(createStripMesh(context.path, { fromS: zone.fromS, toS: zone.toS, step: 1, left: { lateral: zone.fromLateral, height: PAINT_HEIGHT - .008 }, right: { lateral: zone.toLateral, height: PAINT_HEIGHT - .008 }, uvLength: zone.toS - zone.fromS }, material))
  }
  return {
    update(frame: SceneryFrame): void {
      material.opacity = frame.weather.kind === 'storm' || frame.weather.kind === 'drying' ? .8 * frame.weather.wetness : 0
    },
  }
}

export const wetRoadAnimator = (road: THREE.MeshStandardMaterial): SceneryAnimator => {
  const dry = { roughness: road.roughness, metalness: road.metalness }
  return {
    update(frame: SceneryFrame): void {
      const wet = frame.weather.wetness
      road.roughness = dry.roughness + (.06 - dry.roughness) * wet
      road.metalness = dry.metalness + (.75 - dry.metalness) * wet
    },
  }
}

export const combineAnimators = (animators: readonly SceneryAnimator[]): SceneryAnimator => ({
  update: (frame: SceneryFrame): void => animators.forEach(animator => animator.update(frame)),
})

const drawPlazaAdvert = (context: CanvasRenderingContext2D): void => {
  const { width, height } = context.canvas
  const gradient = context.createLinearGradient(0, 0, width, height)
  gradient.addColorStop(0, '#0b4a6e')
  gradient.addColorStop(1, '#5a1070')
  context.fillStyle = gradient
  context.fillRect(0, 0, width, height)
  context.strokeStyle = '#2bf5ff'
  context.lineWidth = 10
  context.strokeRect(16, 16, width - 32, height - 32)
  context.fillStyle = '#2bf5ff'
  for (let y = 30; y < height; y += 9) context.fillRect(20, y, width - 40, 1)
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = '#ffffff'
  context.font = `bold 150px ${CHINESE_FONT}`
  context.fillText('財閥廣場', width / 2, height * .42)
  context.fillStyle = '#ff2bd6'
  context.font = `bold 64px ${LATIN_FONT}`
  context.fillText('TYCOON PLAZA', width / 2, height * .72)
}

const drawBrakeWarning = (context: CanvasRenderingContext2D): void => {
  const { width, height } = context.canvas
  context.fillStyle = '#c3121e'
  context.fillRect(0, 0, width, height)
  context.strokeStyle = '#ffffff'
  context.lineWidth = 16
  context.strokeRect(20, 20, width - 40, height - 40)
  context.fillStyle = '#ffffff'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `bold 170px ${CHINESE_FONT}`
  context.fillText('煞車', width * .36, height * .42)
  context.font = `bold 84px ${LATIN_FONT}`
  context.fillText('BRAKE', width * .36, height * .76)
  for (let chevron = 0; chevron < 3; chevron += 1) {
    const x = width * .66 + chevron * 90
    context.beginPath()
    context.moveTo(x, height * .22)
    context.lineTo(x + 70, height * .5)
    context.lineTo(x, height * .78)
    context.lineTo(x + 34, height * .78)
    context.lineTo(x + 104, height * .5)
    context.lineTo(x + 34, height * .22)
    context.closePath()
    context.fill()
  }
}

const boardTexture = (draw: (context: CanvasRenderingContext2D) => void, width = 1024, height = 448): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for Neon Rift set-piece textures')
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

const seeded = (seed: number): (() => number) => {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296
  }
}
