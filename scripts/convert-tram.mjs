import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

const sourcePath = new URL('../public/models/tram/HK_Tram.fbx', import.meta.url)
const outputPath = new URL('../public/models/tram/HK_Tram.glb', import.meta.url)
const embeddedImages = []

globalThis.window = {
  URL: {
    createObjectURL(blob) {
      embeddedImages.push(blob)
      return `blob:tram-texture-${embeddedImages.length - 1}`
    },
  },
}
globalThis.document = {
  createElementNS: () => ({
    addEventListener(type, listener) { if (type === 'load') this.load = listener },
    removeEventListener() {},
    set src(value) { this.source = value; queueMicrotask(() => this.load?.()) },
  }),
}
globalThis.FileReader = class {
  result = null
  onloadend = null
  onerror = null

  readAsArrayBuffer(blob) {
    blob.arrayBuffer()
      .then(buffer => { this.result = buffer; this.onloadend?.() })
      .catch(error => this.onerror?.(error))
  }
}

const alignFour = value => (value + 3) & ~3

const optimizeTextures = async () => {
  const workingDirectory = await mkdtemp(join(tmpdir(), 'hk-tram-'))
  try {
    const optimized = []
    for (let index = 0; index < embeddedImages.length; index += 1) {
      const source = join(workingDirectory, `source-${index}.jpg`)
      const output = join(workingDirectory, `optimized-${index}.jpg`)
      await writeFile(source, new Uint8Array(await embeddedImages[index].arrayBuffer()))
      const conversion = spawnSync('ffmpeg', ['-loglevel','error','-y','-i',source,'-vf','scale=1024:1024:force_original_aspect_ratio=decrease','-q:v','3',output])
      if (conversion.status !== 0) throw new Error(`ffmpeg failed for tram texture ${index}: ${conversion.stderr.toString()}`)
      optimized.push(await readFile(output))
    }
    return optimized
  } finally {
    await rm(workingDirectory, { recursive:true, force:true })
  }
}

const embedTextures = (arrayBuffer, images) => {
  const source = Buffer.from(arrayBuffer)
  const jsonLength = source.readUInt32LE(12)
  const json = JSON.parse(source.subarray(20, 20 + jsonLength).toString().trim())
  const binaryHeaderOffset = 20 + jsonLength
  const binaryLength = source.readUInt32LE(binaryHeaderOffset)
  const binary = source.subarray(binaryHeaderOffset + 8, binaryHeaderOffset + 8 + binaryLength)
  const binaryParts = [binary]
  let byteOffset = binary.length

  json.images = []
  json.textures = []
  json.samplers = [{ magFilter:9729, minFilter:9987, wrapS:10497, wrapT:10497 }]
  for (const [index, image] of images.entries()) {
    json.bufferViews.push({ buffer:0, byteOffset, byteLength:image.length })
    json.images.push({ bufferView:json.bufferViews.length - 1, mimeType:'image/jpeg', name:`tram-texture-${index}` })
    json.textures.push({ sampler:0, source:index })
    binaryParts.push(image)
    byteOffset += image.length
    const padding = alignFour(byteOffset) - byteOffset
    if (padding > 0) {
      binaryParts.push(Buffer.alloc(padding))
      byteOffset += padding
    }
  }

  const materialTextures = new Map([[0,0],[1,1],[2,2],[4,3]])
  for (const [materialIndex, textureIndex] of materialTextures) {
    json.materials[materialIndex].pbrMetallicRoughness.baseColorFactor = [1,1,1,1]
    json.materials[materialIndex].pbrMetallicRoughness.baseColorTexture = { index:textureIndex }
  }
  json.materials[5].emissiveFactor = [1,.85,.55]
  json.buffers[0].byteLength = byteOffset

  const jsonSource = Buffer.from(JSON.stringify(json))
  const paddedJson = Buffer.concat([jsonSource, Buffer.alloc(alignFour(jsonSource.length) - jsonSource.length, 0x20)])
  const paddedBinary = Buffer.concat(binaryParts)
  const result = Buffer.alloc(12 + 8 + paddedJson.length + 8 + paddedBinary.length)
  result.writeUInt32LE(0x46546c67, 0)
  result.writeUInt32LE(2, 4)
  result.writeUInt32LE(result.length, 8)
  result.writeUInt32LE(paddedJson.length, 12)
  result.writeUInt32LE(0x4e4f534a, 16)
  paddedJson.copy(result, 20)
  const outputBinaryHeader = 20 + paddedJson.length
  result.writeUInt32LE(paddedBinary.length, outputBinaryHeader)
  result.writeUInt32LE(0x004e4942, outputBinaryHeader + 4)
  paddedBinary.copy(result, outputBinaryHeader + 8)
  return result
}

const source = await readFile(sourcePath)
const sourceBuffer = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
const model = new FBXLoader().parse(sourceBuffer, '')

model.traverse(object => {
  if (!(object instanceof THREE.Mesh)) return
  object.geometry = mergeVertices(object.geometry, .0001)
  const materials = Array.isArray(object.material) ? object.material : [object.material]
  for (const material of materials) {
    if (material instanceof THREE.MeshPhongMaterial) {
      material.map = null
      material.shininess = 35
      material.needsUpdate = true
    }
  }
})

const binary = await new GLTFExporter().parseAsync(model, { binary:true, onlyVisible:false })
if (!(binary instanceof ArrayBuffer)) throw new Error('Expected binary GLB output')
const optimizedImages = await optimizeTextures()
await writeFile(outputPath, embedTextures(binary, optimizedImages))
