// scripts/e2e_drive.mjs
// Headless end-to-end driver: launches Chrome, starts a race, drives with real
// key events, and reports speed/lap telemetry read from the live DOM.
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const TARGET_URL = process.env.GAME_URL ?? 'http://127.0.0.1:8099/'
const VEHICLE = process.env.VEHICLE ?? 'tram'
const DIFFICULTY = process.env.DIFFICULTY ?? 'professional'
const DRIVE_SECONDS = Number(process.env.DRIVE_SECONDS ?? 45)
const PORT = Number(process.env.CDP_PORT ?? 9333)
const CHROME = process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const profile = await mkdtemp(join(tmpdir(), 'ndhk-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--enable-unsafe-swiftshader', // software WebGL so 3D actually renders headless
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + PORT,
  '--window-size=1280,800',
  'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

const cleanup = () => { try { chrome.kill('SIGKILL') } catch {} }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

async function debuggerUrl() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`)
      const body = await res.json()
      if (body.webSocketDebuggerUrl) return body.webSocketDebuggerUrl
    } catch {}
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint never came up')
}

const ws = new WebSocket(await debuggerUrl())
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })

let nextId = 1
const pending = new Map()
const consoleErrors = []
const pageErrors = []

ws.onmessage = event => {
  const message = JSON.parse(event.data)
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id)
    pending.delete(message.id)
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result)
    return
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map(a => a.value ?? a.description).join(' '))
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text)
  }
}

// Target the first real page, not the about:blank that --headless opens.
const { targetInfos } = await send('Target.getTargets')
const page = targetInfos.find(t => t.type === 'page')
const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })

function send(method, params = {}, useSession = true) {
  const id = nextId++
  const payload = { id, method, params }
  if (useSession && sessionId) payload.sessionId = sessionId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify(payload))
  })
}

// Attach calls must precede page-scoped ones, so re-issue the target lookup.
async function setup() {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Log.enable')
}

const evaluate = async expression => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'eval failed')
  return result.result.value
}

const KEYS = {
  up: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
  down: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
  left: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
  right: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
  space: { key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 },
}
const keyEvent = (type, name) => send('Input.dispatchKeyEvent', {
  type, key: KEYS[name].key, code: KEYS[name].code, windowsVirtualKeyCode: KEYS[name].windowsVirtualKeyCode,
  nativeVirtualKeyCode: KEYS[name].nativeVirtualKeyCode, text: type === 'keyDown' && name === 'space' ? ' ' : undefined,
})

await setup()
await send('Page.navigate', { url: TARGET_URL })
await sleep(3500)

const telemetry = () => evaluate(`(() => {
  const speed = document.querySelector('.speedometer strong')?.textContent?.trim() ?? null
  const lap = document.querySelector('.lap b')?.textContent?.trim() ?? null
  const timer = document.querySelector('.timer b')?.textContent?.trim() ?? null
  const position = document.querySelector('.position b')?.textContent?.trim() ?? null
  const modal = document.querySelector('.modal h2')?.textContent?.trim() ?? null
  const countdown = document.querySelector('.countdown span')?.textContent?.trim() ?? null
  const canvas = document.querySelector('canvas')
  return { speed, lap, timer, position, modal, countdown,
           canvasSize: canvas ? canvas.width + 'x' + canvas.height : null,
           phase: modal ? 'finished/paused' : (countdown ? 'countdown' : 'setup-or-racing') }
})()`)

console.log('— setup screen —')
console.log(JSON.stringify(await telemetry(), null, 2))

// Pick the vehicle and difficulty from the setup list.
const picked = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('.vehicle-list button, .difficulty-list button')]
  const wanted = ['${VEHICLE}', '${DIFFICULTY}']
  let chosen = []
  for (const want of wanted) {
    const target = buttons.find(b => b.className.includes(want)) ?? null
    if (target) { target.click(); chosen.push(want) }
  }
  return { chosen, available: buttons.map(b => b.className) }
})()`)
console.log('— selection —')
console.log(JSON.stringify(picked, null, 2))

const started = await evaluate(`(() => {
  const button = [...document.querySelectorAll('button')].find(b => b.textContent.includes('START ENGINE'))
  if (!button) return false
  button.click()
  return true
})()`)
console.log('start clicked:', started)

await sleep(1200)
console.log('— countdown —')
console.log(JSON.stringify(await telemetry(), null, 2))

// Hold accelerate; sample speed over time. Release briefly on a periodic beat so
// the lap logic sees a varying throttle rather than one constant force.
await keyEvent('keyDown', 'up')
const samples = []
const started_at = Date.now()
let finishing = null

while ((Date.now() - started_at) / 1000 < DRIVE_SECONDS) {
  await sleep(1000)
  const snapshot = await telemetry()
  samples.push({ t: ((Date.now() - started_at) / 1000).toFixed(0) + 's', ...snapshot })
  if (snapshot.modal) { finishing = snapshot; break }
}

await keyEvent('keyUp', 'up')

console.log('— telemetry samples —')
console.table(samples.filter((_, i) => i % 3 === 0 || i === samples.length - 1))

const final = finishing ?? await telemetry()
const canvasInfo = await evaluate(`(() => {
  const c = document.querySelector('canvas')
  if (!c) return null
  const gl = c.getContext('webgl2') ?? c.getContext('webgl')
  return { width: c.width, height: c.height, context: gl ? 'webgl ok' : 'no context',
           renderer: gl ? gl.getParameter(gl.RENDERER) : null }
})()`)

console.log('— result —')
console.log(JSON.stringify({ final, canvas: canvasInfo, consoleErrors, pageErrors }, null, 2))

cleanup()
process.exit(0)
