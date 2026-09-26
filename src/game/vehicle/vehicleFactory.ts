import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { VehicleId, VehicleSpec } from '../../types/game'
import { prepareDoubleDeckerModel, prepareMinibusModel, prepareTaxiModel, prepareTramModel } from '../vehicleModel'

export interface VehicleVisual { group: THREE.Group; headlights: THREE.SpotLight[]; headlightTargets: THREE.Object3D[] }
/** Rivals use emissive lamps instead of real lights so four cars do not multiply the per-pixel lighting cost. */
export interface VehicleVisualOptions { role: 'player' | 'rival'; loadModel: boolean }

const CHASE_LIGHT_COLOR = 0xfff1e0
const CHASE_LIGHT_INTENSITY = 30
const CHASE_LIGHT_RANGE = 14
const CHASE_LIGHT_LIFT = 1.8
const CHASE_LIGHT_SETBACK = 2.2

type ModelPreparer = (model: THREE.Object3D) => THREE.Group
interface ModelSource { path: string; format: 'fbx' | 'glb'; prepare: ModelPreparer }

const MODEL_SOURCES: Readonly<Record<VehicleId, ModelSource>> = {
  taxi: { path: '/models/taxi/HK_Taxi_Red.fbx', format: 'fbx', prepare: prepareTaxiModel },
  minibus: { path: '/models/minibus/HK_Minibus_Red.fbx', format: 'fbx', prepare: prepareMinibusModel },
  doubleDecker: { path: '/models/double-decker/HK_Doubledeck_002.fbx', format: 'fbx', prepare: prepareDoubleDeckerModel },
  tram: { path: '/models/tram/HK_Tram.glb', format: 'glb', prepare: prepareTramModel },
}

/** Headlight targets live in world space so the beams can be re-aimed along the vehicle heading each frame. */
export const buildVehicleVisual = async (vehicle: VehicleSpec, scene: THREE.Scene, options: VehicleVisualOptions): Promise<VehicleVisual> => {
  const group = new THREE.Group()
  const model = options.loadModel ? await loadVehicleModel(MODEL_SOURCES[vehicle.id]) : undefined
  if (model) group.add(model)
  else addProceduralBody(group, vehicle)
  if (options.role === 'rival') {
    addLampMeshes(group, vehicle.id)
    return { group, headlights: [], headlightTargets: [] }
  }
  addChaseLight(group)
  const { headlights, headlightTargets } = addHeadlights(group, scene, vehicle.id)
  return { group, headlights, headlightTargets }
}

const addLampMeshes = (group: THREE.Group, id: VehicleId): void => {
  const { frontZ, halfWidth } = lampLayout(id)
  const bounds = new THREE.Box3().setFromObject(group)
  const head = new THREE.MeshBasicMaterial({ color: 0xfff4cf })
  const tail = new THREE.MeshBasicMaterial({ color: 0xff2a2a })
  for (const x of [-halfWidth, halfWidth]) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(.26, .14, .05), head)
    front.position.set(x, .5, frontZ - .03)
    const rear = new THREE.Mesh(new THREE.BoxGeometry(.24, .14, .05), tail)
    rear.position.set(x, .6, bounds.max.z + .03)
    group.add(front, rear)
  }
}

const lampLayout = (id: VehicleId): { frontZ: number; halfWidth: number } => ({
  frontZ: id === 'doubleDecker' ? -2.05 : id === 'minibus' ? -1.52 : id === 'tram' ? -1.65 : -1.3,
  halfWidth: id === 'doubleDecker' ? .58 : id === 'minibus' ? .48 : id === 'tram' ? .5 : .4,
})

const loadVehicleModel = async (source: ModelSource): Promise<THREE.Group | undefined> => {
  try {
    const model = source.format === 'fbx' ? await new FBXLoader().loadAsync(source.path) : (await new GLTFLoader().loadAsync(source.path)).scene
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return
      object.castShadow = true
      object.receiveShadow = true
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) {
        if (material instanceof THREE.MeshPhongMaterial) material.shininess = 45
        if (material instanceof THREE.MeshPhongMaterial || material instanceof THREE.MeshStandardMaterial) material.needsUpdate = true
      }
    })
    return source.prepare(model)
  } catch {
    return undefined
  }
}

