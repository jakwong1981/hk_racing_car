import * as THREE from 'three'
import type { PropCluster, PropKind } from '../../types/game'
import { knockProp, standingProp, stepProp, type PropBody } from '../propDebris'
import type { TrackPath, TrackPoint } from '../track/trackPath'

const BARREL_RADIUS = .42
const BARREL_HEIGHT = .95
const SIGN_WIDTH = 1.3
const SIGN_HEIGHT = .85
const SIGN_STAND = .5
const RESTING_LIFT = .02

interface PropInstance { body: PropBody; mesh: THREE.Object3D; restingLift: number }
export interface PropCollider { position: TrackPoint; velocity: TrackPoint }

/** Barrels and chevron boards along the run-offs; they scatter when any car hits them and stay where they land. */
export class PropField {
  private readonly props: PropInstance[] = []
  private readonly random = Math.random

  constructor(scene: THREE.Scene, path: TrackPath, clusters: readonly PropCluster[]) {
    const barrelMaterial = new THREE.MeshStandardMaterial({ map: stripedTexture(), roughness: .6 })
    const signMaterial = new THREE.MeshBasicMaterial({ map: chevronTexture() })
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: .7 })
    for (const cluster of clusters) {
      for (let index = 0; index < cluster.count; index += 1) {
        const s = cluster.s + index * cluster.spacing
        const ground = path.pointAt(s, cluster.lateral)
        const halfHeight = cluster.kind === 'barrel' ? BARREL_HEIGHT / 2 : (SIGN_HEIGHT + SIGN_STAND) / 2
        const mesh = cluster.kind === 'barrel' ? createBarrel(barrelMaterial) : createSign(signMaterial, legMaterial)
        mesh.rotation.y = path.sampleAt(s).yaw
        const body = standingProp({ x: ground.x, y: ground.y + halfHeight, z: ground.z })
        const restingLift = restingLiftFor(cluster.kind) - halfHeight
        this.props.push({ body: { ...body, rotation: { x: 0, y: mesh.rotation.y, z: 0 } }, mesh, restingLift })
        mesh.position.set(body.position.x, body.position.y, body.position.z)
        scene.add(mesh)
      }
    }
  }

  update(dt: number, colliders: readonly PropCollider[]): void {
    for (const prop of this.props) {
      for (const collider of colliders) prop.body = knockProp(prop.body, collider.position, collider.velocity, this.random)
      if (prop.body.state === 'flying') prop.body = stepProp(prop.body, dt)
      if (prop.body.state === 'standing') continue
      const { position, rotation } = prop.body
      prop.mesh.position.set(position.x, position.y + (prop.body.state === 'resting' ? prop.restingLift : 0), position.z)
      prop.mesh.rotation.set(rotation.x, rotation.y, rotation.z)
    }
  }
}

const restingLiftFor = (kind: PropKind): number => kind === 'barrel' ? BARREL_RADIUS + RESTING_LIFT : .1

const createBarrel = (material: THREE.Material): THREE.Mesh => {
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(BARREL_RADIUS, BARREL_RADIUS * 1.08, BARREL_HEIGHT, 16), material)
  barrel.castShadow = true
  return barrel
}

const createSign = (face: THREE.Material, legs: THREE.Material): THREE.Group => {
  const group = new THREE.Group()
  const board = new THREE.Mesh(new THREE.BoxGeometry(SIGN_WIDTH, SIGN_HEIGHT, .06), [legs, legs, legs, legs, face, legs])
  board.position.y = SIGN_STAND / 2
  group.add(board)
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(.06, SIGN_STAND + SIGN_HEIGHT, .06), legs)
    leg.position.set(side * SIGN_WIDTH * .42, 0, -.05)
    group.add(leg)
  }
  return group
}

const stripedTexture = (): THREE.CanvasTexture => canvasTexture(64, 128, context => {
  for (let band = 0; band < 4; band += 1) {
    context.fillStyle = band % 2 === 0 ? '#d8202c' : '#f2f2ee'
    context.fillRect(0, band * 32, 64, 32)
  }
})

const chevronTexture = (): THREE.CanvasTexture => canvasTexture(256, 160, context => {
  context.fillStyle = '#d8202c'
  context.fillRect(0, 0, 256, 160)
  context.fillStyle = '#ffffff'
  for (let chevron = 0; chevron < 3; chevron += 1) {
    const x = 34 + chevron * 70
    context.beginPath()
    context.moveTo(x, 24)
    context.lineTo(x + 46, 80)
    context.lineTo(x, 136)
    context.lineTo(x + 24, 136)
    context.lineTo(x + 70, 80)
    context.lineTo(x + 24, 24)
    context.closePath()
    context.fill()
  }
})

const canvasTexture = (width: number, height: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for roadside prop textures')
  draw(context)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
