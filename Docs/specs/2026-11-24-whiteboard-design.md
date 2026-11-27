# Whiteboard (Release 2) — Design

Date: 2026-11-24 · Status: APPROVED 2026-11-24 · Owner: MD. Lutfur Rahman
Repo location: `Docs/specs/2026-11-24-whiteboard-design.md` (replaces `2026-11-23-whiteboard-decisions.md`)
Read with: `Docs/specs/2026-11-21-realtime-coediting-design.md` (called **RT** below; section numbers like RT 7.3), domain model, physical schema, DESIGN.md, ADR 0004, ADR 0008.

## 1. Why
Kenning is for BRACU students and student software teams. The whiteboard is a **shared drawing surface for explaining and planning**, like a classroom whiteboard, not a sticky-note wall.
Typical moments:
- **Team meeting on a call:** a thesis or dev-team leader draws the plan (boxes, arrows, a timeline, a system sketch), points at things while talking, then each member adds their part on the same board.
- **Dev teams:** architecture sketches, request flows, ER/DB diagrams, rough UI wireframes. Some want neat diagrams; some paste Mermaid code.
- **Students alone:** sketch notes instead of (or inside) pages.

## 2. Goals
- G1. Live multiplayer drawing on the existing collab server (RT): everyone's edits show within ~1 s and merge with nothing lost.
- G1b. **Infinite canvas** like Miro: pan and zoom in any direction with no edges. The only limit is how much is drawn (4 MB, 7.9), not space.
- G2. Tools: pen (freehand), eraser, shapes, arrows/lines that stay attached to shapes, text, sticky note (minor extra), selection/move/resize, undo/redo, zoom/pan.
- G3. Two drawing styles on one board: **Sketch** (rough lines) and **Precise** (straight lines, grid snapping, elbow arrows, dev shape packs).
- G4. Mermaid code → diagram.
- G5. Meeting tools: named live cursors, laser pointer, follow a person, "bring everyone to me", zoom to fit.
- G6. Boards are nodes in the sidebar tree (`NodeType.BOARD`, `ContentFormat.YJS_BOARD_V1`), and can be **embedded in a page** with `/board` (preview inside the page, click to open full screen).
- G7. Same safety as pages: view-only users watch live, offline drawing is kept and merged, version history + restore, the 4 MB size rules, search finds text on boards.
- G8. Works well on weak mobile data, budget laptops and phones (touch + stylus); Bangla text works; export to PNG/SVG.

## 3. Non-goals (later)
Image upload/paste, frames/sections, timer and dot voting, drawing directly inside a page (inline canvas), draw.io-level smart diagrams (growing tables, auto-layout, connection ports), comments on boards, PDF export, AI features, templates gallery.

## 4. Anti-goals (failure even if it "works")
- Pen lag or strokes that vanish during a meeting.
- A teammate's mistake (select-all + delete, or their Undo) wiping other people's work with no way back.
- A board that goes read-only mid-meeting with no warning and no way to continue.
- Typed Bangla showing as boxes.
- Any path where a view-only user, removed member, or stale tab changes a board (same as RT 4).
- The VM running out of memory because boards are heavier than pages.
- Excalidraw calling outside services at runtime (fonts from a CDN, excalidraw.com links, its own collab/storage).

## 5. Approaches considered
| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | `y-excalidraw` community binding | Fastest start. Single young maintainer, its own storage format (Spring/collab must learn it), weak viva answer. | Fallback only; read as reference. |
| B | **Own thin binding**: each Excalidraw element stored in a Yjs map under its id; version rule for conflicts; collab sanitizes. | A few more days. Fully understood (~200-300 lines), format we own (easy text extraction + validation), fits RT with no special cases. | **Chosen by owner (2026-11-24).** |
| C | Excalidraw's own collab (excalidraw-room + Firebase) | Bypasses Spring (breaks ADR 0004), throws away the shipped collab server. | Rejected. |
| - | tldraw (native sync) | Production use needs a license key/watermark. | Rejected (2026-11-23). |
| - | Spike Excalidraw vs GazBoard (ADR 0008) | Time. | Skipped by owner (2026-11-23): Excalidraw chosen. Update ADR 0008. |