/** A single light riding above and behind the body keeps the vehicle readable from the chase camera on dark tracks. */
const addChaseLight = (group: THREE.Group): void => {
  const bounds = new THREE.Box3().setFromObject(group)
  const light = new THREE.PointLight(CHASE_LIGHT_COLOR, CHASE_LIGHT_INTENSITY, CHASE_LIGHT_RANGE, 2)
  light.position.set(0, bounds.max.y + CHASE_LIGHT_LIFT, bounds.max.z + CHASE_LIGHT_SETBACK)
  light.castShadow = false
  group.add(light)
}

const addHeadlights = (group: THREE.Group, scene: THREE.Scene, id: VehicleId): Pick<VehicleVisual, 'headlights' | 'headlightTargets'> => {
  const { frontZ, halfWidth } = lampLayout(id)
  const headlights: THREE.SpotLight[] = []
  const headlightTargets: THREE.Object3D[] = []
  for (const x of [-halfWidth, halfWidth]) {
    const light = new THREE.SpotLight(0xfff4cf, 18, 30, Math.PI / 7, .55, 1.5)
    light.position.set(x, .48, frontZ)
    light.castShadow = false
    const target = new THREE.Object3D()
    scene.add(target)
    light.target = target
    group.add(light)
    headlights.push(light)
    headlightTargets.push(target)
  }
  return { headlights, headlightTargets }
}

const addProceduralBody = (group: THREE.Group, vehicle: VehicleSpec): void => {
  const id = vehicle.id
  const bodyMaterial = new THREE.MeshStandardMaterial({ map: createVehicleTexture(id), color: vehicle.color, roughness: .28, metalness: .25 })
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x102e35, roughness: .12, metalness: .35, transparent: true, opacity: .9 })
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xe6e4d5, roughness: .35, metalness: .35 })
  const taxiBlackMaterial = new THREE.MeshStandardMaterial({ color: 0x171b1e, roughness: .3, metalness: .45 })
  const taxiWhiteMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f0df, roughness: .32, metalness: .1 })
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x090909, roughness: .72 })
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    group.add(mesh)
    return mesh
  }
  const wheel = (x: number, z: number): void => {
    const mesh = add(new THREE.CylinderGeometry(.28, .28, .18, 16), wheelMaterial, x, .32, z)
    mesh.rotation.z = Math.PI / 2
  }
  if (id === 'taxi') {
    add(new THREE.BoxGeometry(1.55, .5, 2.5), bodyMaterial, 0, .55, 0)
    add(new THREE.BoxGeometry(1.35, .52, 1.25), bodyMaterial, 0, .99, .15)
    add(new THREE.BoxGeometry(1.36, .28, .05), glassMaterial, 0, 1.05, -.49)
    add(new THREE.BoxGeometry(1.25, .1, .32), taxiWhiteMaterial, 0, 1.42, .18)
    add(new THREE.BoxGeometry(.38, .12, .2), new THREE.MeshBasicMaterial({ color: 0xf1c735 }), 0, 1.53, .18)
    add(new THREE.BoxGeometry(1.48, .34, .08), taxiBlackMaterial, 0, .68, -1.27)
    add(new THREE.BoxGeometry(.72, .08, .05), new THREE.MeshBasicMaterial({ color: 0x687277 }), 0, .76, -1.32)
    add(new THREE.BoxGeometry(.44, .08, .035), new THREE.MeshBasicMaterial({ color: 0xf3f0da }), 0, .56, -1.32)
    add(new THREE.BoxGeometry(.12, .18, .08), taxiBlackMaterial, -.8, 1.03, -.42)
    add(new THREE.BoxGeometry(.12, .18, .08), taxiBlackMaterial, .8, 1.03, -.42)
    for (const x of [-.78, .78]) for (const z of [-.8, .82]) wheel(x, z)
  } else if (id === 'minibus') {
    add(new THREE.BoxGeometry(1.7, .95, 2.45), bodyMaterial, 0, .75, 0)
    add(new THREE.BoxGeometry(1.58, .72, 1.72), bodyMaterial, 0, 1.53, .08)
    add(new THREE.BoxGeometry(1.6, .33, .05), glassMaterial, 0, 1.72, -.79)
    add(new THREE.BoxGeometry(1.73, .08, .08), trimMaterial, 0, .92, -1.24)
    add(new THREE.BoxGeometry(.38, .12, .2), trimMaterial, 0, 2.02, .08)
    for (const x of [-.85, .85]) for (const z of [-.8, .82]) wheel(x, z)
  } else if (id === 'doubleDecker') {
    add(new THREE.BoxGeometry(1.78, .55, 2.85), bodyMaterial, 0, .58, 0)
    add(new THREE.BoxGeometry(1.7, 1.02, 2.72), bodyMaterial, 0, 1.38, .05)
    add(new THREE.BoxGeometry(1.7, .92, 2.7), bodyMaterial, 0, 2.34, .05)
    add(new THREE.BoxGeometry(1.7, .28, .05), glassMaterial, 0, 1.45, -1.34)
    add(new THREE.BoxGeometry(1.7, .27, .05), glassMaterial, 0, 2.4, -1.34)
    add(new THREE.BoxGeometry(1.85, .08, .08), trimMaterial, 0, .86, -1.44)
    add(new THREE.BoxGeometry(.4, .12, .2), new THREE.MeshBasicMaterial({ color: 0xdde9df }), 0, 3.03, .08)
    for (const x of [-.9, .9]) for (const z of [-1, .95]) wheel(x, z)
  } else {
    add(new THREE.BoxGeometry(1.58, .65, 3.25), bodyMaterial, 0, .72, 0)
    add(new THREE.BoxGeometry(1.48, 1.05, 2.96), bodyMaterial, 0, 1.52, .08)
    add(new THREE.BoxGeometry(1.5, .36, .05), glassMaterial, 0, 1.75, -1.49)
    add(new THREE.BoxGeometry(1.7, .09, 3.34), trimMaterial, 0, .38, 0)
    add(new THREE.BoxGeometry(.14, .3, 2.96), trimMaterial, -.77, 1.52, .08)
    add(new THREE.BoxGeometry(.14, .3, 2.96), trimMaterial, .77, 1.52, .08)
    add(new THREE.BoxGeometry(.45, .12, .2), new THREE.MeshBasicMaterial({ color: 0xf0eee2 }), 0, 2.13, .08)
    for (const z of [-1.12, 0, 1.12]) {
      wheel(-.82, z)
      wheel(.82, z)
    }
  }
}

