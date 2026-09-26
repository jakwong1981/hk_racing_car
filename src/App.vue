<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref } from 'vue'
import { CloudRain, Gauge, Lightbulb, Pause, Play, RotateCcw, Volume2, VolumeX, Zap } from 'lucide-vue-next'
import VehicleIcon from './components/VehicleIcon.vue'
import taxiPhoto from './assets/taxi-transparent.png'
import minibusPhoto from './assets/minibus-transparent.png'
import doubleDeckerPhoto from './assets/double-decker-transparent.png'
import tramPhoto from './assets/tram-transparent.png'
import { DIFFICULTIES, opponentsFor, VEHICLES } from './config/gameConfig'
import { TRACKS } from './config/trackConfig'
import { GameEngine } from './game/GameEngine'
import { InputManager } from './game/InputManager'
import { formatRaceTime } from './game/raceLogic'
import type { DifficultyId, QualityLevel, RaceStanding, RaceTelemetry, TrackId, VehicleId, WeatherKind } from './types/game'

const canvas = ref<HTMLCanvasElement>()
const selectedVehicle = ref<VehicleId>('taxi')
const selectedDifficulty = ref<DifficultyId>('probationary')
const selectedTrack = ref<TrackId>('hongKongRoute')
const selectedQuality = ref<QualityLevel>('high')
const countdown = ref(3)
const muted = ref(false)
const telemetry = reactive<RaceTelemetry>({ phase:'setup',speedKmh:0,lap:1,totalLaps:2,checkpoint:0,totalCheckpoints:0,raceTimeMs:0,position:1,driftStage:0,driftCharge:0,seamlessRemainingMs:0,headlightsOn:true,weather:'clear',surfaceGripPercent:100,aquaplaning:false,spinning:false,standings:[] })
const WEATHER_LABELS: Record<WeatherKind,{chinese:string;english:string}> = { clear:{chinese:'晴朗',english:'CLEAR'}, damp:{chinese:'陰天微霧',english:'DAMP'}, storm:{chinese:'突發暴雨',english:'HEAVY RAIN'}, drying:{chinese:'路面轉乾',english:'DRYING'} }
const QUALITY_OPTIONS: readonly {id:QualityLevel;label:string}[] = [{id:'high',label:'高 HIGH'},{id:'low',label:'低 LOW'}]
const weatherLabel = computed(() => WEATHER_LABELS[telemetry.weather])
const ordinalSuffix = (position:number):string => ['TH','ST','ND','RD'][position>=11&&position<=13?0:position%10<=3?position%10:0] ?? 'TH'
const gapLabel = (standing:RaceStanding):string => standing.isPlayer ? 'YOU' : standing.finished ? 'FIN' : standing.gapSeconds===undefined ? `L${standing.lap}` : `${standing.gapSeconds>0?'+':''}${standing.gapSeconds.toFixed(1)}s`
const currentVehicle = computed(() => VEHICLES.find(vehicle => vehicle.id===selectedVehicle.value) ?? VEHICLES[0])
const currentDifficulty = computed(() => DIFFICULTIES.find(difficulty => difficulty.id===selectedDifficulty.value) ?? DIFFICULTIES[1])
const currentTrack = computed(() => TRACKS.find(track => track.id===selectedTrack.value) ?? TRACKS[0])
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
  engine=new GameEngine({canvas:canvas.value,vehicle:currentVehicle.value,difficulty:currentDifficulty.value,track:currentTrack.value,opponents:opponentsFor(selectedVehicle.value),quality:selectedQuality.value,controls:input.state,telemetry,onFinish:finishRace})
  engine.setMuted(muted.value)
  await nextTick()
  await engine.start()
  input.connect()
  countdownTimer=window.setInterval(()=>{countdown.value--;if(countdown.value<=0){window.clearInterval(countdownTimer);telemetry.phase='racing'}},720)
}
const finishRace = ():void => { telemetry.phase='finished'; input.reset() }
const restart = ():void => { telemetry.speedKmh=0;telemetry.lap=1;telemetry.raceTimeMs=0;telemetry.driftCharge=0;telemetry.seamlessRemainingMs=0;telemetry.aquaplaning=false;telemetry.spinning=false;telemetry.standings=[];void startRace() }
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
        <section class="selector difficulty"><div class="section-heading"><span>02</span><div><p>牌照級別</p><h2>DRIVER CLASS</h2></div></div><div class="difficulty-list" role="radiogroup" aria-label="Difficulty"><button v-for="difficulty in DIFFICULTIES" :key="difficulty.id" type="button" :class="{selected:selectedDifficulty===difficulty.id}" role="radio" :aria-checked="selectedDifficulty===difficulty.id" @click="selectedDifficulty=difficulty.id"><span class="plate">{{difficulty.cc}}</span><span><b>{{difficulty.chineseName}}</b><strong>{{difficulty.englishName}}</strong></span><em>{{difficulty.cc}}cc</em></button></div><div class="spec"><p><span>TOP SPEED</span><b>{{Math.round(currentVehicle.speed*currentDifficulty.speedMultiplier)}} KM/H</b></p><p><span>GRIP</span><i><b :style="{width:`${currentVehicle.grip*100}%`}"></b></i></p><p><span>STEERING</span><i><b :style="{width:`${currentVehicle.steering/2.2*100}%`}"></b></i></p></div>
          <div class="section-heading track-heading"><span>03</span><div><p>選擇賽道</p><h2>CIRCUIT</h2></div></div><div class="track-list" role="radiogroup" aria-label="Circuit"><button v-for="track in TRACKS" :key="track.id" type="button" :class="[track.id,{selected:selectedTrack===track.id}]" role="radio" :aria-checked="selectedTrack===track.id" @click="selectedTrack=track.id"><span><b>{{track.chineseName}}</b><strong>{{track.englishName}}</strong><small>{{track.closed?'CIRCUIT':'SPRINT'}} · {{track.laps}} LAPS</small></span></button></div></section>
      </div>
      <footer class="start-bar"><div><span>ROUTE 0{{TRACKS.indexOf(currentTrack)+1}}</span><strong>{{currentTrack.routeLabel}}</strong></div><div class="quality" role="radiogroup" aria-label="Graphics quality"><span>畫質 GRAPHICS</span><button v-for="option in QUALITY_OPTIONS" :key="option.id" type="button" role="radio" :aria-checked="selectedQuality===option.id" :class="{selected:selectedQuality===option.id}" @click="selectedQuality=option.id">{{option.label}}</button></div><button type="button" class="start" @click="startRace"><Play :size="20" fill="currentColor"/> START ENGINE <span>開始賽事</span></button></footer>
    </section>

    <template v-else>
      <header class="race-top"><div class="position"><b>{{telemetry.position}}</b><span>{{ordinalSuffix(telemetry.position)}}<small>POSITION</small></span></div><div class="lap"><span>LAP 圈數</span><b>{{Math.min(telemetry.lap,telemetry.totalLaps)}}<i>/</i>{{telemetry.totalLaps}}</b><small>CP {{telemetry.checkpoint}}/{{telemetry.totalCheckpoints}}</small></div><div class="timer"><span>RACE TIME</span><b>{{formatRaceTime(telemetry.raceTimeMs)}}</b></div><button type="button" aria-label="Pause race" @click="togglePause"><Pause :size="20"/></button></header>
      <aside class="leaderboard"><h2>龍虎榜 <span>LIVE</span></h2><ol><li v-for="standing in telemetry.standings" :key="standing.id" :class="{player:standing.isPlayer}"><b>{{standing.position}}</b><VehicleIcon :vehicle="standing.vehicle"/><span>{{standing.name}}</span><time>{{gapLabel(standing)}}</time></li></ol></aside>
      <section class="speedometer" aria-label="Speed"><Gauge :size="18"/><strong>{{Math.round(telemetry.speedKmh).toString().padStart(3,'0')}}</strong><span>KM/H</span><div><i :style="{width:`${telemetry.speedKmh/2}%`}"></i></div></section>
      <section class="drift-meter"><div><Zap :size="17" fill="currentColor"/><span>MINI-TURBO</span><b>LV {{telemetry.driftStage}}</b></div><meter min="0" max="100" :value="telemetry.driftCharge"></meter><small>{{telemetry.driftStage ? 'RELEASE TO BOOST / 放開加速' : 'HOLD DRIFT + TURN'}}</small></section>
      <div v-if="telemetry.spinning||telemetry.aquaplaning" class="hazard" role="status">{{telemetry.spinning?'打滑 SPIN':'水漂 AQUAPLANING'}}</div>
      <aside class="status-panel"><div class="weather" :class="telemetry.weather"><CloudRain :size="16"/><span><b>{{weatherLabel.chinese}}</b><small>{{weatherLabel.english}}</small></span><strong>{{telemetry.surfaceGripPercent}}%<small>GRIP</small></strong></div><div v-if="telemetry.seamlessRemainingMs>0" class="buff"><span>SEAMLESS</span><b>無縫狀態</b><strong>{{(telemetry.seamlessRemainingMs/1000).toFixed(1)}}s</strong></div><div class="controls"><h3>CONTROLS 操作</h3><p><kbd>W</kbd><span>ACCELERATE</span></p><p><kbd>A</kbd><kbd>D</kbd><span>STEER</span></p><p><kbd>SPACE</kbd><span>DRIFT</span></p><p><kbd>L</kbd><span>LIGHTS {{telemetry.headlightsOn?'ON':'OFF'}}</span></p></div></aside>
      <button class="audio" type="button" :aria-label="muted?'Unmute vehicle audio':'Mute vehicle audio'" :aria-pressed="muted" @click="toggleAudio"><VolumeX v-if="muted"/><Volume2 v-else/></button>
      <div class="touch-controls" aria-label="Touch controls"><div><button @pointerdown="setTouch('left',true)" @pointerup="setTouch('left',false)" @pointerleave="setTouch('left',false)">←</button><button @pointerdown="setTouch('right',true)" @pointerup="setTouch('right',false)" @pointerleave="setTouch('right',false)">→</button><button class="lights" :class="{active:telemetry.headlightsOn}" :aria-pressed="telemetry.headlightsOn" @click="toggleLights"><Lightbulb :size="18"/>LIGHTS</button></div><div><button class="drift" @pointerdown="setTouch('drift',true)" @pointerup="setTouch('drift',false)" @pointerleave="setTouch('drift',false)">DRIFT</button><button class="gas" @pointerdown="setTouch('accelerate',true)" @pointerup="setTouch('accelerate',false)" @pointerleave="setTouch('accelerate',false)">GAS</button></div></div>
      <div v-if="telemetry.phase==='countdown'" class="countdown"><span>{{countdown || 'GO'}}</span><small>STAND BY / 準備</small></div>
      <section v-if="telemetry.phase==='paused'||telemetry.phase==='finished'" class="modal"><p>{{telemetry.phase==='paused'?'RACE CONTROL':'CHECKERED FLAG'}}</p><h2>{{telemetry.phase==='paused'?'PAUSED 暫停':'FINISH 完成'}}</h2><strong v-if="telemetry.phase==='finished'">P{{telemetry.position}} · {{formatRaceTime(telemetry.raceTimeMs)}}</strong><ol v-if="telemetry.phase==='finished'" class="results"><li v-for="standing in telemetry.standings" :key="standing.id" :class="{player:standing.isPlayer}"><b>{{standing.position}}</b><span>{{standing.name}}</span><time>{{gapLabel(standing)}}</time></li></ol><div><button v-if="telemetry.phase==='paused'" @click="togglePause"><Play/> RESUME</button><button @click="restart"><RotateCcw/> RESTART</button><button @click="returnToSetup">GARAGE</button></div></section>
    </template>
  </main>
</template>
