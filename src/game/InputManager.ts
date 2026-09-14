import type { ControlState } from '../types/game'

const keys: Record<keyof ControlState, readonly string[]> = { accelerate:['ArrowUp','KeyW'], brake:['ArrowDown','KeyS','KeyB'], left:['ArrowLeft','KeyA'], right:['ArrowRight','KeyD'], drift:['Space'] }

export class InputManager {
  readonly state: ControlState = { accelerate:false, brake:false, left:false, right:false, drift:false }
  private readonly down = (event: KeyboardEvent) => this.set(event, true)
  private readonly up = (event: KeyboardEvent) => this.set(event, false)
  connect(): void { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up) }
  disconnect(): void { window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up) }
  setControl(control: keyof ControlState, active: boolean): void { this.state[control] = active }
  reset(): void { Object.keys(this.state).forEach(key => { this.state[key as keyof ControlState] = false }) }
  private set(event: KeyboardEvent, active: boolean): void { for (const [control, codes] of Object.entries(keys)) if (codes.includes(event.code)) { event.preventDefault(); this.state[control as keyof ControlState] = active } }
}
