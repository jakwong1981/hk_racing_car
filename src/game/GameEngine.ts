import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { ControlState, DifficultySpec, RaceTelemetry, VehicleSpec } from '../types/game'
import { driftChargeFor, driftStageFor, turboImpulseFor } from './raceLogic'
import { hasCrossedTrackLine, hoverForceFor, shouldRecoverKart, smoothVisualHeight, trackCenterX, trackHeadingAt, trackPointAt } from './physicsModel'
import { VehicleAudioEngine } from './VehicleAudioEngine'
import { prepareDoubleDeckerModel, prepareMinibusModel, prepareTaxiModel, prepareTramModel } from './vehicleModel'

interface EngineOptions { canvas: HTMLCanvasElement; vehicle: VehicleSpec; difficulty: DifficultySpec; controls: ControlState; telemetry: RaceTelemetry; onFinish: () => void }

const FINISH_LINE_Z = -292
const RACE_START_Z = 8

export class GameEngine {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera = new THREE.PerspectiveCamera(62, 1, .1, 700)
  private world!: RAPIER.World
  private body!: RAPIER.RigidBody
  private kartCollider!: RAPIER.Collider
  private kart = new THREE.Group()
  private animationFrame = 0
  private lastTime = performance.now()
  private accumulator = 0
  private driftMs = 0
  private driftWasActive = false
  private yaw = trackHeadingAt(RACE_START_Z)
  private checkpointCooldown = 0
  private readonly fixedStep = 1 / 60
  private readonly physicsPreviousPosition = new THREE.Vector3()
  private readonly physicsCurrentPosition = new THREE.Vector3()
  private readonly headlightTargetPosition = new THREE.Vector3()
  private readonly headlightForward = new THREE.Vector3()
  private readonly headlights: THREE.SpotLight[] = []
  private readonly headlightTargets: THREE.Object3D[] = []
  private readonly vehicleAudio: VehicleAudioEngine