## 6. How it works (big picture)
```
Browser: Excalidraw (lazy-loaded) <-> board binding <-> Y.Doc <-> HocuspocusProvider
   | wss://<host>/collab  (same socket path and ticket as pages, RT 7.1)
Collab: same server; picks text extractor + sanitizer by content format
   | /internal/collab/*  (same internal API, RT 7.2/7.3)
Spring: access, revisions, epochs, versions, search, previews
```
Everything in RT (tickets, readOnly viewers, revalidate/4403, store debounce, epochs/4409, offline local copy, size warning/cap, flush, limits, logs) applies to boards **unchanged** unless this doc says otherwise. Collab and Spring learn the content format from the node (`contentFormat` in the load response).

## 7. Design decisions

### 7.1 Board document format (`YJS_BOARD_V1`)
- `ydoc.getMap('elements')`: key = Excalidraw element `id`, value = the element as a **plain JSON object** (whole element replaced on change; no nested Y types).
- `ydoc.getMap('meta')`: `{formatVersion: 1}` only for now.
- `EMPTY_BOARD_STATE`: a fixed encoded state (like `EMPTY_PAGE_STATE`) so first-load merges work.
- Layer order: Excalidraw's fractional `index` field on each element. Clients sort by `index` and only *display* a local fix for clashes. **Collab is the only one that writes index fixes** (server origin, after a merge produces a clash), so clients never race each other with the same fix.
- Deleted elements stay as tombstones (`isDeleted: true`) so deletes merge and undo works. Tombstones are **slimmed, never removed**: when a tombstone's `updated` is older than 24 h, collab replaces it with a stub keeping only `id, type, version, versionNonce, isDeleted, index, updated` (same version, so it still wins over any older copy). A device coming back after days offline therefore can't bring deleted shapes back, and the heavy data (stroke points, text) is gone.
- Allowed element types: `rectangle, ellipse, diamond, line, arrow, freedraw, text` (sticky note = rectangle with bound text + a marker in `customData`). **Not allowed in v1:** `image, embeddable, iframe, frame, magicframe`. The UI hides those tools and blocks pasting images/files.

### 7.2 The binding (browser)
- **Local → Yjs:** on Excalidraw `onChange`, find elements whose `version` is higher than the last value this client wrote or saw, and `set` them in the map in one Yjs transaction (origin = `local`).
  - Elements being created or edited (text being typed, a shape being dragged, an arrow being drawn): sync at most **10 times/s** so others watch it grow.
  - **Freehand strokes are sent once, when the pen lifts**, after simplification (7.8). Others still see the drawer's live cursor while they draw.
- **Yjs → local:** on map changes with origin ≠ `local`, rebuild the scene from the map (sorted by `index`) and call `updateScene` so it **does not enter this user's undo history**. Never overwrite an element this user is editing right now; apply it when they finish.
- **Conflict rule:** Yjs makes all clients agree on one value per element. If the value that wins has a **lower** `version` than this client's own copy (two people edited the same element at the same moment), the client writes its copy back once. Ties go to the lower `versionNonce` (Excalidraw's own rule). This makes "newer edit wins" and everyone converges.
- **Undo/redo only undoes your own changes** (anti-goal 2). Remote changes never enter local history. If someone else changed an element after your change, your undo **skips that element** (their work wins) and undoes the rest. Builder checks whether current Excalidraw history does this when remote changes are applied as "never capture"; if not, use `Y.UndoManager` limited to the `local` origin and route Excalidraw's undo/redo buttons to it.
- Binding lives in `frontend/src/board/binding/` as plain functions, with unit tests that do not need a browser canvas.

