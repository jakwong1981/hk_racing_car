import * as THREE from 'three'

const VOLUME = { width: 44, height: 26, depth: 44 }
const FALL_SPEED = 34
const STREAK_LENGTH = .9
const WIND_DRIFT = 3

/** Rain streaks live in a box that follows the camera and wraps, so a fixed pool covers the whole circuit. */
export class RainEffect {
  private readonly geometry = new THREE.BufferGeometry()
  private readonly material = new THREE.LineBasicMaterial({ color: 0xa9c3ff, transparent: true, opacity: 0, depthWrite: false })
  private readonly offsets: Float32Array
  private readonly positions: Float32Array
  private readonly lines: THREE.LineSegments

  constructor(scene: THREE.Scene, private readonly count: number) {
    this.offsets = new Float32Array(count * 3)
    this.positions = new Float32Array(count * 6)
    for (let index = 0; index < count; index += 1) {
      this.offsets.set([Math.random() * VOLUME.width, Math.random() * VOLUME.height, Math.random() * VOLUME.depth], index * 3)
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    this.lines = new THREE.LineSegments(this.geometry, this.material)
    this.lines.frustumCulled = false
    this.lines.visible = false
    scene.add(this.lines)
  }

  update(dt: number, intensity: number, camera: THREE.Camera): void {
    this.material.opacity = .55 * intensity
    this.lines.visible = intensity > .01
    if (!this.lines.visible) return
    const origin = camera.position
    for (let index = 0; index < this.count; index += 1) {
      const base = index * 3
      const y = wrap((this.offsets[base + 1] ?? 0) - FALL_SPEED * dt, VOLUME.height)
      const x = wrap((this.offsets[base] ?? 0) + WIND_DRIFT * dt, VOLUME.width)
      this.offsets[base] = x
      this.offsets[base + 1] = y
      const worldX = origin.x - VOLUME.width / 2 + wrap(x - origin.x, VOLUME.width)
      const worldY = origin.y - VOLUME.height / 2 + y
      const worldZ = origin.z - VOLUME.depth / 2 + wrap((this.offsets[base + 2] ?? 0) - origin.z, VOLUME.depth)
      this.positions.set([worldX, worldY, worldZ, worldX - WIND_DRIFT * .03, worldY - STREAK_LENGTH, worldZ], index * 6)
    }
    this.geometry.attributes.position!.needsUpdate = true
  }
}

const wrap = (value: number, size: number): number => ((value % size) + size) % size
