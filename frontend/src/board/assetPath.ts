// Must run before @excalidraw/excalidraw is imported: it reads the path once, and a missing asset falls back to a CDN.
declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string
  }
}

window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL + 'excalidraw-assets/'

export {}
