import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TRACKS } from '../src/config/trackConfig'
import { exportTrack } from '../src/game/track/trackExport'

const outputDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'track-data')
mkdirSync(outputDirectory, { recursive: true })

for (const track of TRACKS) {
  const file = join(outputDirectory, `${track.id}.json`)
  const data = exportTrack(track)
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  console.log(`Wrote ${file} (${data.checkpoints.length} checkpoints, ${data.corners.length} corners, ${data.landmarks.length} landmarks)`)
}
