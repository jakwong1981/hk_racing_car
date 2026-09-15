import type { ControlState } from '../types/game'

type ContinuousControl = Exclude<keyof ControlState, 'headlights'>
const keys: Record<ContinuousControl, readonly string[]> = { accelerate:['ArrowUp','KeyW'], brake:['ArrowDown','KeyS','KeyB'], left:['ArrowLeft','KeyA'], right:['ArrowRight','KeyD'], drift:['Space'] }

export class InputManager {
  readonly state: ControlState = { accelerate:false, brake:false, left:false, right:false, drift:false, headlights:true }
  private readonly down = (event: KeyboardEvent) => this.set(event, true)
  private readonly up = (event: KeyboardEvent) => this.set(event, false)
  connect(): void { window.addEventListener('keydown', this.down); window.addEventListener('keyup', this.up) }
  disconnect(): void { window.removeEventListener('keydown', this.down); window.removeEventListener('keyup', this.up) }
  setControl(control: keyof ControlState, active: boolean): void { this.state[control] = active }
  toggleHeadlights(): void { this.state.headlights = !this.state.headlights }
  reset(): void { this.state.accelerate=false; this.state.brake=false; this.state.left=false; this.state.right=false; this.state.drift=false }
  private set(event: KeyboardEvent, active: boolean): void {
    if (active && !event.repeat && event.code === 'KeyL') { event.preventDefault(); this.toggleHeadlights(); return }
    for (const [control, codes] of Object.entries(keys)) if (codes.includes(event.code)) { event.preventDefault(); this.state[control as ContinuousControl] = active }
  }
}
