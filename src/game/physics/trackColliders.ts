import RAPIER from '@dimforge/rapier3d-compat'
import type { TrackPath } from '../track/trackPath'
import { stripMeshData, type StripSpec } from '../track/trackStrip'

export interface SurfaceResponse { friction: number; restitution: number }

export const ROAD_SURFACE: SurfaceResponse = { friction: .9, restitution: 0 }
/** Low friction and high restitution preserve horizontal momentum so impacts rebound instead of sticking. */
export const REBOUND_SURFACE: SurfaceResponse = { friction: .15, restitution: .72 }

export const addStripCollider = (world: RAPIER.World, path: TrackPath, spec: StripSpec, surface: SurfaceResponse): void => {
  const data = stripMeshData(path, spec)
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  world.createCollider(RAPIER.ColliderDesc.trimesh(data.positions, data.indices).setFriction(surface.friction).setRestitution(surface.restitution), body)
}

export interface OrientedBox { x: number; y: number; z: number; yaw: number; halfWidth: number; halfHeight: number; halfDepth: number }

export const addBoxCollider = (world: RAPIER.World, box: OrientedBox, surface: SurfaceResponse): void => {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
  const rotation = { x: 0, y: Math.sin(box.yaw / 2), z: 0, w: Math.cos(box.yaw / 2) }
  world.createCollider(RAPIER.ColliderDesc.cuboid(box.halfWidth, box.halfHeight, box.halfDepth).setTranslation(box.x, box.y, box.z).setRotation(rotation).setFriction(surface.friction).setRestitution(surface.restitution), body)
}
