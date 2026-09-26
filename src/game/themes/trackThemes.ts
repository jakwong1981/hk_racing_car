import type { TrackTheme } from '../../types/game'
import { hongKongTheme } from './hongKongTheme'
import { neonRiftTheme } from './neonRiftTheme'
import type { TrackThemeBuilder } from './trackTheme'

export const TRACK_THEMES: Readonly<Record<TrackTheme, TrackThemeBuilder>> = {
  hongKong: hongKongTheme,
  neonRift: neonRiftTheme,
}
