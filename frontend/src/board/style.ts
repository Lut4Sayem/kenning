// Sketch / Precise (WB 7.5): this user's defaults for new shapes. Existing shapes keep their own style.
import { FONT_FAMILY } from '@excalidraw/excalidraw'

export type StyleMode = 'sketch' | 'precise'
const KEY = 'kf.board.style'

export const styleDefaults = (mode: StyleMode) => {
  const rough = mode === 'sketch'
  return {
    currentItemRoughness: rough ? 1 : 0,
    currentItemRoundness: rough ? ('round' as const) : ('sharp' as const),
    currentItemArrowType: rough ? ('round' as const) : ('elbow' as const),
    gridModeEnabled: !rough,
    objectsSnapModeEnabled: !rough,
    currentItemFontFamily: FONT_FAMILY.Nunito,
  }
}

export function loadMode(): StyleMode {
  try {
    return localStorage.getItem(KEY) === 'precise' ? 'precise' : 'sketch'
  } catch {
    return 'sketch'
  }
}

export function saveMode(mode: StyleMode) {
  try {
    localStorage.setItem(KEY, mode)
  } catch {
    // storage blocked: the choice just is not remembered
  }
}
