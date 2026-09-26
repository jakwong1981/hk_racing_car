import * as THREE from 'three'
import type { TrackPath } from '../track/trackPath'
import { stripMeshData, type StripSpec } from '../track/trackStrip'

export const createStripMesh = (path: TrackPath, spec: StripSpec, material: THREE.Material): THREE.Mesh => {
  const data = stripMeshData(path, spec)
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
  geometry.setIndex(new THREE.BufferAttribute(data.indices, 1))
  geometry.computeVertexNormals()
  return new THREE.Mesh(geometry, material)
}

export const createFinishLine = (path: TrackPath, s: number, width: number, maxAnisotropy: number): THREE.Mesh => {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 200
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable for the finish-line texture')
  context.imageSmoothingEnabled = false
  const columns = 12
  const rows = 2
  const tileWidth = canvas.width / columns
  const tileHeight = canvas.height / rows
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      context.fillStyle = (row + column) % 2 === 0 ? '#f5f5f2' : '#111315'
      context.fillRect(column * tileWidth, row * tileHeight, tileWidth, tileHeight)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  const halfWidth = width / 2
  const halfDepth = 2.5
  const finishLine = createStripMesh(path, { fromS: s - halfDepth, toS: s + halfDepth, step: halfDepth * 2, left: { lateral: -halfWidth, height: .045 }, right: { lateral: halfWidth, height: .045 }, uvLength: halfDepth * 2 }, new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }))
  finishLine.renderOrder = 3
  return finishLine
}
