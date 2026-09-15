<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { Gauge, Lightbulb, Pause, Play, RotateCcw, Volume2, VolumeX, Zap } from 'lucide-vue-next'
import VehicleIcon from './components/VehicleIcon.vue'
import taxiPhoto from './assets/taxi-transparent.png'
import minibusPhoto from './assets/minibus-transparent.png'
import doubleDeckerPhoto from './assets/double-decker-transparent.png'
import tramPhoto from './assets/tram-transparent.png'
import { DIFFICULTIES, VEHICLES } from './config/gameConfig'
import { GameEngine } from './game/GameEngine'
import { InputManager } from './game/InputManager'
import { formatRaceTime } from './game/raceLogic'
import type { DifficultyId, LeaderboardEntry, RaceTelemetry, VehicleId } from './types/game'

const canvas = ref<HTMLCanvasElement>()
const selectedVehicle = ref<VehicleId>('taxi')
const selectedDifficulty = ref<DifficultyId>('probationary')
const countdown = ref(3)
const muted = ref(false)
const telemetry = reactive<RaceTelemetry>({ phase:'setup',speedKmh:0,lap:1,totalLaps:2,checkpoint:1,raceTimeMs:0,position:3,driftStage:0,driftCharge:0,seamlessRemainingMs:0,headlightsOn:true })
const leaderboard = computed<LeaderboardEntry[]>(() => [
  {id:'1',name:'夜更阿明',vehicle:'minibus',timeMs:telemetry.raceTimeMs-1850},
  {id:'2',name:'KOWLOON KID',vehicle:'tram',timeMs:telemetry.raceTimeMs-730},
  {id:'you',name:'YOU 你',vehicle:selectedVehicle.value,timeMs:telemetry.raceTimeMs,isPlayer:true},
  {id:'4',name:'港島速遞',vehicle:'doubleDecker',timeMs:telemetry.raceTimeMs+1210},
])
const currentVehicle = computed(() => VEHICLES.find(vehicle => vehicle.id===selectedVehicle.value) ?? VEHICLES[0])
const currentDifficulty = computed(() => DIFFICULTIES.find(difficulty => difficulty.id===selectedDifficulty.value) ?? DIFFICULTIES[1])
const vehiclePhotos: Partial<Record<VehicleId, string>> = { taxi:taxiPhoto,minibus:minibusPhoto,doubleDecker:doubleDeckerPhoto,tram:tramPhoto }
const input = new InputManager()
let engine: GameEngine | undefined
let countdownTimer: number | undefined

const startRace = async (): Promise<void> => {
  telemetry.phase='countdown'
  countdown.value=3
  window.clearInterval(countdownTimer)
  engine?.destroy()
  if(!canvas.value)return
  engine=new GameEngine({canvas:canvas.value,vehicle:currentVehicle.value,difficulty:currentDifficulty.value,controls:input.state,telemetry,onFinish:finishRace})
  engine.setMuted(muted.value)
  await nextTick()
  await engine.start()
  input.connect()
  countdownTimer=window.setInterval(()=>{countdown.value--;if(countdown.value<=0){window.clearInterval(countdownTimer);telemetry.phase='racing'}},720)
}
const finishRace = ():void => { telemetry.phase='finished'; input.reset() }
const restart = ():void => { telemetry.speedKmh=0;telemetry.lap=1;telemetry.raceTimeMs=0;telemetry.driftCharge=0;telemetry.seamlessRemainingMs=0;void startRace() }
const returnToSetup = ():void => { telemetry.phase='setup';engine?.destroy();engine=undefined;input.disconnect() }
const togglePause = ():void => { telemetry.phase=telemetry.phase==='paused'?'racing':'paused';input.reset() }
const setTouch = (control:'accelerate'|'brake'|'left'|'right'|'drift',active:boolean):void => input.setControl(control,active)
const toggleLights = ():void => input.toggleHeadlights()
const toggleAudio = ():void => { muted.value=!muted.value; engine?.setMuted(muted.value) }
onBeforeUnmount(()=>{engine?.destroy();input.disconnect();window.clearInterval(countdownTimer)})
</script>

