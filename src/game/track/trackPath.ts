import { CatmullRomCurve3, Vector3 } from 'three'
import type { TrackControlPoint } from '../../types/game'

export interface TrackPoint { x: number; y: number; z: number }
export interface TrackSample extends TrackPoint { s: number; yaw: number; grade: number }
export interface TrackProjection { s: number; lateral: number; vertical: number }

const SAMPLE_SPACING = 1
const LOCAL_SEARCH_SAMPLES = 60
const LOCAL_SEARCH_MAX_DISTANCE = 30
const VERTICAL_SEARCH_WEIGHT = 2

// Heading follows the vehicle convention: forward = (-sin yaw, 0, -cos yaw), right = (cos yaw, 0, -sin yaw).
export const yawForDirection = (dx: number, dz: number): number => Math.atan2(-dx, -dz)
export const forwardForYaw = (yaw: number): TrackPoint => ({ x: -Math.sin(yaw), y: 0, z: -Math.cos(yaw) })
export const rightForYaw = (yaw: number): TrackPoint => ({ x: Math.cos(yaw), y: 0, z: -Math.sin(yaw) })

export class TrackPath {
  readonly length: number
  private readonly samples: readonly TrackSample[]

  private constructor(readonly closed: boolean, samples: readonly TrackSample[], length: number) {
    this.samples = samples
    this.length = length
  }

  static fromControlPoints(points: readonly TrackControlPoint[], closed: boolean): TrackPath {
    if (points.length < (closed ? 3 : 2)) throw new Error(`Track path needs at least ${closed ? 3 : 2} control points, received ${points.length}`)
    const curve = new CatmullRomCurve3(points.map(point => new Vector3(point.x, point.y, point.z)), closed, 'centripetal')
    curve.arcLengthDivisions = points.length * 60
    const length = curve.getLength()
    const count = Math.max(2, Math.round(length / SAMPLE_SPACING))
    const spacing = length / count
    const sampleCount = closed ? count : count + 1
    const samples: TrackSample[] = []
    for (let index = 0; index < sampleCount; index += 1) {
      const u = index / count
      const position = curve.getPointAt(u)
      const tangent = curve.getTangentAt(u)
      const horizontal = Math.hypot(tangent.x, tangent.z)
      samples.push({ s: index * spacing, x: position.x, y: position.y, z: position.z, yaw: yawForDirection(tangent.x, tangent.z), grade: tangent.y / horizontal })
    }
    return new TrackPath(closed, samples, length)
  }

  normalizeS(s: number): number {
    if (!this.closed) return Math.min(this.length, Math.max(0, s))
    return ((s % this.length) + this.length) % this.length
  }

  signedDistance(fromS: number, toS: number): number {
    const difference = toS - fromS
    if (!this.closed) return difference
    const wrapped = ((difference % this.length) + this.length) % this.length
    return wrapped > this.length / 2 ? wrapped - this.length : wrapped
  }

  sampleAt(s: number): TrackSample {
    const normalized = this.normalizeS(s)
    const position = normalized / this.spacing
    const lowerIndex = Math.min(Math.floor(position), this.lastSegmentIndex)
    const fraction = position - lowerIndex
    const lower = this.sampleAtIndex(lowerIndex)
    const upper = this.sampleAtIndex(lowerIndex + 1)
    const sinYaw = lerp(Math.sin(lower.yaw), Math.sin(upper.yaw), fraction)
    const cosYaw = lerp(Math.cos(lower.yaw), Math.cos(upper.yaw), fraction)
    return {
      s: normalized,
      x: lerp(lower.x, upper.x, fraction),
      y: lerp(lower.y, upper.y, fraction),
      z: lerp(lower.z, upper.z, fraction),
      yaw: Math.atan2(sinYaw, cosYaw),
      grade: lerp(lower.grade, upper.grade, fraction),
    }
  }

  pointAt(s: number, lateral = 0, height = 0): TrackPoint {
    const sample = this.sampleAt(s)
    const right = rightForYaw(sample.yaw)
    return { x: sample.x + right.x * lateral, y: sample.y + height, z: sample.z + right.z * lateral }
  }

  project(point: TrackPoint, hintS?: number): TrackProjection {
    const localIndex = hintS === undefined ? undefined : this.nearestIndex(point, this.indexWindowAround(hintS))
    const nearest = localIndex !== undefined && this.planarDistance(point, this.sampleAtIndex(localIndex)) <= LOCAL_SEARCH_MAX_DISTANCE
      ? localIndex
      : this.nearestIndex(point, this.allIndices())
    const sample = this.sampleAtIndex(nearest)
    const forward = forwardForYaw(sample.yaw)
    const along = (point.x - sample.x) * forward.x + (point.z - sample.z) * forward.z
    const clampedAlong = Math.max(-this.spacing, Math.min(this.spacing, along))
    const s = this.normalizeS(sample.s + clampedAlong)
    const center = this.sampleAt(s)
    const right = rightForYaw(center.yaw)
    return { s, lateral: (point.x - center.x) * right.x + (point.z - center.z) * right.z, vertical: point.y - center.y }
  }

  private get spacing(): number {
    return this.length / (this.closed ? this.samples.length : this.samples.length - 1)
  }

  private get lastSegmentIndex(): number {
    return this.closed ? this.samples.length - 1 : this.samples.length - 2
  }

  private sampleAtIndex(index: number): TrackSample {
    const count = this.samples.length
    const wrapped = this.closed ? ((index % count) + count) % count : Math.min(count - 1, Math.max(0, index))
    const sample = this.samples[wrapped]
    if (!sample) throw new Error(`Track sample ${index} is outside the ${count}-sample path`)
    if (this.closed && index >= count) return { ...sample, s: sample.s + this.length }
    return sample
  }

  private indexWindowAround(s: number): number[] {
    const center = Math.round(this.normalizeS(s) / this.spacing)
    const indices: number[] = []
    for (let offset = -LOCAL_SEARCH_SAMPLES; offset <= LOCAL_SEARCH_SAMPLES; offset += 1) {
      const index = center + offset
      if (this.closed) indices.push(((index % this.samples.length) + this.samples.length) % this.samples.length)
      else if (index >= 0 && index < this.samples.length) indices.push(index)
    }
    return indices
  }

  private allIndices(): number[] {
    return this.samples.map((_, index) => index)
  }

  private nearestIndex(point: TrackPoint, indices: readonly number[]): number {
    let bestIndex = indices[0] ?? 0
    let bestScore = Number.POSITIVE_INFINITY
    for (const index of indices) {
      const sample = this.sampleAtIndex(index)
      const verticalGap = (point.y - sample.y) * VERTICAL_SEARCH_WEIGHT
      const score = (point.x - sample.x) ** 2 + (point.z - sample.z) ** 2 + verticalGap ** 2
      if (score < bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
    return bestIndex
  }

  private planarDistance(point: TrackPoint, sample: TrackSample): number {
    return Math.hypot(point.x - sample.x, point.z - sample.z)
  }
}

const lerp = (from: number, to: number, fraction: number): number => from + (to - from) * fraction
