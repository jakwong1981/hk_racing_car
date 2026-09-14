import RAPIER from '@dimforge/rapier3d-compat'
import { beforeAll, describe, expect, it } from 'vitest'
import { hoverForceFor } from './physicsModel'

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
})
