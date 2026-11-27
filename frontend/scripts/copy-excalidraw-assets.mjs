// Self-host the whiteboard fonts: Excalidraw falls back to a public CDN for any asset it can't find under
// window.EXCALIDRAW_ASSET_PATH, and the app makes no calls outside its own origin.
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const from = fileURLToPath(new URL('../node_modules/@excalidraw/excalidraw/dist/prod/fonts', import.meta.url))
const to = fileURLToPath(new URL('../public/excalidraw-assets/fonts', import.meta.url))
rmSync(to, { recursive: true, force: true })
cpSync(from, to, { recursive: true })
