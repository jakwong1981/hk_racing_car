import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { addStripCollider, ROAD_SURFACE } from './physics/trackColliders'
import { HOVER_HEIGHT, hoverForceFor } from './physicsModel'
import { TrackPath } from './track/trackPath'

beforeAll(async () => {
  await RAPIER.init()
})

describe('Rapier hover integration', () => {
  it('settles without accumulating forces between fixed steps', () => {
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 })
    world.timestep = 1 / 60
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(16, .25, 170).setTranslation(0, -.25, -140), ground)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.1, 8).setLinearDamping(.25).lockRotations())
    const collider = world.createCollider(RAPIER.ColliderDesc.ball(.85).setDensity(1), body)
    const settledHeights: number[] = []

    for (let step = 0; step < 600; step += 1) {
      body.resetForces(true)
      const velocity = body.linvel()
      const ray = new RAPIER.Ray(body.translation(), { x: 0, y: -1, z: 0 })
      const hit = world.castRay(ray, 2.2, true, undefined, undefined, collider, body)
      if (hit) body.addForce({ x: 0, y: hoverForceFor(body.mass(), 18, hit.timeOfImpact, velocity.y), z: 0 }, true)
      world.step()
      if (step >= 480) settledHeights.push(body.translation().y)
    }

    expect(Math.max(...settledHeights) - Math.min(...settledHeights)).toBeLessThan(.001)
  })

  it('returns momentum from a high-restitution building collider', () => {
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 })
    world.timestep = 1 / 60
    const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(8, .25, 8).setTranslation(0, -.25, 0), ground)
    const wall = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(RAPIER.ColliderDesc.cuboid(.25, 2, 2).setTranslation(2, 1, 0).setFriction(.15).setRestitution(.72), wall)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1.1, 0).lockRotations())
    world.createCollider(RAPIER.ColliderDesc.ball(.85).setDensity(1).setRestitution(.42), body)
    body.setLinvel({ x: 8, y: 0, z: 0 }, true)

    let reboundObserved = false
    let furthestX = body.translation().x
    for (let step = 0; step < 90; step += 1) {
      world.step()
      furthestX = Math.max(furthestX, body.translation().x)
      reboundObserved ||= body.linvel().x < -0.1
    }

    expect(furthestX).toBeLessThan(2.9)
    expect(reboundObserved).toBe(true)
  })

  it('hovers at a constant clearance over a sloped trimesh road strip', () => {
    const world = new RAPIER.World({ x: 0, y: -18, z: 0 })
    world.timestep = 1 / 60
    const ramp = TrackPath.fromControlPoints([{ x: 0, y: 0, z: 0 }, { x: 0, y: 4, z: -50 }, { x: 0, y: 8, z: -100 }], false)
    addStripCollider(world, ramp, { fromS: 0, toS: ramp.length, step: 2, left: { lateral: -8, height: 0 }, right: { lateral: 8, height: 0 } }, ROAD_SURFACE)
    const start = ramp.pointAt(50, 0, 1.1)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setLinearDamping(.25).lockRotations())
    const collider = world.createCollider(RAPIER.ColliderDesc.ball(.85).setDensity(1), body)

    for (let step = 0; step < 600; step += 1) {
      body.resetForces(true)
      const ray = new RAPIER.Ray(body.translation(), { x: 0, y: -1, z: 0 })
      const hit = world.castRay(ray, 2.2, true, undefined, undefined, collider, body)
      if (hit) body.addForce({ x: 0, y: hoverForceFor(body.mass(), 18, hit.timeOfImpact, body.linvel().y), z: 0 }, true)
      world.step()
    }

    expect(ramp.project(body.translation()).vertical).toBeCloseTo(HOVER_HEIGHT, 1)
  })
})