<template>
  <main class="game-shell">
    <canvas ref="canvas" aria-label="Neon Drift Hong Kong race track"></canvas>
    <section v-if="telemetry.phase==='setup'" class="setup" aria-labelledby="game-title">
      <header class="brand"><p>九龍午夜賽事 / KOWLOON MIDNIGHT SERIES</p><h1 id="game-title"><span>NEON</span> DRIFT <b>HK</b></h1><div class="route"><span>MK</span><i></i><strong>01</strong></div></header>
      <div class="setup-grid">
        <section class="selector"><div class="section-heading"><span>01</span><div><p>選擇座駕</p><h2>CHOOSE YOUR RIDE</h2></div></div><div class="vehicle-list" role="radiogroup" aria-label="Vehicle"><button v-for="vehicle in VEHICLES" :key="vehicle.id" type="button" :class="{selected:selectedVehicle===vehicle.id}" role="radio" :aria-checked="selectedVehicle===vehicle.id" @click="selectedVehicle=vehicle.id"><img v-if="vehiclePhotos[vehicle.id]" class="vehicle-photo" :src="vehiclePhotos[vehicle.id]" alt=""/><VehicleIcon v-else :vehicle="vehicle.id"/><span><b>{{vehicle.chineseName}}</b><strong>{{vehicle.englishName}}</strong><small>{{vehicle.role}}</small></span><em>{{vehicle.speed}}</em></button></div></section>
        <section class="selector difficulty"><div class="section-heading"><span>02</span><div><p>牌照級別</p><h2>DRIVER CLASS</h2></div></div><div class="difficulty-list" role="radiogroup" aria-label="Difficulty"><button v-for="difficulty in DIFFICULTIES" :key="difficulty.id" type="button" :class="{selected:selectedDifficulty===difficulty.id}" role="radio" :aria-checked="selectedDifficulty===difficulty.id" @click="selectedDifficulty=difficulty.id"><span class="plate">{{difficulty.cc}}</span><span><b>{{difficulty.chineseName}}</b><strong>{{difficulty.englishName}}</strong></span><em>{{difficulty.cc}}cc</em></button></div><div class="spec"><p><span>TOP SPEED</span><b>{{Math.round(currentVehicle.speed*currentDifficulty.speedMultiplier)}} KM/H</b></p><p><span>GRIP</span><i><b :style="{width:`${currentVehicle.grip*100}%`}"></b></i></p><p><span>STEERING</span><i><b :style="{width:`${currentVehicle.steering/2.2*100}%`}"></b></i></p></div></section>
      </div>
      <footer class="start-bar"><div><span>ROUTE 01</span><strong>MONG KOK → KWAI CHUNG</strong></div><button type="button" @click="startRace"><Play :size="20" fill="currentColor"/> START ENGINE <span>開始賽事</span></button></footer>
    </section>

    <template v-else>
      <header class="race-top"><div class="position"><b>{{telemetry.position}}</b><span>RD<small>POSITION</small></span></div><div class="lap"><span>LAP 圈數</span><b>{{Math.min(telemetry.lap,telemetry.totalLaps)}}<i>/</i>{{telemetry.totalLaps}}</b></div><div class="timer"><span>RACE TIME</span><b>{{formatRaceTime(telemetry.raceTimeMs)}}</b></div><button type="button" aria-label="Pause race" @click="togglePause"><Pause :size="20"/></button></header>
      <aside class="leaderboard"><h2>龍虎榜 <span>LIVE</span></h2><ol><li v-for="(entry,index) in leaderboard" :key="entry.id" :class="{player:entry.isPlayer}"><b>{{index+1}}</b><VehicleIcon :vehicle="entry.vehicle"/><span>{{entry.name}}</span><time>{{entry.isPlayer?'RACING':formatRaceTime(Math.max(0,entry.timeMs))}}</time></li></ol></aside>
      <section class="speedometer" aria-label="Speed"><Gauge :size="18"/><strong>{{Math.round(telemetry.speedKmh).toString().padStart(3,'0')}}</strong><span>KM/H</span><div><i :style="{width:`${telemetry.speedKmh/2}%`}"></i></div></section>
      <section class="drift-meter"><div><Zap :size="17" fill="currentColor"/><span>MINI-TURBO</span><b>LV {{telemetry.driftStage}}</b></div><meter min="0" max="100" :value="telemetry.driftCharge"></meter><small>{{telemetry.driftStage ? 'RELEASE TO BOOST / 放開加速' : 'HOLD DRIFT + TURN'}}</small></section>
      <aside class="status-panel"><div v-if="telemetry.seamlessRemainingMs>0" class="buff"><span>SEAMLESS</span><b>無縫狀態</b><strong>{{(telemetry.seamlessRemainingMs/1000).toFixed(1)}}s</strong></div><div class="controls"><h3>CONTROLS 操作</h3><p><kbd>W</kbd><span>ACCELERATE</span></p><p><kbd>A</kbd><kbd>D</kbd><span>STEER</span></p><p><kbd>SPACE</kbd><span>DRIFT</span></p><p><kbd>L</kbd><span>LIGHTS {{telemetry.headlightsOn?'ON':'OFF'}}</span></p></div></aside>
      <button class="audio" type="button" :aria-label="muted?'Unmute vehicle audio':'Mute vehicle audio'" :aria-pressed="muted" @click="toggleAudio"><VolumeX v-if="muted"/><Volume2 v-else/></button>
      <div class="touch-controls" aria-label="Touch controls"><div><button @pointerdown="setTouch('left',true)" @pointerup="setTouch('left',false)" @pointerleave="setTouch('left',false)">←</button><button @pointerdown="setTouch('right',true)" @pointerup="setTouch('right',false)" @pointerleave="setTouch('right',false)">→</button><button class="lights" :class="{active:telemetry.headlightsOn}" :aria-pressed="telemetry.headlightsOn" @click="toggleLights"><Lightbulb :size="18"/>LIGHTS</button></div><div><button class="drift" @pointerdown="setTouch('drift',true)" @pointerup="setTouch('drift',false)" @pointerleave="setTouch('drift',false)">DRIFT</button><button class="gas" @pointerdown="setTouch('accelerate',true)" @pointerup="setTouch('accelerate',false)" @pointerleave="setTouch('accelerate',false)">GAS</button></div></div>
      <div v-if="telemetry.phase==='countdown'" class="countdown"><span>{{countdown || 'GO'}}</span><small>STAND BY / 準備</small></div>
      <section v-if="telemetry.phase==='paused'||telemetry.phase==='finished'" class="modal"><p>{{telemetry.phase==='paused'?'RACE CONTROL':'CHECKERED FLAG'}}</p><h2>{{telemetry.phase==='paused'?'PAUSED 暫停':'FINISH 完成'}}</h2><strong v-if="telemetry.phase==='finished'">{{formatRaceTime(telemetry.raceTimeMs)}}</strong><div><button v-if="telemetry.phase==='paused'" @click="togglePause"><Play/> RESUME</button><button @click="restart"><RotateCcw/> RESTART</button><button @click="returnToSetup">GARAGE</button></div></section>
    </template>
  </main>
</template>
