import { describe, expect, it } from 'vitest'
import { InputManager } from './InputManager'

describe('InputManager', () => {
  it('toggles headlights without changing the driving controls', () => {
    const input = new InputManager()
    input.setControl('accelerate', true)

    expect(input.state.headlights).toBe(true)
    input.toggleHeadlights()

    expect(input.state.headlights).toBe(false)
    expect(input.state.accelerate).toBe(true)
  })

  it('clears transient controls while preserving the selected headlight state', () => {
    const input = new InputManager()
    input.setControl('left', true)
    input.setControl('drift', true)
    input.toggleHeadlights()

    input.reset()

    expect(input.state.left).toBe(false)
    expect(input.state.drift).toBe(false)
    expect(input.state.headlights).toBe(false)
  })
})