### 7.3 Collab server changes
- **Format switch:** load response carries `contentFormat`; collab picks `extractText` (page) or `extractBoardText` (board) and the board sanitizer.
- **`extractBoardText`:** non-deleted `text` elements (including text bound to shapes and arrows), sorted by `index`, joined with newlines. Use `originalText` if present. Parity test with a browser version on fixture boards.
- **Sanitizer** (runs on every change to a board doc, server origin): removes elements that are not objects, have no `id`/`type`, have a type not in 7.1, a `freedraw` with more than 5,000 points, `text` longer than 10,000 characters, `customData` over 1 KB, or a serialized size over 256 KB. It does not touch bindings: dangling arrow/text bindings are repaired **locally for display** by Excalidraw's own restore helpers when clients load elements (no write). Removing them is a normal Yjs change, so every client converges. Log the user id and reason (no content).
- **Large-delete snapshot** (anti-goal 2): collab keeps a baseline "live (non-deleted) element count", computed from the state when the doc is loaded and reset after each successful store. Only user-origin deletes count (sanitizer, slimming and index fixes are server-origin and ignored). When a store would mark ≥ 20 elements **and** ≥ 30 % of the baseline as deleted, collab sends `largeDelete: true` with the store. Spring first saves the currently stored state as an AUTO version labelled "Before a large delete", then stores the new state. At most one such version per board per 10 minutes.
- Size warning and cap: exactly RT 7.3, with board wording (7.9).
- Memory: boards can be bigger than pages. Measure a 1 MB and a 4 MB board in collab memory on the VM; if two 4 MB boards plus normal pages don't fit in `mem_limit: 192m`, lower the live cap for boards or raise the limit, and record it in PROJECT_CONTEXT.

### 7.4 Spring changes
- `contentFormat` drives: empty state, text extraction parity fixtures, and which UI opens. Boards use the same 4 MB state / 1 MB text caps.
- New board: `POST /api/nodes` with `type: BOARD` (same rules as pages; boards cannot have children in v1).
- **Preview:** `PUT /api/nodes/{id}/preview` (EDIT) stores a sanitized SVG, max 200 KB, plus `previewUpdatedAt`; `GET` returns it (VIEW). The browser makes it with Excalidraw's SVG export when a board is closed or hidden and at most once a minute while edited, only if something changed. Strip scripts/foreign objects from the SVG on the server. Embeds and the tree use this image, so pages never load Excalidraw. A stale preview is acceptable until someone next opens the board; **restore** clears the stored preview so the embed shows the placeholder until it's regenerated. If the export is over 200 KB, retry once at a lower scale; if still too big, store none and the embed shows the title + "Open" placeholder.
- Publish/draft: in Kenning, Draft/Published is a status label, not an access rule, so it can't leak anything. Boards don't show Draft/Publish in v1: they're stored as `PUBLISHED` and excluded from "Drafts" lists and the Home "Your drafts" box.
- Versions: AUTO, NAMED and RESTORED work as for pages (flush first, RT 7.6). Large-delete versions per 7.3.

### 7.5 Board screen
- Route `/app/b/:id` (pages stay `/app/p/:id`). Same app chrome as pages: sidebar left, title and actions top right (DESIGN.md "one home per feature"). Excalidraw fills the panel.
- `@excalidraw/excalidraw` is imported **only** on board routes and the board history view (`React.lazy`), with a light loading state. Self-host Excalidraw's fonts/assets (set its asset path to our own `/app/` assets); no CDN calls. Make sure Caddy sends long-lived cache headers for hashed `/app/assets/*`.
- Remove or hide Excalidraw's own menu items that link to excalidraw.com, its own share/collab buttons and its "save to file/open file" entries; keep export.
- **Toolbar order:** select, hand, pen, eraser, rectangle, ellipse, diamond, arrow, line, text, sticky note, laser. Then a **Sketch / Precise** switch, Mermaid, shape packs, zoom to fit.
- **Sketch / Precise switch** sets this user's defaults for *new* elements; existing elements keep their style:
  - Sketch: roughness 1 (rough lines), round corners, normal arrows, grid off.
  - Precise: roughness 0, sharp corners, elbow arrows, grid snapping on.
  - Remembered per user (browser storage), default Sketch.
