import { describe, expect, it } from 'vitest'
import { knockProp, standingProp, stepProp, type PropBody } from './propDebris'

const random = (): number => .5
const barrel = (): PropBody => standingProp({ x: 0, y: .5, z: 0 })

describe('prop debris', () => {
  it('launches a prop when a moving car reaches it', () => {
    const hit = knockProp(barrel(), { x: 0, y: 1.05, z: 1 }, { x: 0, y: 0, z: -20 }, random)
    expect(hit.state).toBe('flying')
    expect(hit.velocity.z).toBeLessThan(-20)
    expect(hit.velocity.y).toBeGreaterThan(0)
  })

  it('ignores distant or crawling cars', () => {
    expect(knockProp(barrel(), { x: 5, y: 1, z: 0 }, { x: 0, y: 0, z: -20 }, random).state).toBe('standing')
    expect(knockProp(barrel(), { x: 0, y: 1, z: .5 }, { x: 0, y: 0, z: -1 }, random).state).toBe('standing')
  })

  it('does not mutate the car velocity it reads', () => {
    const carVelocity = Object.freeze({ x: 3, y: 0, z: -25 })
    knockProp(barrel(), { x: 0, y: 1, z: .5 }, carVelocity, random)
    expect(carVelocity).toEqual({ x: 3, y: 0, z: -25 })
  })

  it('bounces and comes to rest lying on the road', () => {
    let prop = knockProp(barrel(), { x: 0, y: 1, z: .5 }, { x: 0, y: 0, z: -20 }, random)
    for (let frame = 0; frame < 600 && prop.state === 'flying'; frame += 1) prop = stepProp(prop, 1 / 60)
    expect(prop.state).toBe('resting')
    expect(prop.position.y).toBe(prop.restY)
    expect(prop.rotation.x).toBeCloseTo(Math.PI / 2)
    expect(prop.position.z).toBeLessThan(-5)
  })
})