const createVehicleTexture = (vehicle: VehicleId): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return new THREE.CanvasTexture(canvas)
  const base = { taxi: '#d72e35', minibus: '#c92d31', doubleDecker: '#c93b36', tram: '#368269' }[vehicle]
  const accent = { taxi: '#f4cf3d', minibus: '#f0e6d0', doubleDecker: '#f1c44b', tram: '#e7d8a4' }[vehicle]
  context.fillStyle = base
  context.fillRect(0, 0, 256, 256)
  context.fillStyle = accent
  if (vehicle === 'taxi') {
    context.fillStyle = '#f2f0df'
    context.fillRect(0, 0, 256, 42)
    context.fillStyle = '#171b1e'
    context.fillRect(0, 198, 256, 58)
    context.fillStyle = accent
    for (let x = 0; x < 256; x += 32) context.fillRect(x, 82, 16, 18)
    context.fillRect(0, 176, 256, 14)
  }
  if (vehicle === 'minibus') {
    context.fillRect(0, 86, 256, 16)
    context.fillRect(0, 168, 256, 12)
    for (let x = 12; x < 256; x += 42) context.fillRect(x, 118, 20, 38)
  }
  if (vehicle === 'doubleDecker') {
    context.fillRect(0, 120, 256, 14)
    for (let x = 8; x < 256; x += 42) {
      context.fillStyle = '#172027'
      context.fillRect(x, 32, 28, 62)
      context.fillRect(x, 144, 28, 50)
      context.fillStyle = accent
    }
  }
  if (vehicle === 'tram') {
    context.fillRect(0, 96, 256, 15)
    context.fillRect(0, 168, 256, 11)
    for (let x = 10; x < 256; x += 45) {
      context.fillStyle = '#122d29'
      context.fillRect(x, 34, 28, 45)
      context.fillRect(x, 120, 28, 38)
      context.fillStyle = accent
    }
  }
  context.strokeStyle = 'rgba(255,255,255,.2)'
  context.lineWidth = 2
  for (let x = 0; x <= 256; x += 32) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, 256)
    context.stroke()
  }
  for (let y = 0; y <= 256; y += 32) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(256, y)
    context.stroke()
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