  constructor(private readonly options: EngineOptions) {
    this.vehicleAudio = new VehicleAudioEngine(options.vehicle.id)
    this.renderer = new THREE.WebGLRenderer({ canvas:options.canvas, antialias:true })
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  async start(): Promise<void> { await RAPIER.init(); this.world = new RAPIER.World({ x:0, y:-18, z:0 }); await this.buildScene(); this.buildPhysics(); this.resize(); window.addEventListener('resize', this.resize); this.lastTime = performance.now(); this.loop(this.lastTime) }
  setMuted(muted: boolean): void { this.vehicleAudio.setMuted(muted) }
  destroy(): void { cancelAnimationFrame(this.animationFrame); window.removeEventListener('resize', this.resize); this.vehicleAudio.destroy(); this.renderer.dispose() }

  private buildPhysics(): void {
    this.world.timestep = this.fixedStep
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(16, .25, 170).setTranslation(0,-.25,-140).setFriction(.9), ground)
    for (const side of [-1,1]) for (let index=0; index<28; index++) this.addBuildingCollider(side, 8-index*12, index)
    this.body = this.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(trackCenterX(RACE_START_Z),1.1,RACE_START_Z).setLinearDamping(.25).setAngularDamping(5).lockRotations())
    this.kartCollider = this.world.createCollider(RAPIER.ColliderDesc.ball(.85).setDensity(this.options.vehicle.mass).setFriction(.55).setRestitution(.42), this.body)
    this.syncPhysicsPositions()
  }

  private async buildScene(): Promise<void> {
    this.scene.background = new THREE.Color(0x07090b); this.scene.fog = new THREE.FogExp2(0x081014, .012)
    this.scene.add(new THREE.HemisphereLight(0x86b5bf,0x101113,1.35)); const moon = new THREE.DirectionalLight(0xd9eaff,2); moon.position.set(-8,20,6); this.scene.add(moon)
    const roadMaterial = new THREE.MeshStandardMaterial({color:0xb7bbb8,roughness:.58,metalness:.08})
    for (let z=10; z>-310; z-=10) { const point=trackPointAt(z); const road=new THREE.Mesh(new THREE.PlaneGeometry(32,11),roadMaterial); road.rotation.set(-Math.PI/2,0,-point.heading); road.position.set(point.x,0,point.z); road.receiveShadow=true; this.scene.add(road) }
    for(let z=10;z>-310;z-=18){const patchPoint=trackPointAt(z,z%36===0?-5:5);const patch=new THREE.Mesh(new THREE.PlaneGeometry(7+(Math.abs(z)%5),5),new THREE.MeshStandardMaterial({color:z%36===0?0xa4aaa9:0x8d9695,roughness:.7,metalness:.04,transparent:true,opacity:.62}));patch.rotation.set(-Math.PI/2,0,-patchPoint.heading);patch.position.set(patchPoint.x,.018,patchPoint.z);this.scene.add(patch)}
    for (let z=15; z>-310; z-=12) { const point=trackPointAt(z); const line = new THREE.Mesh(new THREE.PlaneGeometry(.16,5),new THREE.MeshBasicMaterial({color:0xe4cf93})); line.rotation.set(-Math.PI/2,0,-point.heading); line.position.set(point.x,.012,point.z); this.scene.add(line) }
    this.addFinishLine()
    for (const side of [-1,1]) for (let i=0;i<28;i++) this.addBuilding(side, 8-i*12, i)
    for(let z=0;z>-300;z-=24)for(const side of [-1,1])this.addShopfront(side,z,Math.abs(z/24))
    await this.addAdvertisements()
    for (let z=4; z>-310; z-=16) for (const side of [-1,1]) { const point=trackPointAt(z,side*15.4); const barrier=new THREE.Mesh(new THREE.BoxGeometry(.55,.72,6),new THREE.MeshStandardMaterial({color:Math.abs(z)%32<2?0xd23838:0xe7e6dc,roughness:.7})); barrier.rotation.y=point.heading; barrier.position.set(point.x,.36,point.z); this.scene.add(barrier) }
    this.addOverheadSign(-36,'尖沙咀 TSIM SHA TSUI','油麻地 YAU MA TEI'); this.addOverheadSign(-142,'葵涌 KWAI CHUNG','貨櫃碼頭 CONTAINER PORT'); this.addOverheadSign(-252,'中環 CENTRAL','灣仔 WAN CHAI')
    const water = new THREE.Mesh(new THREE.CircleGeometry(3.4,32),new THREE.MeshBasicMaterial({color:0x39f7e2,transparent:true,opacity:.5,side:THREE.DoubleSide})); water.rotation.x=-Math.PI/2; water.position.set(trackCenterX(-104)-4,.03,-104); this.scene.add(water)
    await this.buildKart(); this.scene.add(this.kart)
  }

  private addFinishLine(): void {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 200
    const context = canvas.getContext('2d')
    if (!context) return
    context.imageSmoothingEnabled = false
    const columns = 12
    const rows = 2
    const tileWidth = canvas.width / columns
    const tileHeight = canvas.height / rows
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        context.fillStyle = (row + column) % 2 === 0 ? '#f5f5f2' : '#111315'
        context.fillRect(column * tileWidth, row * tileHeight, tileWidth, tileHeight)
      }
    }
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy()
    const point = trackPointAt(FINISH_LINE_Z)
    const finishLine = new THREE.Mesh(new THREE.PlaneGeometry(30, 5), new THREE.MeshBasicMaterial({ map:texture, side:THREE.DoubleSide }))
    finishLine.rotation.set(-Math.PI / 2, 0, -point.heading)
    finishLine.position.set(point.x, .045, point.z)
    finishLine.renderOrder = 3
    this.scene.add(finishLine)
  }

  private addBuilding(side:number,z:number,index:number): void { const height=10+(index*7)%20; const width=5+(index%3); const point=trackPointAt(z,side*(18+width/2)); const building=new THREE.Mesh(new THREE.BoxGeometry(width,height,9),new THREE.MeshStandardMaterial({color:index%2?0x171d20:0x202326,roughness:.84})); building.rotation.y=point.heading; building.position.set(point.x,height/2,point.z); this.scene.add(building); for(let floor=3;floor<height-2;floor+=3)for(let offset=-2;offset<=2;offset+=2){if((floor+offset+index)%3===0)continue;const windowPoint=trackPointAt(z+offset,side*15.99);const window=new THREE.Mesh(new THREE.PlaneGeometry(.55,.32),new THREE.MeshBasicMaterial({color:(floor+index)%4===0?0xf3b847:0x92bcb2}));window.position.set(windowPoint.x,floor,windowPoint.z);window.rotation.y=point.heading+(side>0?-Math.PI/2:Math.PI/2);this.scene.add(window)} }
  private addShopfront(side:number,z:number,index:number):void{const colors=[0xd52f3a,0xf0b52f,0x2e8b65];const point=trackPointAt(z,side*15.82);const shop=new THREE.Mesh(new THREE.BoxGeometry(.18,2.8,5.8),new THREE.MeshBasicMaterial({color:colors[index%3]}));shop.rotation.y=point.heading;shop.position.set(point.x,1.7,point.z);this.scene.add(shop);const canvas=document.createElement('canvas');canvas.width=160;canvas.height=480;const ctx=canvas.getContext('2d');if(ctx){ctx.fillStyle=['#d52f3a','#dfac27','#237356'][index%3]??'#d52f3a';ctx.fillRect(0,0,160,480);ctx.strokeStyle='#f4f0db';ctx.lineWidth=8;ctx.strokeRect(6,6,148,468);ctx.fillStyle='#fff';ctx.font='bold 52px sans-serif';ctx.textAlign='center';const names=['茶餐廳','藥 房','金 舖','電 器'];[...(names[index%4]??'商店')].forEach((letter,row)=>ctx.fillText(letter,80,80+row*70))}const signPoint=trackPointAt(z+2,side*14.9);const sign=new THREE.Mesh(new THREE.PlaneGeometry(1.05,3.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)}));sign.position.set(signPoint.x,4.2,signPoint.z);sign.rotation.y=point.heading+(side>0?-Math.PI/2:Math.PI/2);this.scene.add(sign)}
  private async addAdvertisements(): Promise<void> {
    const textures = await Promise.all(['/ads/adv1.jpeg','/ads/adv2.jpeg','/ads/adv3.jpeg'].map(path => new THREE.TextureLoader().loadAsync(path)))
    textures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace })
    for (const side of [-1, 1]) {
      const textureOrder = textures.map((_, index) => index)
      for (let index = textureOrder.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1))
        ;[textureOrder[index], textureOrder[swapIndex]] = [textureOrder[swapIndex]!, textureOrder[index]!]
      }
      for (let index = 0; index < 10; index += 1) {
        const textureIndex = textureOrder[index % textureOrder.length] ?? 0
        const texture = textures[textureIndex]
        if (!texture) continue
        const aspect = texture.image.width / texture.image.height
        const height = aspect > 1.35 ? 3.45 : 4.25
        const width = Math.min(6.6, height * aspect)
        const z = -8 - index * 30 + (side === 1 ? 3 : -3)
        const point = trackPointAt(z, side * 15.35)
        const board = new THREE.Group()
        board.position.set(point.x, height + 1.2, point.z)
        board.rotation.y = point.heading + (side === 1 ? -Math.PI / 2 : Math.PI / 2)
        const frame = new THREE.Mesh(new THREE.BoxGeometry(width + .28, height + .28, .16), new THREE.MeshStandardMaterial({ color:0x202326, roughness:.6, metalness:.25 }))
        frame.position.z = -.06
        board.add(frame)
        const poster = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map:texture, side:THREE.DoubleSide, depthWrite:false }))
        poster.position.z = .035
        poster.renderOrder = 1
        board.add(poster)
        const lamp = new THREE.PointLight(0xffdca6, 3.2, 10)
        lamp.position.set(0, height / 2 + .45, -.45)
        board.add(lamp)
        this.scene.add(board)
      }
    }
  }
  private addOverheadSign(z:number,left:string,right:string): void { const group=new THREE.Group(); const beam=new THREE.Mesh(new THREE.BoxGeometry(30,.2,.2),new THREE.MeshStandardMaterial({color:0x777f7e})); beam.position.y=7; group.add(beam); for(const x of [-14,14]) { const post=new THREE.Mesh(new THREE.BoxGeometry(.2,7,.2),new THREE.MeshStandardMaterial({color:0x777f7e})); post.position.set(x,3.5,0); group.add(post) } const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=180; const ctx=canvas.getContext('2d'); if(ctx){ctx.fillStyle='#176747';ctx.fillRect(0,0,1024,180);ctx.strokeStyle='#fff';ctx.lineWidth=9;ctx.strokeRect(8,8,1016,164);ctx.fillStyle='#fff';ctx.font='bold 46px Arial';ctx.textAlign='center';ctx.fillText(left,256,78);ctx.fillText(right,768,78);ctx.font='bold 50px Arial';ctx.fillText('↑',256,142);ctx.fillText('↗',768,142)} const sign=new THREE.Mesh(new THREE.PlaneGeometry(12,2.1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas)})); sign.position.set(0,6.1,.05); group.add(sign); group.position.set(trackCenterX(z),0,z); group.rotation.y=trackHeadingAt(z); this.scene.add(group) }
  private async buildKart(): Promise<void> {
    const id=this.options.vehicle.id
    if(id==='taxi'&&await this.loadVehicleModel('/models/taxi/HK_Taxi_Red.fbx',prepareTaxiModel)){this.addHeadlights();return}
    if(id==='minibus'&&await this.loadVehicleModel('/models/minibus/HK_Minibus_Red.fbx',prepareMinibusModel)){this.addHeadlights();return}
    if(id==='doubleDecker'&&await this.loadVehicleModel('/models/double-decker/HK_Doubledeck_002.fbx',prepareDoubleDeckerModel)){this.addHeadlights();return}
    if(id==='tram'&&await this.loadGlbVehicleModel('/models/tram/HK_Tram.glb',prepareTramModel)){this.addHeadlights();return}
    const bodyColor=this.options.vehicle.color
    const bodyMaterial=new THREE.MeshStandardMaterial({map:this.createVehicleTexture(id),color:bodyColor,roughness:.28,metalness:.25})
    const glassMaterial=new THREE.MeshStandardMaterial({color:0x102e35,roughness:.12,metalness:.35,transparent:true,opacity:.9})
    const trimMaterial=new THREE.MeshStandardMaterial({color:0xe6e4d5,roughness:.35,metalness:.35})
    const taxiBlackMaterial=new THREE.MeshStandardMaterial({color:0x171b1e,roughness:.3,metalness:.45})
    const taxiWhiteMaterial=new THREE.MeshStandardMaterial({color:0xf2f0df,roughness:.32,metalness:.1})
    const wheelMaterial=new THREE.MeshStandardMaterial({color:0x090909,roughness:.72})
    const add=(geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number):THREE.Mesh=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=true;this.kart.add(mesh);return mesh}
    const wheel=(x:number,z:number):void=>{const mesh=add(new THREE.CylinderGeometry(.28,.28,.18,16),wheelMaterial,x,.32,z);mesh.rotation.z=Math.PI/2}
    if(id==='taxi'){
      add(new THREE.BoxGeometry(1.55,.5,2.5),bodyMaterial,0,.55,0); add(new THREE.BoxGeometry(1.35,.52,1.25),bodyMaterial,0,.99,.15); add(new THREE.BoxGeometry(1.36,.28,.05),glassMaterial,0,1.05,-.49); add(new THREE.BoxGeometry(1.25,.1,.32),taxiWhiteMaterial,0,1.42,.18); add(new THREE.BoxGeometry(.38,.12,.2),new THREE.MeshBasicMaterial({color:0xf1c735}),0,1.53,.18); add(new THREE.BoxGeometry(1.48,.34,.08),taxiBlackMaterial,0,.68,-1.27); add(new THREE.BoxGeometry(.72,.08,.05),new THREE.MeshBasicMaterial({color:0x687277}),0,.76,-1.32); add(new THREE.BoxGeometry(.44,.08,.035),new THREE.MeshBasicMaterial({color:0xf3f0da}),0,.56,-1.32); add(new THREE.BoxGeometry(.12,.18,.08),taxiBlackMaterial,-.8,1.03,-.42); add(new THREE.BoxGeometry(.12,.18,.08),taxiBlackMaterial,.8,1.03,-.42); for(const x of [-.78,.78])for(const z of [-.8,.82])wheel(x,z)
    } else if(id==='minibus'){
      add(new THREE.BoxGeometry(1.7,.95,2.45),bodyMaterial,0,.75,0); add(new THREE.BoxGeometry(1.58,.72,1.72),bodyMaterial,0,1.53,.08); add(new THREE.BoxGeometry(1.6,.33,.05),glassMaterial,0,1.72,-.79); add(new THREE.BoxGeometry(1.73,.08,.08),trimMaterial,0,.92,-1.24); add(new THREE.BoxGeometry(.38,.12,.2),trimMaterial,0,2.02,.08); for(const x of [-.85,.85])for(const z of [-.8,.82])wheel(x,z)
    } else if(id==='doubleDecker'){
      add(new THREE.BoxGeometry(1.78,.55,2.85),bodyMaterial,0,.58,0); add(new THREE.BoxGeometry(1.7,1.02,2.72),bodyMaterial,0,1.38,.05); add(new THREE.BoxGeometry(1.7,.92,2.7),bodyMaterial,0,2.34,.05); add(new THREE.BoxGeometry(1.7,.28,.05),glassMaterial,0,1.45,-1.34); add(new THREE.BoxGeometry(1.7,.27,.05),glassMaterial,0,2.4,-1.34); add(new THREE.BoxGeometry(1.85,.08,.08),trimMaterial,0,.86,-1.44); add(new THREE.BoxGeometry(.4,.12,.2),new THREE.MeshBasicMaterial({color:0xdde9df}),0,3.03,.08); for(const x of [-.9,.9])for(const z of [-1,.95])wheel(x,z)
    } else {
      add(new THREE.BoxGeometry(1.58,.65,3.25),bodyMaterial,0,.72,0); add(new THREE.BoxGeometry(1.48,1.05,2.96),bodyMaterial,0,1.52,.08); add(new THREE.BoxGeometry(1.5,.36,.05),glassMaterial,0,1.75,-1.49); add(new THREE.BoxGeometry(1.7,.09,3.34),trimMaterial,0,.38,0); add(new THREE.BoxGeometry(.14,.3,2.96),trimMaterial,-.77,1.52,.08); add(new THREE.BoxGeometry(.14,.3,2.96),trimMaterial,.77,1.52,.08); add(new THREE.BoxGeometry(.45,.12,.2),new THREE.MeshBasicMaterial({color:0xf0eee2}),0,2.13,.08); for(const z of [-1.12,0,1.12]){wheel(-.82,z);wheel(.82,z)}
    }
    this.addHeadlights()
  }

  private addBuildingCollider(side:number,z:number,index:number): void {
    const height=10+(index*7)%20
    const width=5+(index%3)
    const building=this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    const point=trackPointAt(z,side*(18+width/2))
    const rotation={x:0,y:Math.sin(point.heading/2),z:0,w:Math.cos(point.heading/2)}
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(width/2,height/2,4.5).setTranslation(point.x,height/2,point.z).setRotation(rotation).setFriction(.15).setRestitution(.72),building)
  }

  private addHeadlights(): void {
    const id=this.options.vehicle.id
    const frontZ=id==='doubleDecker'?-2.05:id==='minibus'?-1.52:id==='tram'?-1.65:-1.3
    const halfWidth=id==='doubleDecker'?.58:id==='minibus'?.48:id==='tram'?.5:.4
    for(const x of [-halfWidth,halfWidth]){
      const light=new THREE.SpotLight(0xfff4cf,18,30,Math.PI/7,.55,1.5)
      light.position.set(x,.48,frontZ)
      light.castShadow=false
      const target=new THREE.Object3D()
      this.scene.add(target)
      light.target=target
      this.kart.add(light)
      this.headlights.push(light)
      this.headlightTargets.push(target)
    }
  }

  private async loadVehicleModel(path:string,prepareModel:(model:THREE.Object3D)=>THREE.Group): Promise<boolean> {
    try {
      const model=await new FBXLoader().loadAsync(path)
      this.attachVehicleModel(model,prepareModel)
      return true
    } catch {
      return false
    }
  }

  private async loadGlbVehicleModel(path:string,prepareModel:(model:THREE.Object3D)=>THREE.Group): Promise<boolean> {
    try {
      const model=await new GLTFLoader().loadAsync(path)
      this.attachVehicleModel(model.scene,prepareModel)
      return true
    } catch {
      return false
    }
  }

  private attachVehicleModel(model:THREE.Object3D,prepareModel:(model:THREE.Object3D)=>THREE.Group):void {
    model.traverse(object=>{if(object instanceof THREE.Mesh){object.castShadow=true;object.receiveShadow=true;const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials){if(material instanceof THREE.MeshPhongMaterial)material.shininess=45;if(material instanceof THREE.MeshPhongMaterial||material instanceof THREE.MeshStandardMaterial)material.needsUpdate=true}}})
    this.kart.add(prepareModel(model))
  }

  private createVehicleTexture(vehicle: VehicleSpec['id']): THREE.CanvasTexture {
    const canvas=document.createElement('canvas'); canvas.width=256; canvas.height=256; const context=canvas.getContext('2d'); if(!context)return new THREE.CanvasTexture(canvas)
    const base={taxi:'#d72e35',minibus:'#c92d31',doubleDecker:'#c93b36',tram:'#368269'}[vehicle]
    const accent={taxi:'#f4cf3d',minibus:'#f0e6d0',doubleDecker:'#f1c44b',tram:'#e7d8a4'}[vehicle]
    context.fillStyle=base; context.fillRect(0,0,256,256); context.fillStyle=accent
    if(vehicle==='taxi'){context.fillStyle='#f2f0df';context.fillRect(0,0,256,42);context.fillStyle='#171b1e';context.fillRect(0,198,256,58);context.fillStyle=accent;for(let x=0;x<256;x+=32)context.fillRect(x,82,16,18);context.fillRect(0,176,256,14)}
    if(vehicle==='minibus'){context.fillRect(0,86,256,16);context.fillRect(0,168,256,12);for(let x=12;x<256;x+=42)context.fillRect(x,118,20,38)}
    if(vehicle==='doubleDecker'){context.fillRect(0,120,256,14);for(let x=8;x<256;x+=42){context.fillStyle='#172027';context.fillRect(x,32,28,62);context.fillRect(x,144,28,50);context.fillStyle=accent}}
    if(vehicle==='tram'){context.fillRect(0,96,256,15);context.fillRect(0,168,256,11);for(let x=10;x<256;x+=45){context.fillStyle='#122d29';context.fillRect(x,34,28,45);context.fillRect(x,120,28,38);context.fillStyle=accent}}
    context.strokeStyle='rgba(255,255,255,.2)'; context.lineWidth=2; for(let x=0;x<=256;x+=32){context.beginPath();context.moveTo(x,0);context.lineTo(x,256);context.stroke()} for(let y=0;y<=256;y+=32){context.beginPath();context.moveTo(0,y);context.lineTo(256,y);context.stroke()}
    const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace; return texture
  }

  private loop = (time:number): void => {
    const frame=Math.min((time-this.lastTime)/1000,.08)
    this.lastTime=time
    if(this.options.telemetry.phase==='racing'){
      this.accumulator+=frame
      while(this.accumulator>=this.fixedStep){this.step(this.fixedStep);this.accumulator-=this.fixedStep}
      this.options.telemetry.raceTimeMs+=frame*1000
    }
    this.vehicleAudio.update(this.options.telemetry.speedKmh,this.options.controls.accelerate,this.options.telemetry.phase==='racing')
    this.syncVisuals(frame)
    this.renderer.render(this.scene,this.camera)
    this.animationFrame=requestAnimationFrame(this.loop)
  }
  private step(dt:number): void { this.body.resetForces(true); const c=this.options.controls; const velocity=this.body.linvel(); const forward={x:-Math.sin(this.yaw),z:-Math.cos(this.yaw)}; const signedSpeed=velocity.x*forward.x+velocity.z*forward.z; const maxSpeed=this.options.vehicle.speed*this.options.difficulty.speedMultiplier/3.6; const turn=(Number(c.left)-Number(c.right)); const drifting=c.drift&&turn!==0&&Math.abs(signedSpeed)>4
    const ray=new RAPIER.Ray(this.body.translation(),{x:0,y:-1,z:0}); const hit=this.world.castRay(ray,2.2,true,undefined,undefined,this.kartCollider,this.body); if(hit)this.body.addForce({x:0,y:hoverForceFor(this.body.mass(),18,hit.timeOfImpact,velocity.y),z:0},true)
    if(c.accelerate&&signedSpeed<maxSpeed)this.body.addForce({x:forward.x*this.options.vehicle.acceleration*this.options.vehicle.mass,y:0,z:forward.z*this.options.vehicle.acceleration*this.options.vehicle.mass},true)
    if(c.brake)this.body.addForce({x:-forward.x*22,y:0,z:-forward.z*22},true)
    const steerStrength=this.options.vehicle.steering*(drifting?1.42:1)*(Math.min(Math.abs(signedSpeed)/5,1)); this.yaw+=turn*steerStrength*dt*(signedSpeed>=0?1:-1)
    const lateral={x:Math.cos(this.yaw),z:-Math.sin(this.yaw)}; const lateralSpeed=velocity.x*lateral.x+velocity.z*lateral.z; const grip=this.options.telemetry.seamlessRemainingMs>0?.05:drifting?.18:this.options.vehicle.grip; this.body.addForce({x:-lateral.x*lateralSpeed*grip*18,y:0,z:-lateral.z*lateralSpeed*grip*18},true)
    if(drifting){this.driftMs+=dt*1000;if(!this.driftWasActive)this.body.applyImpulse({x:0,y:2.5,z:0},true)} else if(this.driftWasActive){const impulse=turboImpulseFor(driftStageFor(this.driftMs));this.body.applyImpulse({x:forward.x*impulse,y:0,z:forward.z*impulse},true);this.driftMs=0} this.driftWasActive=drifting
    this.options.telemetry.driftStage=driftStageFor(this.driftMs);this.options.telemetry.driftCharge=driftChargeFor(this.driftMs);this.options.telemetry.seamlessRemainingMs=Math.max(0,this.options.telemetry.seamlessRemainingMs-dt*1000)
    this.physicsPreviousPosition.copy(this.physicsCurrentPosition); this.world.step(); let p=this.body.translation(); this.physicsCurrentPosition.set(p.x,p.y,p.z); if(shouldRecoverKart(p.x,p.y,p.z)){this.recoverKart();p=this.body.translation()} if(Math.hypot(p.x-(trackCenterX(-104)-4),p.z+104)<3.6)this.options.telemetry.seamlessRemainingMs=5000
    this.checkpointCooldown=Math.max(0,this.checkpointCooldown-dt); if(hasCrossedTrackLine(p.x,p.z,FINISH_LINE_Z)&&this.checkpointCooldown===0){this.body.setTranslation({x:trackCenterX(RACE_START_Z),y:1.1,z:RACE_START_Z},true);this.body.setLinvel({x:0,y:0,z:0},true);this.yaw=trackHeadingAt(RACE_START_Z);this.syncPhysicsPositions();this.options.telemetry.lap++;this.checkpointCooldown=2;if(this.options.telemetry.lap>this.options.telemetry.totalLaps)this.options.onFinish()}
    this.options.telemetry.speedKmh=Math.min(200,Math.abs(signedSpeed)*3.6); this.options.telemetry.checkpoint=Math.max(1,Math.min(4,Math.floor(Math.max(0,-p.z)/76)+1)) }
  private syncVisuals(frame:number): void { if(!this.body)return; const visualHeight=this.kart.position.y;const alpha=Math.min(1,this.accumulator/this.fixedStep);this.kart.position.lerpVectors(this.physicsPreviousPosition,this.physicsCurrentPosition,alpha);this.kart.position.y=smoothVisualHeight(visualHeight,this.kart.position.y-.7,frame);this.kart.rotation.y=this.yaw; const p=this.kart.position;this.updateHeadlights(p);const desired=new THREE.Vector3(p.x+Math.sin(this.yaw)*7,p.y+5.2,p.z+Math.cos(this.yaw)*8);this.camera.position.lerp(desired,1-Math.pow(.001,frame));this.camera.lookAt(p.x,p.y+1.2,p.z-8) }
  private updateHeadlights(position:THREE.Vector3): void { const on=this.options.controls.headlights;this.options.telemetry.headlightsOn=on;this.headlights.forEach(light=>{light.visible=on});this.headlightForward.set(-Math.sin(this.yaw),0,-Math.cos(this.yaw));this.headlightTargetPosition.set(position.x+this.headlightForward.x*12,position.y+.35,position.z+this.headlightForward.z*12);this.headlightTargets.forEach(target=>target.position.copy(this.headlightTargetPosition)) }
  private recoverKart():void{this.body.setTranslation({x:trackCenterX(RACE_START_Z),y:1.1,z:RACE_START_Z},true);this.body.setLinvel({x:0,y:0,z:0},true);this.body.setAngvel({x:0,y:0,z:0},true);this.yaw=trackHeadingAt(RACE_START_Z);this.syncPhysicsPositions()}
  private syncPhysicsPositions():void{const position=this.body.translation();this.physicsPreviousPosition.set(position.x,position.y,position.z);this.physicsCurrentPosition.copy(this.physicsPreviousPosition)}
  private resize=():void=>{const width=innerWidth,height=innerHeight;this.camera.aspect=width/height;this.camera.updateProjectionMatrix();this.renderer.setSize(width,height,false)}
}
