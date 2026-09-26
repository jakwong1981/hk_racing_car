import { describe, expect, it } from 'vitest'
import { opponentsFor, VEHICLES } from './gameConfig'

describe('opponent grid', () => {
  it.each(VEHICLES.map(vehicle => vehicle.id))('fields three rivals in vehicles other than the player\'s %s', player => {
    const rivals = opponentsFor(player)
    const vehicles = rivals.map(rival => rival.vehicle)
    expect(rivals).toHaveLength(3)
    expect(vehicles).not.toContain(player)
    expect(new Set(vehicles).size).toBe(3)
  })
})