- **Fonts:** typed text defaults to Nunito (clean). The hand-drawn font can be picked per text in the style panel. Handwriting with the pen needs no font.
- **Bangla:** typed Bangla must render correctly on screen and in exports on Windows Chrome, Android Chrome and macOS Safari. Bundle Noto Sans Bengali (subset is fine) and make it the fallback for Bengali characters (Excalidraw font fallback or `@font-face` `unicode-range`). Test text measuring (box sizes) with Bangla.
- **Shape packs:** bundle MIT-licensed Excalidraw libraries for flowchart, UML class/sequence and ER/database tables (check each library's license; keep attribution in a NOTICE file). Users' own saved library items stay in their browser for v1.
- **Mermaid:** Excalidraw's built-in Mermaid → diagram dialog. Diagram types it turns into real shapes (flowchart, sequence, class) are allowed; types it would turn into an image show "This diagram type isn't supported yet. Try a flowchart, sequence or class diagram." Syntax errors show Mermaid's message with the line number, never a blank result.
- **Export:** Excalidraw's export: PNG and SVG, selection or whole board, transparent background option, scale 1x/2x/3x. File name = board title.
- **Dark mode:** board theme toggle in the board menu, remembered per user. (Follow the app theme instead if the app gets one.)
- **View-only:** Excalidraw view mode, plus a "View only" pill in the top bar (status never by colour alone). Viewers can pan, zoom, follow, export and use the **laser** (not saved).
- **Empty board:** a short hint in the middle: "Draw with the pen, add shapes, or paste Mermaid code." It disappears on the first element.

### 7.6 Presence and meeting tools
- Awareness state: `{user: {id, name, color}, pointer: {x, y, tool: 'pointer'|'laser'}, button, selectedElementIds, viewport: {x, y, width, height, zoom}}`. Pointer max 10 updates/s; viewport max 4/s and only when it changed. Feed it into Excalidraw's `collaborators` so names, cursors, selections and laser trails render.
- Colours: same 8 per-user colours as pages (RT 7.7).
- Avatar stack in the top bar as for pages; viewers get the eye badge and no cursor, but their laser is shown.
- **Follow:** click someone's avatar → "Follow". Your view copies their viewport (fit their visible area, keep your aspect ratio). Following stops the moment you pan, zoom or draw, with a small "Following W · Stop" chip while active.
- **Bring everyone to me:** in the avatar menu, available to editors. Sends a stateless message; everyone else starts following the sender (same stop rules). Rate-limited to once per 10 s per person.
- **Zoom to fit:** button + `Shift+1`.

### 7.7 Embedding a board in a page
- New BlockNote block `board` with prop `{boardId}`. Slash command `/board` creates a new BOARD node as a **child of the page** (title "Untitled board", renameable), inserts the block, and opens nothing (stay in the page).
- Block shows the stored preview SVG (or an empty-board placeholder), the board title, and "Open". Click → full-screen board route; Back returns to the page at the same scroll.
- Permissions come from the existing resolver: the board is a child of the page, so it gets the page's access. If the reader can't open the board (e.g. 1b restriction later), the block shows "You don't have access to this board."
- Deleting the block does **not** delete the board (it stays in the tree under the page). Trashing/archiving/moving the page takes child boards with it (existing tree rules). A block whose board was purged shows "This board was deleted."
- Copy/paste of the block into another page points to the same board (no copy).
- The board title is not part of the page's text; Spring keeps embedded board titles on the page's search copy and updates them on rename.
- The page is not slowed down: the block loads only the preview image.

### 7.8 Weak internet, budget devices, offline
- Offline and local copy: RT 7.4 as is (local Y.Doc state + epoch per tab). SaveIndicator states as RT.
- **Stroke simplification:** when the pen lifts, simplify the freehand points (Ramer–Douglas–Peucker, tolerance about 0.5 screen px at the current zoom; keep pressure values for kept points). Target: ≥ 50 % fewer points with no visible change. Unit test with recorded strokes.
- Keep the board responsive at **2,000 elements** on a budget laptop (4 GB RAM, Chrome): pan/zoom and pen stay smooth. Measure with a generated board and record in PROJECT_CONTEXT.
- First open on a slow connection: show the loading state within 300 ms; Excalidraw chunk cached by the browser after the first visit.

### 7.9 Size limit wording (boards)
- Warning bar at 90 % (clears below 85 %): "This board is almost full. Continue in a new board to keep drawing." + button **Continue in a new board**.
- At the cap (RT 7.3 read-only): "This board is full. Continue in a new board." + the same button.
- Button: creates a new board next to this one (same parent, so a board embedded in a page continues as another child of that page; the embed block is not changed; title "<title> (2)"), opens it, and everyone currently in the board gets a "Continued in <new title>" chip with a link (stateless message).

### 7.10 Touch and stylus
- One finger or stylus draws with the current tool; two fingers always pan/zoom.
- If a stylus is detected, offer Excalidraw's pen mode (only the stylus draws; fingers pan) once via a small hint, so palms don't leave marks.
- Mobile layout: Excalidraw's compact mobile toolbar; our top bar collapses actions into ⋯ below 640 px.

### 7.11 History view for boards
- Same version list as pages. Selecting a version renders its preview (Excalidraw SVG export in the browser, lazy). Actions: Restore (RT 7.5 epoch rule), Name version. No compare view.

### 7.12 Search and the sidebar
- Ctrl+K finds boards by title and by text on the board (7.3 extractor), with Bangla text indexed like pages.
- Sidebar: a board icon distinct from pages; "New board" in the space/page ⋯ menus and the + menu.

## 8. Testing
- **Binding (Vitest, no canvas):** local edit → map set; remote set → scene update without entering local undo; concurrent edits of one element converge to the higher version on 2-3 simulated clients in any order; tombstones merge; index clash fixed; freedraw sent only on finish; throttle respected.
- **Collab (Vitest):** board format picks the board extractor; sanitizer removes bad/forbidden elements and logs; tombstone slimming (old copy can't resurrect a slimmed element); collab-only index fixes; large-delete baseline after reload; large-delete flag thresholds; size warning/cap with boards; `extractBoardText` parity with the browser.
- **Spring IT:** `createBoardNode`, `boardsCannotHaveChildren`, `previewRequiresEdit`, `previewRejectsOver200KB`, `previewSvgSanitized`, `largeDeleteSavesVersionFirst`, `largeDeleteVersionRateLimited`, `boardTextSearchable`, `slashBoardCreatesChildOfPage` (API level).
- **Playwright (two browser contexts, real collab):** both draw shapes and a stroke, each sees the other's within 2 s; cursor names visible; viewer sees live drawing, cannot draw, laser visible to the editor; follow + bring-everyone-to-me move the other view; undo in tab A doesn't remove tab B's shape; select-all + delete creates a "Before a large delete" version and restore brings everything back; offline draw then reconnect merges; restore while another tab is open (4409); Mermaid flowchart import; unsupported Mermaid type message; Bangla text renders (screenshot check) and exports; `/board` in a page creates a child board, shows the preview after editing, opens and returns; image paste is blocked.

## 9. Left to the builder
- File layout, component structure, exact styling within DESIGN.md tokens, exact Excalidraw prop names and helpers (check the current Excalidraw docs first; its API moves fast; pin the version).
- Which Excalidraw libraries to bundle (license-clean), Noto Sans Bengali subsetting, how the preview job debounces, exact chip/banner copy beyond what's written here.
- Using `y-excalidraw` source as a reference for the binding is fine; copying code requires keeping its license.

## 10. Calls made without the owner (review these)
Element-per-key `Y.Map` format; freehand sent on pen lift (others see the cursor live); 10/s live sync for other elements; tombstones slimmed (not removed) after 24 h; collab is the only writer of index fixes; undo skips elements someone else changed since; sanitizer limits (5,000 points, 10,000 chars, customData 1 KB, 256 KB per element) and forbidden types; bindings repaired locally only; stale previews OK until next open, cleared on restore; boards stored as PUBLISHED and hidden from draft lists; "Continue in a new board" stays under the same parent and leaves the embed alone; large-delete thresholds (≥ 20 and ≥ 30 %, one per 10 min); preview as stored SVG ≤ 200 KB updated at most once a minute; boards have no children and no Draft/Publish UI; deleting the embed block keeps the board; copied block points to the same board; Sketch/Precise as per-user defaults (default Sketch); viewers may use the laser, follow and export; "bring everyone to me" for editors only; PDF export moved to later (PNG/SVG in v1); responsiveness target 2,000 elements; board route `/app/b/:id`.

## 11. Edge cases this design answers (from the 24 Nov brainstorm)
| Risk for students | Where handled |
|---|---|
| Weak mobile data / WiFi drops | 7.8, RT 7.4 |
| Slow first open | 7.5 lazy load, 7.8 |
| Budget devices lag | 7.8 simplification + 2,000-element target |
| Board full mid-meeting | 7.9 |
| Teammate wipes the board / undo removes others' work | 7.2 own-only undo, 7.3 large-delete snapshot, 7.11 restore |
| Lost on the canvas | 7.6 zoom to fit, follow |
| "Why can't I draw?" | 7.5 View only pill |
| Phone pinch vs draw, palms | 7.10 |
| Bangla text | 7.5 |
| Diagram needed in a report | 7.5 export |
| Mermaid typo | 7.5 |
| Studying at night | 7.5 dark mode |
