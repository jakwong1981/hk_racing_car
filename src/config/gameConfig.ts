import type { DifficultySpec, OpponentSpec, VehicleId, VehicleSpec } from '../types/game'

export const VEHICLES: readonly VehicleSpec[] = [
  { id:'taxi', englishName:'Red Taxi', chineseName:'的士', role:'Speed Demon', speed:200, acceleration:30, grip:.7, steering:2.15, mass:1, color:0xd72e35 },
  { id:'minibus', englishName:'Red Minibus', chineseName:'小巴', role:'The Brawler', speed:174, acceleration:26, grip:.88, steering:1.85, mass:1.4, color:0xc92d31 },
  { id:'doubleDecker', englishName:'Double-Decker', chineseName:'雙層巴士', role:'Juggernaut', speed:160, acceleration:19, grip:.82, steering:1.55, mass:2.1, color:0xc93b36 },
  { id:'tram', englishName:'The Tram', chineseName:'電車', role:'Tracked Wall', speed:146, acceleration:22, grip:1, steering:1.35, mass:2.6, color:0x2f7f65 },
]

export const DIFFICULTIES: readonly DifficultySpec[] = [
  { id:'learner', englishName:'Learner', chineseName:'學牌', cc:50, speedMultiplier:.78, steeringAssist:.35, collisionPenalty:.15, opponentPace:.8 },
  { id:'probationary', englishName:'Probationary', chineseName:'P 牌', cc:100, speedMultiplier:.9, steeringAssist:.12, collisionPenalty:.35, opponentPace:.9 },
  { id:'professional', englishName:'Professional', chineseName:'職業司機', cc:150, speedMultiplier:1, steeringAssist:0, collisionPenalty:.58, opponentPace:.98 },
]

const RIVALS: readonly OpponentSpec[] = [
  { id:'rival-ming', name:'夜更阿明', vehicle:'minibus', skill:1, laneOffset:-1.4 },
  { id:'rival-kid', name:'KOWLOON KID', vehicle:'tram', skill:.97, laneOffset:1.4 },
  { id:'rival-express', name:'港島速遞', vehicle:'doubleDecker', skill:.94, laneOffset:0 },
]

/** A rival never shares the player's vehicle, so the grid always shows four distinct silhouettes. */
export const opponentsFor = (playerVehicle: VehicleId): OpponentSpec[] => {
  const taken = new Set<VehicleId>([playerVehicle])
  const spare = VEHICLES.map(vehicle => vehicle.id).filter(id => id !== playerVehicle && !RIVALS.some(rival => rival.vehicle === id))
  return RIVALS.map(rival => {
    const vehicle = taken.has(rival.vehicle) ? spare.shift() ?? rival.vehicle : rival.vehicle
    taken.add(vehicle)
    return { ...rival, vehicle }
  })
}

export const vehicleSpecFor = (id: VehicleId): VehicleSpec => {
  const spec = VEHICLES.find(vehicle => vehicle.id === id)
  if (!spec) throw new Error(`Unknown vehicle ${id}`)
  return spec
}
