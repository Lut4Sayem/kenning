# Whiteboard: early decisions (23 Nov 2026)

Main user: student teams brainstorming live in meetings. Built on the existing collab server (Hocuspocus + Yjs), content format `YJS_BOARD_V1`, NodeType `BOARD`.

## Decided
- **Engine:** Excalidraw (MIT). Spike from ADR 0008 skipped to save time.
- **v1 scope:** sticky notes, text, shapes, arrows, pen.
- **Presence:** named live cursors + selection highlights via Yjs awareness.
- **Look:** clean sans font (Inter or Nunito) as default, Miro-like; no hand-drawn style.

## Later (not v1)
- Frames/sections, image upload, timer + dot voting, follow-the-presenter.

## Still open
- Yjs binding: existing Excalidraw-Yjs lib or a thin own one.
- Board size cap vs the 90% warning / read-only-at-cap rule.
- Permissions: reuse page permissions (view = read-only canvas).
