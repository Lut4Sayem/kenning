# Whiteboard (Release 2) Implementation Plan

> Work task by task; steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live multiplayer Excalidraw boards as tree nodes (`BOARD` / `YJS_BOARD_V1`) on the existing collab server, embeddable in pages, with the same safety rules as pages.

**Architecture:** Each Excalidraw element is a plain JSON value in `ydoc.getMap('elements')` keyed by element id. A thin browser binding syncs Excalidraw <-> Y.Doc; collab (Hocuspocus) picks the board extractor and runs a server-origin sanitizer, tombstone slimming and index fixes. Spring keeps access, revisions, epochs, versions, search and stores a sanitized SVG preview for embeds.

**Tech Stack:** `@excalidraw/excalidraw` **0.18.1** (pinned, exact), `@excalidraw/mermaid-to-excalidraw` **2.2.2** (the version Excalidraw 0.18.1 itself depends on), `fractional-indexing` 3.2.0 (collab), Yjs 13, Hocuspocus 4.9, React 18, BlockNote 0.57, Spring Boot 4.1, Vitest, Playwright.

**Spec:** `Docs/specs/2026-11-24-whiteboard-design.md` (called **WB**), read with `Docs/specs/2026-11-21-realtime-coediting-design.md` (**RT**).

## Excalidraw check (0.18.1, read from the published package's types and `dist/prod` on 2026-11-27)

| Spec assumes | Verified? | Gap + fix |
|---|---|---|
| Nunito font | Yes: `FONT_FAMILY.Nunito`, files in `dist/prod/fonts/Nunito` | None. Default via `appState.currentItemFontFamily = FONT_FAMILY.Nunito`. |
| Font fallback for Bengali | **No.** `FONT_FAMILY_FALLBACKS` = `Xiaolai`, `Segoe UI Emoji` only | Register a subset Noto Sans Bengali `FontFace` under the families `Nunito` and `Excalifont` with `unicodeRange: U+0980-09FF, U+200C-200D, U+25CC` before Excalidraw mounts (canvas and PNG export use it). SVG export embeds only Excalidraw's own subsets, so post-process the exported SVG and add the Bengali `@font-face` (data URL) when the text holds Bengali (Task 7.1). |
| Laser tool + collaborator laser | Yes: tool `laser`, `CollaboratorPointer.tool: 'pointer' \| 'laser'`, `renderCursor` flag | None. |
| Follow-user support | **Partly.** `appState.userToFollow`, `onUserFollow` callback and avatar-click UI exist, but sending/applying viewports is left to the host app (excalidraw.com does it in its own collab code) | Our own: viewport in awareness, apply with `updateScene({appState:{scrollX, scrollY, zoom}})`, own avatar menu (Task 3.2). Excalidraw's built-in user list is not used. |
| Mermaid-to-Excalidraw dialog | Yes: built-in `openDialog: {name:'ttd', tab:'mermaid'}` in the extra-tools menu | **Gap:** for types it cannot convert it inserts an **image** (forbidden, WB 7.1) and its error/insert path can't be hooked. Fix: own small dialog calling `parseMermaidToExcalidraw` + `convertToExcalidrawElements`; result with `files` = unsupported message. Hide the built-in menu item with CSS (Task 4.3). |
| Elbow arrows | Yes: `currentItemArrowType: 'sharp' \| 'round' \| 'elbow'` | None. |
| Grid snapping | Yes: `gridModeEnabled`, `gridSize`, `gridStep`, `objectsSnapModeEnabled` | None. |
| Pen mode | Yes: `appState.penMode`, `appState.penDetected` | None. |
| Fractional `index` | Yes: `OrderedExcalidrawElement.index`; package depends on `fractional-indexing@3.2.0` | `syncInvalidIndices` is **not exported**. Collab uses `fractional-indexing` directly for fixes; the client only sorts (Task 1.4). |
| History that skips remote changes | **Partly.** `CaptureUpdateAction.NEVER` keeps remote updates out of history, but Excalidraw's delta undo can still revert a property someone else changed later | Use `Y.UndoManager` with `trackedOrigins: {'local'}` (Yjs skips map keys overwritten by others), route Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y and our undo/redo buttons to it, hide Excalidraw's (Task 2.2/2.4). |
| Self-hosted asset path | Yes: `window.EXCALIDRAW_ASSET_PATH` | **Gap:** a missing asset silently falls back to `https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/`. Fix: copy `dist/prod/fonts` into our build, set the path before import, and a Playwright check that no request leaves our origin (Task 2.1). |
| Libraries | Yes: `initialData.libraryItems`, `loadLibraryFromBlob`, `restoreLibraryItems`, `mergeLibraryItems` | **Gap:** "Browse libraries" links to `libraries.excalidraw.com` (and publish to `plus.excalidraw.com`). Fix: hide those links with CSS, load bundled `.excalidrawlib` files ourselves (Task 4.2). |
| Also used | `restoreElements` (local binding repair), `reconcileElements` (same version/versionNonce rule as WB 7.2), `exportToSvg`, `exportToBlob`, `MainMenu`, `THEME`, `UIOptions.tools.image`, `onPaste`, `viewModeEnabled`, `isCollaborating`, `onPointerUpdate`, `api.scrollToContent` | Confirm exact names again before coding Phase 2 if the pinned version changes. |

## Global Constraints
- Pin `@excalidraw/excalidraw` to exactly `0.18.1`; import it only on `/app/b/:id` and the board history view (`React.lazy`).
- No runtime calls outside our origin (fonts, libraries, excalidraw.com, esm.sh). WB anti-goal 7.
- Allowed element types: `rectangle, ellipse, diamond, line, arrow, freedraw, text`. Forbidden: `image, embeddable, iframe, frame, magicframe`.
- Sanitizer limits: freedraw ≤ 5,000 points, text ≤ 10,000 chars, `customData` ≤ 1 KB, element JSON ≤ 256 KB.
- Live sync ≤ 10/s for edited elements; freedraw sent once on pen lift; pointer ≤ 10/s; viewport ≤ 4/s and only on change.
- Tombstones slimmed after 24 h to `id, type, version, versionNonce, isDeleted, index, updated`; never removed.
- Large delete: ≥ 20 elements **and** ≥ 30 % of baseline; version label "Before a large delete"; ≤ 1 per board per 10 min.
- Preview: sanitized SVG ≤ 200 KB, generated ≤ 1/min while edited and on close/hide.
- Same 4 MB state / 1 MB text caps and RT size rules; board wording from WB 7.9 verbatim.
- Board route `/app/b/:id`; boards stored `PUBLISHED`, never in draft lists; boards have no children.
- User-facing copy (verbatim): "Draw with the pen, add shapes, or paste Mermaid code." · "This diagram type isn't supported yet. Try a flowchart, sequence or class diagram." · "This board is almost full. Continue in a new board to keep drawing." · "This board is full. Continue in a new board." · "Continue in a new board" · "Before a large delete" · "You don't have access to this board." · "This board was deleted." · "View only".
- Repo rules: backend first, then frontend; no tool or assistant mentions in anything committed; small commits; each phase = one PR off `main`, CI green (`./mvnw -B verify`, frontend `lint/typecheck/test/build`, collab `typecheck/test/build`, Playwright).

## Review Focus
1. **Two people move the same shape at the same moment** -> every client ends with the higher-version copy. Pinned by `concurrentEditsConvergeAnyOrder` (Task 2.2).
2. **A laptop comes back after days offline holding old copies of shapes deleted since** -> deleted shapes stay deleted. Pinned by `staleCopyCannotResurrectSlimmed` (Task 1.4).
3. **A viewer or modified client sends forbidden data (an `image` element, a 6,000-point stroke, a summon message)** -> dropped by collab, others unaffected. Pinned by `sanitizerRemovesForbiddenTypes`, `sanitizerRemovesOversized` (Task 1.4), `viewerCannotSummon` (Task 3.2).
4. **The prod build serves Excalidraw from `/app/` and one font path is wrong** -> Excalidraw would silently fetch from esm.sh. Pinned by `board has no external requests` in `prod-build.spec.ts` (Task 2.4).
5. **A remote change lands on the shape I'm dragging or text I'm typing** -> my edit is not yanked away; the remote value applies when I finish (or loses to my higher version). Pinned by `remoteChangeDeferredWhileEditing` (Task 2.2).

## File map (new unless marked)
```
collab/src/board/format.ts        ELEMENTS, META, ALLOWED_TYPES, LIMITS, EMPTY_BOARD_STATE
collab/src/board/extractBoardText.ts
collab/src/board/sanitize.ts      sanitizeChanged, slimTombstones, fixIndexClashes
collab/src/board/largeDelete.ts   LargeDeleteTracker
collab/src/server.ts (mod)        format switch, board guards, stateless relay
collab/src/spring.ts (mod)        Loaded.format, StoreBody.largeDelete
collab/test/fixtures/boards.json  shared with frontend parity test
frontend/src/board/format.ts      same constants as collab (EMPTY_BOARD_STATE identical bytes)
frontend/src/board/binding/*.ts   pure sync functions + undo
frontend/src/board/BoardView.tsx  route screen (lazy), BoardCanvas.tsx (Excalidraw wrapper)
frontend/src/board/{presence,follow,style,mermaid,preview,simplify,bangla}.ts
frontend/src/editor/BoardBlock.tsx  BlockNote `board` block
src/main/java/.../node/*            type on create, no children, PUBLISHED
src/main/java/.../nodecontent/*     preview fields + endpoints, SvgSanitizer
src/main/java/.../collab/StoreRequest.java (mod) largeDelete
```

---

## Phase 1 — PR `feat/board-format`: board format, sanitizer, extractor, Spring BOARD

### Task 1.1: Spring creates BOARD nodes · **Tier: routine**
**Files:** Modify `node/CreateNodeRequest.java`, `node/NodeService.java:94-140`, `node/NodeSummaryDTO.java`, `node/NodeDTO.java`, `dashboard/DraftsService.java`, `dashboard/DashboardService.java` (drafts box); `frontend/src/api/nodes.ts` (`type` on `NodeSummary`/`NodeDetail`, `createNode` body). Test: `node/NodeServiceIT.java`, `dashboard/DraftsIT.java`. Also update `Docs/adr/0008-*.md` (status: Excalidraw chosen 2026-11-23, spike skipped).
**Interfaces:** Produces `CreateNodeRequest(String parentId, String title, String afterId, NodeType type)` (null = PAGE); `NodeSummaryDTO.type`, `NodeDTO.type` (`"PAGE" | "BOARD"`); `createNode(spaceId, {parentId?, title?, afterId?, type?: 'PAGE'|'BOARD'})`.
- [ ] **Step 1: Failing tests**
  - `createBoardNode`: POST `{title:"Plan", type:"BOARD"}` -> node `type=BOARD`, `publishState=PUBLISHED`, `node_contents.format=YJS_BOARD_V1`, empty state.
  - `boardsCannotHaveChildren`: POST with `parentId` = a board -> 400 "Boards can't have sub-pages".
  - `boardUnderPageAllowed`: POST `{parentId: page, type: BOARD}` -> 201, `ancestors` ends with the page.
  - `DraftsIT.boardsNotInDrafts`: a board edited by me never appears in `GET /api/me/drafts`.
- [ ] **Step 2:** `./mvnw -q test -Dtest=NodeServiceIT,DraftsIT` -> FAIL.
- [ ] **Step 3: Implement.** Board: `setType(BOARD)`, `setPublishState(PUBLISHED)`, `content.setFormat(YJS_BOARD_V1)`, `content.getSearch().setPublishState(PUBLISHED)`. Parent of type BOARD -> `bad(...)`. Drafts queries add `type != BOARD` (cheap; PUBLISHED already excludes them, the filter documents intent).
- [ ] **Step 4:** same command -> PASS; `./mvnw -q test` PASS.
- [ ] **Step 5:** `git commit -m "feat: create board nodes"`
**Done when:** all four ITs pass and the existing node ITs are green.

### Task 1.2: Board format constants + empty state · **Tier: routine**
**Files:** Create `collab/src/board/format.ts`, `frontend/src/board/format.ts`, `collab/test/board/format.test.ts`.
**Interfaces:** Produces `ELEMENTS = 'elements'`, `META = 'meta'`, `ALLOWED_TYPES: ReadonlySet<string>`, `LIMITS = {points: 5000, textChars: 10000, customDataBytes: 1024, elementBytes: 262144}`, `TOMBSTONE_KEEP = ['id','type','version','versionNonce','isDeleted','index','updated']`, `EMPTY_BOARD_STATE: string` (base64).
- [ ] **Step 1: Failing tests** `emptyBoardStateDecodes` (apply to a fresh doc -> `meta.get('formatVersion') === 1`, `elements.size === 0`); `emptyBoardStateSameInFrontend` (reads `../frontend/src/board/format.ts` text and finds the same base64 literal).
- [ ] **Step 2:** `cd collab && npx vitest run test/board/format.test.ts` -> FAIL.
- [ ] **Step 3:** Generate once with a doc whose `clientID = 1`: `meta.set('formatVersion', 1)`, encode, paste the literal into both files with a comment "same bytes as … (D6)".
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: board document format"`
**Done when:** both tests pass; the literal is byte-identical in both files.

### Task 1.3: `extractBoardText` + parity fixtures · **Tier: routine**
**Files:** Create `collab/src/board/extractBoardText.ts`, `collab/test/board/extractBoardText.test.ts`, `collab/test/fixtures/boards.json` (each: `{name, elements:[...], text}`), `frontend/src/board/extractBoardText.ts`, `frontend/src/board/extractBoardText.parity.node.test.ts`.
**Interfaces:** Produces `extractBoardText(doc: Y.Doc): string` (collab) and `extractBoardText(elements: readonly {type:string,isDeleted?:boolean,index?:string|null,text?:string,originalText?:string}[]): string` (frontend).
- [ ] **Step 1: Failing tests** over fixtures: `boardTextFromFixtures` (each fixture -> `text`); fixtures cover: plain text, text bound to a rectangle and to an arrow, deleted text skipped, `originalText` preferred over wrapped `text`, ordering by `index` not insertion, Bangla text, empty board -> `""`. Frontend parity test runs the same fixtures through the browser version.
- [ ] **Step 2:** both test files FAIL.
- [ ] **Step 3:** Non-deleted `type === 'text'`, sort by `index` (missing index last, then id), `originalText ?? text`, join `\n`, drop empty lines.
- [ ] **Step 4:** PASS in `collab` and `frontend`.
- [ ] **Step 5:** `git commit -m "feat: board text extraction"`
**Done when:** both suites pass on the same fixture file.

### Task 1.4: Sanitizer, tombstone slimming, index fixes · **Tier: core**
**Files:** Create `collab/src/board/sanitize.ts`, `collab/test/board/sanitize.test.ts`. Add `fractional-indexing@3.2.0` to `collab/package.json`.
**Interfaces:** Consumes Task 1.2. Produces (all write in one transaction with origin `SERVER = 'server'`, return what they did for logging):
- `sanitizeChanged(doc: Y.Doc, changed: Map<string, unknown /* oldValue from the Y.Map event */>): {id: string, reason: string}[]` — also restores `oldValue` when the new value has a lower `version` (tie: higher `versionNonce` loses), so an old offline copy can't win a Yjs tie-break even when no other client is online to write back.
- `slimTombstones(doc: Y.Doc, now: number): number` (count slimmed)
- `fixIndexClashes(doc: Y.Doc): number` (count re-indexed)
- [ ] **Step 1: Failing tests**
  - `sanitizerRemovesForbiddenTypes` (`image`, `iframe`, `frame`, unknown type -> key deleted, reason `type`)
  - `sanitizerRemovesMalformed` (non-object, missing `id`/`type`, `value.id !== key`)
  - `sanitizerRemovesOversized` (5,001 points, 10,001-char text, 1,025-byte `customData`, >256 KB element)
  - `sanitizerKeepsValidAndDanglingBindings` (arrow bound to a missing shape is kept untouched)
  - `slimsOnlyOldTombstones` (`updated` 25 h ago -> only `TOMBSTONE_KEEP` keys, same `version`; 23 h ago untouched; live element untouched)
  - `staleCopyCannotResurrectSlimmed` (doc holds slimmed tombstone v5; apply an update from a second doc that set the live element v3 concurrently, choosing client ids so Yjs picks v3; after `sanitizeChanged` the map holds the v5 tombstone again)
  - `lowerVersionNeverWins` (v4 replaces v6 -> v6 restored; equal version, higher nonce -> restored)
  - `indexClashFixedByServerOnly` (two elements with index `a1` -> one gets a key between its neighbours; transaction origin is `SERVER`; second run returns 0)
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Implement. Size check = `Buffer.byteLength(JSON.stringify(v))`. Index fix: sort by `(index, id)`; for each clash keep the first, give the next `generateKeyBetween(prev, nextDistinct)`, bump `version` and set a new `versionNonce` so clients accept it.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: board sanitizer, tombstone slimming and index fixes"`
**Done when:** all eight tests pass; no function touches arrow/text bindings.

### Task 1.5: Collab format switch · **Tier: core**
**Files:** Modify `collab/src/spring.ts` (`Loaded.format: 'YJS_BLOCKNOTE_V1' | 'YJS_BOARD_V1'`, read from `ContentDTO.format`), `collab/src/server.ts` (`onLoadDocument`, `store`, `onChange`/observer), `collab/test/store.test.ts`, `collab/test/helpers.ts` (fake Spring returns a format).
**Interfaces:** Consumes Tasks 1.2-1.4. Produces `Meta.format`; board docs: on load apply `loaded.state ?? EMPTY_BOARD_STATE`, then `slimTombstones` + `fixIndexClashes`; an `elements` observer runs `sanitizeChanged(event.changes.keys -> oldValue)` then `fixIndexClashes` for every non-`SERVER` transaction and logs `board-sanitized {nodeId, userId, id, reason}` (no content). Store uses `extractBoardText` for boards.
- [ ] **Step 1: Failing tests** `boardLoadsEmptyBoardState`, `boardStoreUsesBoardExtractor` (client sets a text element -> stored `text` equals it), `boardSanitizesClientUpdate` (client sends an `image` -> other client never ends with it; log line has userId and reason), `pageStillUsesPageExtractor` (existing page path unchanged), `serverFixesDoNotLoop` (observer doesn't re-trigger on `SERVER` origin).
- [ ] **Step 2:** `cd collab && npx vitest run` -> new tests FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** `npm run typecheck && npx vitest run` PASS.
- [ ] **Step 5:** `git commit -m "feat: collab handles board documents"`
**Done when:** collab suite green; a page doc behaves exactly as before. Open PR 1.

## Phase 2 — PR `feat/board-screen`: binding + board screen, basic drawing live

### Task 2.1: Excalidraw dependency + self-hosted assets · **Tier: routine**
**Files:** `frontend/package.json` (`"@excalidraw/excalidraw": "0.18.1"`), create `frontend/scripts/copy-excalidraw-assets.mjs` (copies `node_modules/@excalidraw/excalidraw/dist/prod/fonts` -> `frontend/public/excalidraw-assets/fonts`), `predev`/`prebuild` scripts, `.gitignore` (`frontend/public/excalidraw-assets/`), `frontend/src/board/assetPath.ts` (sets `window.EXCALIDRAW_ASSET_PATH = import.meta.env.BASE_URL + 'excalidraw-assets/'`), `deploy/Caddyfile` (`Cache-Control: public, max-age=31536000, immutable` for `/app/assets/*` and `/app/excalidraw-assets/*`) if not already set.
- [ ] **Step 1:** Run `npm ci && npm run build`; check `dist/excalidraw-assets/fonts/Nunito/` exists.
- [ ] **Step 2:** `git commit -m "build: self-host whiteboard assets"`
**Done when:** build contains the fonts; `npm run build` warns only about the new lazy chunk, which is not in the entry chunk (`grep -L excalidraw dist/assets/index-*.js`).

### Task 2.2: Binding (pure, no canvas) · **Tier: core**
**Files:** Create `frontend/src/board/binding/{sync.ts,undo.ts,sync.test.ts,undo.test.ts}`.
**Interfaces:** Produces
- `type El = {id:string; type:string; version:number; versionNonce:number; isDeleted:boolean; index:string|null; updated:number; [k:string]:unknown}`
- `LOCAL = 'local'`
- `pushLocal(doc: Y.Doc, elements: readonly El[], known: Map<string, number>, opts: {editingId: string | null, drawingFreedraw: boolean}): string[]` — sets every element whose `version > known.get(id)` in one transaction (origin `LOCAL`), skips an in-progress freedraw, returns ids sent.
- `sceneFromDoc(doc: Y.Doc, local: readonly El[], editingId: string | null): El[]` — map values sorted by `(index, id)`; for `editingId` keep the local copy.
- `writeBackLosers(doc: Y.Doc, local: readonly El[], changedIds: Iterable<string>): string[]` — where the map value has lower version than local (tie: higher `versionNonce` loses), set local copy once.
- `createThrottle(ms = 100): (fn: () => void) => void` (leading + trailing).
- `createUndo(doc: Y.Doc): BoardUndo` where `interface BoardUndo { undo(): void; redo(): void; stopCapturing(): void; canUndo(): boolean; canRedo(): boolean; destroy(): void }`. Built on `new Y.UndoManager(doc.getMap(ELEMENTS), {trackedOrigins: new Set([LOCAL]), captureTimeout: 500})`; Yjs decides which elements are ours and skips map keys someone else overwrote since.
  - **Re-stamp:** every element an undo or redo writes back gets `version = maxSeen + 1` (`maxSeen` = highest `version` this client has seen for that id, local or remote, kept in a `Map<string, number>` the binding updates), a new random `versionNonce` and `updated = Date.now()`. Without it the restored copy carries its old, lower version and collab's newer-version rule (Task 1.4 `sanitizeChanged`) puts the newer value back. The re-stamp must land in the same undo step, so the next redo/undo still works: do it in the UndoManager's `stack-item-popped` handler (Yjs still has `undoing`/`redoing` set there) with origin = the UndoManager, then merge the extra stack item Yjs pushes into the one just created (`Y.mergeDeleteSets` on `insertions`/`deletions`). Try this first, timeboxed to half a day.
  - **Fallback (if Yjs can't merge the re-stamp into the same undo step within the timebox):** drop `Y.UndoManager` and keep our own per-user history behind the same `BoardUndo` interface. A gesture = a list of `{id, before, after}` (element values before and after it; `before` is `null` for a created element, which undo writes as a tombstone). Undo pops the last gesture; for each entry, if the element's current map value deep-equals `after`, write `before` as a normal `LOCAL` change with `version = maxSeen + 1`, a new random `versionNonce` and `updated = Date.now()`; otherwise skip that element (someone changed it since). The gesture moves to the redo stack; redo does the same in reverse (current deep-equals `before` -> write `after`, re-stamped). A new local gesture clears the redo stack. Gestures are recorded from `pushLocal` and closed by `stopCapturing()`; writes made by undo/redo themselves are not recorded as new gestures. Same keyboard routing (`bindUndoKeys`), same one-gesture-one-step rule, and every Task 2.2 undo test must pass unchanged.
  - **One gesture = one step:** while a drag, resize, rotate, pen stroke or text edit is in progress the binding keeps writing with origin `LOCAL` (merged by Yjs into one item); on gesture end (pointer up, text editor closed, freedraw finished) it calls `stopCapturing()`. `captureTimeout: 500` only groups quick keyboard nudges.
- `undoKeyAction(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey'>): 'undo' | 'redo' | null` — Ctrl/Cmd+Z -> undo; Ctrl/Cmd+Shift+Z and Ctrl+Y -> redo.
- `bindUndoKeys(target: HTMLElement, undo: BoardUndo): () => void` — capture-phase `keydown` on the board container; on a match calls `preventDefault()` + `stopPropagation()` so Excalidraw's own history never runs; ignores keys while a text element is being edited (Excalidraw's text editor keeps its own in-text undo).
- [ ] **Step 1: Failing tests** (`sync.test.ts`): `localEditSetsMap`, `unchangedVersionNotResent`, `freedrawSentOnlyOnFinish`, `throttleAtMostTenPerSecond` (fake timers: 50 calls in 1 s -> ≤ 10 runs, last call runs), `remoteSetBuildsSortedScene`, `remoteChangeDeferredWhileEditing`, `concurrentEditsConvergeAnyOrder` (3 docs, same element edited v4/v5/v5 with different nonces, updates applied in all 6 orders + `writeBackLosers` -> all docs hold the same winner = highest version, lowest nonce), `tombstonesMerge` (delete on A, move on B with lower version -> deleted wins). `undo.test.ts`: `undoOnlyOwnChanges` (A adds X, B adds Y, A undo -> Y stays), `undoSkipsElementChangedByOthers` (A moves X and Z in one step, B then edits X, A undo -> X keeps B's value, Z goes back), `remoteNeverEntersUndo` (only B edits -> A's undo stack empty), `undoRestampsVersion` (X at v7 after A's move from v6; undo -> X has the v6 position with `version === 8` and a `versionNonce` different from both earlier ones; redo -> v7 position with `version === 9`), `redoAfterRestampWorks` (undo, redo, undo round trip ends at the original position and each step is one press), `oneDragIsOneUndoStep` (20 writes 100 ms apart, then `stopCapturing()`, then one more edit -> two undos return to the start, the first only removes the last edit), `keyboardUndoUsesYjs` (jsdom: `bindUndoKeys` on a div; dispatch Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Cmd+Z -> `undo`/`redo` spies called, events `defaultPrevented`, a listener on a child element added by "Excalidraw" in bubble phase never fires). `collab/test/board/undoRule.test.ts` (imports `frontend/src/board/binding/undo.ts`, which needs only `yjs`): `undoSurvivesServerVersionRule` (client doc A and a server doc with the Task 1.4 `sanitizeChanged` observer, synced; A moves X, A undo; after syncing both ways the server and A both hold the undone position, i.e. the server rule did not put the newer copy back).
- [ ] **Step 2:** `cd frontend && npx vitest run src/board/binding` -> FAIL.
- [ ] **Step 3:** Implement per Interfaces.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: whiteboard sync binding"`
**Done when:** all 16 tests pass (no canvas needed; `keyboardUndoUsesYjs` uses plain jsdom).

### Task 2.3: Route, sidebar entry, lazy screen · **Tier: routine**
**Files:** Modify `frontend/src/app/App.tsx` (`/b/:nodeId` -> lazy `BoardView`), `frontend/src/tree/PageTree.tsx` (board icon, Lucide `presentation`; board rows link to `/app/b/:id`; board rows have no "add sub-page"), `frontend/src/tree/useCreatePage.ts` (accept `type`), `frontend/src/tree/Sidebar.tsx` + space/page ⋯ menus ("New board"). Tests: `PageTree.test.tsx` (`boardRowLinksToBoardRoute`, `boardRowHasNoAddChild`), `Sidebar.test.tsx` (`newBoardCreatesBoard`).
- [ ] Steps: failing tests -> FAIL -> implement -> PASS -> `git commit -m "feat: boards in the sidebar"`
**Done when:** the three tests pass; opening a board shows a loading state (no Excalidraw yet).

### Task 2.4: Board screen with live drawing · **Tier: core**
**Files:** Create `frontend/src/board/BoardView.tsx`, `BoardCanvas.tsx`, `Board.module.css`; reuse `useCollab` (`frontend/src/editor/collab.ts`), `SaveIndicator`, `Presence`. Create `frontend/e2e/board.spec.ts`; modify `frontend/e2e/prod-build.spec.ts`.
**Interfaces:** Consumes Task 2.2 (`pushLocal`, `sceneFromDoc`, `writeBackLosers`, `createThrottle`, `createUndo`), `useCollab(nodeId, ydoc, userId, enabled, epoch)`.
- Excalidraw props: `isCollaborating`, `viewModeEnabled={access !== 'EDIT'}`, `UIOptions={{tools:{image:false}, canvasActions:{loadScene:false, saveToActiveFile:false, saveAsImage:true, export:{saveFileToDisk:true}}}}`, `onPaste` returns `false` for files/images, `name={title}`, custom `<MainMenu>` without socials/links, undo/redo routed to `createUndo` through `bindUndoKeys` on the board container + our own undo/redo buttons (Excalidraw's are hidden by CSS); call `stopCapturing()` from `onPointerUp` and when the text editor closes. Remote applies via `updateScene({elements, captureUpdate: CaptureUpdateAction.NEVER})` after `restoreElements(..., {repairBindings: true})`.
- "View only" pill in the top bar for viewers; empty hint "Draw with the pen, add shapes, or paste Mermaid code." until the first non-deleted element.
- [ ] **Step 1: Failing e2e** (`board.spec.ts`, two contexts, real collab): `both draw and see each other within 2 s` (rectangle + a pen stroke), `viewer sees live drawing and cannot draw`, `undo in tab A keeps tab B's shape`, `image paste is blocked`, `empty hint disappears on first shape`. `prod-build.spec.ts`: `board has no external requests` (open a board, draw text, record `page.on('request')`; every URL starts with the app origin).
- [ ] **Step 2:** `npx playwright test board prod-build` -> FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test -- --run && npx playwright test` PASS.
- [ ] **Step 5:** `git commit -m "feat: live whiteboard screen"`
**Done when:** all six e2e tests pass in CI. Open PR 2.

## Phase 3 — PR `feat/board-presence`: cursors, laser, follow, bring everyone

### Task 3.1: Cursors, selections, laser · **Tier: routine**
**Files:** Create `frontend/src/board/presence.ts`, `presence.test.ts`; modify `BoardCanvas.tsx`.
**Interfaces:** Produces `type BoardAwareness = {user:{id,name,color}, pointer?:{x,y,tool:'pointer'|'laser'}, button?:'up'|'down', selectedElementIds?:Record<string,true>, viewport?:{x,y,width,height,zoom}}`; `toCollaborators(states: Map<number, BoardAwareness>, selfClientId: number, viewers: Set<number>): Map<SocketId, Collaborator>` (viewer pointer: `renderCursor: false` unless `tool === 'laser'`); `createRateLimiter(perSecond: number)`.
- [x] **Step 1: Failing tests** `collaboratorsExcludeSelf`, `viewerShowsLaserOnly`, `colourFromUserColor` (same `userColor(id)` as pages), `pointerAtMostTenPerSecond`, `viewportOnlyWhenChangedAtMostFour`.
- [x] Steps 2-4 as usual (`npx vitest run src/board/presence.test.ts`).
- [x] **Step 5:** `git commit -m "feat: whiteboard cursors and laser"`
**Done when:** tests pass; manually two browsers see named cursors and a viewer's laser.

### Task 3.2: Follow, bring everyone to me, zoom to fit · **Tier: core**
**Files:** Modify `collab/src/server.ts` (`onStateless`: relay allowlisted `{type:'summon', userId}` from EDIT connections only, 1 per 10 s per connection, drop the rest), `collab/test/stateless.test.ts`; create `frontend/src/board/follow.ts`, `follow.test.ts`, `FollowChip.tsx`; modify `Presence` usage (avatar menu: Follow; Bring everyone to me for editors).
**Interfaces:** Produces `fitViewport(their: Viewport, mine: {width,height}): {scrollX:number, scrollY:number, zoom:number}` (fit their visible area into mine, keep my aspect, clamp zoom 0.1..30); `useFollow(api, awareness)` -> `{following: Person|null, follow(id), stop()}`; stops on user pan/zoom/pointerdown.
- [x] **Step 1: Failing tests** collab: `summonRelayedToOthers`, `summonRateLimited`, `viewerCannotSummon`, `unknownStatelessDropped`. Frontend: `fitViewportKeepsAspect`, `fitViewportCentresTheirArea`, `followStopsOnPan`. E2e (`board-presence.spec.ts`): `cursor names visible`, `follow moves my view`, `bring everyone moves the other view`, `Shift+1 zooms to fit`.
- [x] Steps 2-4.
- [x] **Step 5:** `git commit -m "feat: follow and bring everyone on boards"`
**Done when:** unit + e2e pass; chip text "Following <name> · Stop". Open PR 3.

## Phase 4 — PR `feat/board-tools`: Sketch/Precise, shape packs, Mermaid, export, dark mode

### Task 4.1: Sketch / Precise + Nunito default · **Tier: routine**
**Files:** Create `frontend/src/board/style.ts`, `style.test.ts`, `StyleSwitch.tsx`.
**Interfaces:** `styleDefaults(mode: 'sketch'|'precise'): Partial<AppState>` -> sketch `{currentItemRoughness:1, currentItemRoundness:'round', currentItemArrowType:'round', gridModeEnabled:false, objectsSnapModeEnabled:false}`; precise `{currentItemRoughness:0, currentItemRoundness:'sharp', currentItemArrowType:'elbow', gridModeEnabled:true, objectsSnapModeEnabled:true}`; both `currentItemFontFamily: FONT_FAMILY.Nunito`. `loadMode()/saveMode()` in `localStorage['kf.board.style']` (try/catch, default `'sketch'`).
- [x] Tests: `sketchDefaults`, `preciseDefaults`, `modeRemembered`, `modeDefaultsToSketchWhenStorageThrows`, `switchKeepsExistingElements` (scene untouched). Then implement, PASS, `git commit -m "feat: sketch and precise board styles"`.
**Done when:** tests pass; toolbar order matches WB 7.5.

### Task 4.2: Shape packs · **Tier: core** (licence judgement)
**Files:** `frontend/public/board-libraries/*.excalidrawlib` (flowchart, UML class/sequence, ER/database tables), `frontend/public/board-libraries/NOTICE`, `frontend/src/board/libraries.ts` (`loadBundledLibraries(): Promise<LibraryItems>` via `restoreLibraryItems`), CSS hiding "Browse libraries"/publish links.
- [ ] Pick each library from the Excalidraw libraries repo, keep only MIT (or compatible) ones, record source URL + licence + author in NOTICE. Strip any `image` elements.
- [ ] Test `bundledLibrariesHaveOnlyAllowedTypes` (every element type in `ALLOWED_TYPES`); e2e `shape pack inserts a UML class` + `no external requests` still passes with the library panel open.
- [ ] `git commit -m "feat: bundled shape packs for boards"`
**Done when:** tests pass; NOTICE lists every bundled file.

### Task 4.3: Mermaid dialog · **Tier: core**
**Files:** `frontend/package.json` (`"@excalidraw/mermaid-to-excalidraw": "2.2.2"`), create `frontend/src/board/mermaid.ts`, `mermaid.test.ts`, `MermaidDialog.tsx`; CSS hides the built-in "Mermaid to Excalidraw" menu item.
**Interfaces:** `toBoardElements(result: {elements: unknown[], files?: Record<string, unknown>}): {ok: true, elements} | {ok: false, message: string}`; `mermaidError(e: unknown): string` (keeps Mermaid's message incl. the line number).
- [ ] Tests: `filesMeansUnsupported` -> message "This diagram type isn't supported yet. Try a flowchart, sequence or class diagram.", `elementsPassThroughConvert`, `parseErrorKeepsLineNumber`, `emptyInputIsAnError`. E2e: `mermaid flowchart import`, `unsupported mermaid type message`.
- [ ] `git commit -m "feat: mermaid to board shapes"`
**Done when:** tests pass; no blank result path exists (empty -> message).

### Task 4.4: Export + dark mode · **Tier: routine**
**Files:** `BoardCanvas.tsx` (`theme` prop, menu toggle), `frontend/src/board/theme.ts` + test.
- [ ] Tests: `themeRemembered`, `themeDefaultsLight`. E2e `export png uses board title` (download name `<title>.png`), `export svg selection only`.
- [ ] `git commit -m "feat: board export and dark mode"`
**Done when:** Excalidraw's export dialog offers PNG/SVG, selection, background toggle and 1x/2x/3x; tests pass. Open PR 4.

## Phase 5 — PR `feat/board-safety`: offline, size limits, large delete, stroke simplification

### Task 5.1: Offline local copy for boards · **Tier: core**
**Files:** `BoardView.tsx` (same `pendingFor` slot, Web Lock, epoch handling, `useEndSessionOnLeave`, logout send-all as `PageView`), `frontend/src/board/BoardView.test.tsx`, `frontend/e2e/board-offline.spec.ts`.
- [ ] Tests: `boardWritesLocalCopyOnUpdate`, `olderEpochCopyGoesToRecovered`; e2e `offline draw then reconnect merges`, `restore while another tab is open shows the notice (4409)`.
- [ ] `git commit -m "feat: offline drawing on boards"`
**Done when:** both e2e pass; SaveIndicator states match RT 7.4.

### Task 5.2: Board size wording + Continue in a new board · **Tier: routine**
**Files:** `collab/src/server.ts` (relay `{type:'continued', id, title}` from EDIT connections, same limiter as summon), `collab/test/stateless.test.ts`; `frontend/src/board/SizeBar.tsx`, `continueBoard.ts` + test.
**Interfaces:** `continueBoard(node: NodeDetail): Promise<NodeDetail>` = `createNode(spaceId, {parentId: node.parentId, afterId: node.id, title: node.title + ' (2)', type: 'BOARD'})`.
- [ ] Tests: collab `continuedRelayed`; frontend `continueKeepsParentAndAddsSuffix`, `nearAndFullWording` (exact WB 7.9 copy). E2e: `continue in a new board shows chip to others` (cap lowered via test env `COLLAB_MAX_STATE_BYTES`).
- [ ] `git commit -m "feat: continue a full board in a new one"`
**Done when:** tests pass; embed block is not changed.

### Task 5.3: Large-delete version · **Tier: core**
**Files:** Create `collab/src/board/largeDelete.ts`, `collab/test/board/largeDelete.test.ts`; modify `collab/src/spring.ts` (`StoreBody.largeDelete?: boolean`), `server.ts`; Spring `collab/StoreRequest.java` (+ `Boolean largeDelete`), `nodecontent/NodeContentService.storeFromCollab`, `nodeversion/NodeVersionService` (`createVersion(nodeId, AUTO, "Before a large delete")` before the store, skipped if one with that name exists in the last 10 min); test `collab/CollabIT.java`.
**Interfaces:** `class LargeDeleteTracker { constructor(liveCount: number); onUserDeleted(id: string): void; onUserRestored(id: string): void; isLarge(): boolean /* deleted >= 20 && deleted >= 0.3 * baseline */; reset(liveCount: number): void }`.
- [ ] Tests: collab `largeDeleteFlagThresholds` (19 of 20 no; 20 of 100 no (20 %); 30 of 100 yes), `largeDeleteBaselineAfterReload`, `serverOriginDeletesIgnored` (sanitizer/slimming don't count), `flagResetAfterStore`. Spring IT `largeDeleteSavesVersionFirst` (version holds the pre-delete state), `largeDeleteVersionRateLimited` (second within 10 min -> no new version). E2e `select-all delete creates a version and restore brings everything back`.
- [ ] `git commit -m "feat: snapshot a board before a large delete"`
**Done when:** all tests pass.

### Task 5.4: Stroke simplification · **Tier: routine**
**Files:** Create `frontend/src/board/simplify.ts`, `simplify.test.ts`, `frontend/src/board/fixtures/strokes.json` (≥ 5 recorded strokes from a real pen/mouse session); call it in `pushLocal` before sending a finished freedraw.
**Interfaces:** `simplifyStroke(points: [number, number][], pressures: number[], tolerance: number): {points, pressures}` (Ramer–Douglas–Peucker; keep first/last; pressures follow kept points); tolerance = `0.5 / zoom`.
- [ ] Tests: `keepsEndpoints`, `pressuresFollowKeptPoints`, `atLeastHalfFewerPointsOnRecordedStrokes`, `maxDeviationWithinTolerance`, `twoPointStrokeUnchanged`.
- [ ] `git commit -m "feat: simplify pen strokes before sending"`
**Done when:** tests pass on all recorded strokes.

### Task 5.5: Measure performance and memory · **Tier: routine**
**Files:** `frontend/e2e/board-perf.spec.ts` (tagged `@perf`, not in CI) generating 2,000 elements; local `Docs/PROJECT_CONTEXT.md` (not committed).
- [ ] Measure pan/zoom frame times on a 4 GB laptop profile (Chrome CPU 4x throttle) and collab memory with a 1 MB and a 4 MB board on kf-vm (ask the owner before touching the VM). If two 4 MB boards + pages exceed `mem_limit: 192m`, set `COLLAB_MAX_BOARD_BYTES` lower and record it.
- [ ] `git commit -m "test: board performance check"`
**Done when:** numbers are recorded and any limit change is in collab config. Open PR 5.

## Phase 6 — PR `feat/board-embed`: `/board` embed + preview

### Task 6.1: Preview endpoints + SVG sanitizer · **Tier: core**
**Files:** `nodecontent/NodeContent.java` (+ `String preview`, `Date previewUpdatedAt`), `common/SchemaSetup.java` (validator: optional `preview` string ≤ 204,800 chars, optional `previewUpdatedAt` date), create `nodecontent/PreviewController.java`, `nodecontent/SvgSanitizer.java`; modify `nodeversion/NodeVersionService.restore` (clear preview); tests `nodecontent/PreviewIT.java`, `nodecontent/SvgSanitizerTest.java`.
- **Where the preview lives:** its own fields on the board's `node_contents` document, next to `state`, never inside the Yjs state. Written only by `PUT .../preview` with a targeted `$set` (no revision bump, no `contentHash`/`text`/`editSession` change). `storeFromCollab` never reads or writes it, and its size check covers `state` only, so the preview never counts toward the 4 MB cap. `NodeVersionService.createVersion` copies `state`/`text` field by field as today and must not copy `preview`; the history view renders versions from their own state (Task 7.3). `ContentDTO` (content GET and collab load) does not carry it; every read of `node_contents` that loads the whole document for state work uses a projection without `preview`.
**Interfaces:** `PUT /api/nodes/{id}/preview` (EDIT, body = SVG text, `image/svg+xml`) -> 204; `GET /api/nodes/{id}/preview` (VIEW) -> SVG with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; font-src data:; sandbox`, `X-Content-Type-Options: nosniff`, 404 if none. `SvgSanitizer.clean(String svg): String` — JDK `DocumentBuilder` with DTDs/external entities off; allowlist elements `svg g path rect ellipse circle line polyline polygon text tspan defs style clipPath mask symbol use`; drop `on*` attributes, any `href` not starting `#`, `style` text containing `url(` other than `data:font/`; throw 400 if root isn't `svg`.
- [ ] Tests: `previewRequiresEdit` (viewer PUT 403), `previewRejectsOver200KB` (413), `previewSvgSanitized` (script, `foreignObject`, `onload`, `<image href=http…>` gone), `previewNotForPages` (400), `restoreClearsPreview`, `previewNotInVersionSnapshot` (PUT a preview, name a version -> the `node_versions` document has no `preview` field and its `state` equals the board's state bytes; restoring it doesn't bring an old preview back), `previewDoesNotCountTowardCap` (state at 4 MB - 1 KB plus a 200 KB preview -> collab store still accepted; PUT preview leaves `revision` unchanged); unit `rejectsDoctypeEntities`, `keepsEmbeddedFontStyle`.
- [ ] `git commit -m "feat: board preview images"`
**Done when:** all pass; GET never returns unsanitized bytes.

### Task 6.2: Browser preview job · **Tier: routine**
**Files:** Create `frontend/src/board/preview.ts`, `preview.test.ts`; hook in `BoardView` (`visibilitychange` hidden, unmount, and ≤ 1/min while edited).
**Interfaces:** `createPreviewJob(make: (scale: number) => Promise<string>, put: (svg: string) => Promise<void>, now = Date.now): {changed(): void, flush(): Promise<void>}` — skip if nothing changed; over 200 KB retry once at scale 0.5; still too big -> no upload.
- [ ] Tests: `noUploadWithoutChange`, `atMostOncePerMinute`, `flushOnHide`, `retriesSmallerOnceThenGivesUp`.
- [ ] `git commit -m "feat: upload board previews"`
**Done when:** tests pass; viewers never upload.

### Task 6.3: `/board` block in pages · **Tier: core**
**Files:** Create `frontend/src/editor/BoardBlock.tsx`, `collab/src/embeds.ts`; modify `frontend/src/editor/schema.ts` (add `board` block, props `{boardId: string}` only), `slashItems.ts` (`/board`), `frontend/src/editor/extractText.ts` + `collab/src/extractText.ts` (board block contributes no text), `collab/src/spring.ts` (`StoreBody.embeds?: string[]`), `collab/src/server.ts` (pages send `embeds`), `collab/test/fixtures/pages.json` (add a page with a board block), `schema.node.test.ts`; Spring `collab/StoreRequest.java` (+ `List<String> embeds`), `nodecontent/NodeContent.Search` (+ `List<Embed> embeds`, `record Embed(String id, String title)`), `nodecontent/NodeContentService.storeFromCollab`, `node/NodeService.update` (rename), `common/SchemaSetup.java` (validator), `src/main/resources/search/nodes_search.json` (map `search.embeds.title` like `search.title`), `search/SearchService.java` (query + highlight `search.embeds.title`); Spring IT `slashBoardCreatesChildOfPage` in `NodeServiceIT`, `EmbedTitleIT.java`; e2e `board-embed.spec.ts`.
**Interfaces:** `boardIdsIn(fragment: Y.XmlFragment): string[]` (collab, unique, document order). Spring: on store, `search.embeds` = for each id that is an ACTIVE `BOARD` in the same space, `{id, title}`; others dropped. On `NodeService.update` of a BOARD whose title changed: `updateMany({"search.embeds.id": boardId}, {$set: {"search.embeds.$[e].title": newTitle}}, arrayFilters e.id == boardId)` on `node_contents`.
- Block states: preview `<img src="/api/nodes/{id}/preview">` or empty placeholder + **the board's current title** (from `GET /api/nodes/{boardId}`, shared react-query key `['node', boardId]` so a rename in the sidebar updates it at once; never a title stored in the page) + "Open"; 403 -> "You don't have access to this board."; 404 -> "This board was deleted.". Opens `/app/b/:id` with `state.from` so Back restores the page scroll.
- [ ] Tests: `slashItems.test.tsx` `boardSlashCreatesChildBoard`; `BoardBlock` tests `showsPreview`, `showsCurrentTitle` (rename in the query cache -> block text changes, no page edit), `noAccessMessage`, `deletedMessage`; collab `embedsSentWithStore` (page with two board blocks -> `embeds` has both ids once); parity fixture passes in both extractors (board block -> no text); `schema.node.test.ts` round-trips a board block. Spring `EmbedTitleIT.renamedBoardUpdatesEmbedTitle` (page stored with `embeds: [b]`; rename b "Plan" -> "Sprint map" -> page's `search.embeds[0].title == "Sprint map"`; search "Sprint" returns the page; `revision` of the page unchanged), `EmbedTitleIT.embedsIgnoreForeignIds` (an id from another space or a PAGE id is dropped). E2e: `/board creates a child board, shows the preview after editing, opens and returns`.
- [ ] `git commit -m "feat: embed boards in pages"`
**Done when:** all pass; a page with a board block never loads the Excalidraw chunk (e2e asserts no request for it). Open PR 6.

## Phase 7 — PR `feat/board-finish`: Bangla, touch, history, search

### Task 7.1: Bangla text · **Tier: core**
**Files:** `frontend/public/excalidraw-assets/extra/NotoSansBengali-subset.woff2` (committed source in `frontend/src/board/fonts/` + OFL licence in NOTICE), create `frontend/src/board/bangla.ts`, `bangla.test.ts`.
**Interfaces:** `registerBengaliFallback(base: string): Promise<void>` (adds `FontFace` for `Nunito` and `Excalifont` with the Bengali unicode range; awaited before first render); `addBengaliToSvg(svg: SVGSVGElement, fontDataUrl: string): void` (only if any `<text>` holds U+0980-09FF).
- [ ] Tests: `svgGetsBengaliFontOnlyWhenNeeded`, `registersBothFamilies`. E2e `bangla text renders and exports` (type "আমাদের পরিকল্পনা", screenshot compare of the text box; exported SVG contains the `@font-face`; box width > 0 and fits the text).
- [ ] `git commit -m "feat: Bangla text on boards"`
**Done when:** passes in Chromium CI; manual check on Android Chrome and macOS Safari recorded in the PR.

### Task 7.2: Touch, stylus, mobile top bar · **Tier: routine**
**Files:** `BoardView.tsx`, `PenHint.tsx`, `Board.module.css`.
- [ ] Show the pen-mode hint once when `appState.penDetected` turns true (`localStorage['kf.board.penHint']`); action sets `penMode: true`. Below 640 px collapse top-bar actions into ⋯.
- [ ] Tests: `penHintShownOnce`, `topBarCollapsesBelow640`; e2e (`touch` project) `two-finger pinch zooms without drawing`.
- [ ] `git commit -m "feat: touch and stylus on boards"`
**Done when:** tests pass.

### Task 7.3: History view for boards · **Tier: routine**
**Files:** `frontend/src/history/HistoryPanel.tsx` (board branch: no diff/compare), create `frontend/src/history/BoardVersionPreview.tsx` (lazy: decode version state -> elements -> `exportToSvg`).
- [ ] Tests: `boardHistoryHasNoCompare`, `boardVersionRendersPreview` (exportToSvg mocked). E2e covered by Task 5.3 restore test.
- [ ] `git commit -m "feat: board version history"`
**Done when:** Restore and Name version work for boards.

### Task 7.4: Search finds boards · **Tier: routine**
**Files:** `search/SearchService.java`, `SearchResultDTO.java` (type `BOARD`), `frontend/src/palette/*` (board icon, link `/app/b/:id`), Spring `search/SearchIT.java`.
- [ ] Tests: `boardTextSearchable` (store board text via the internal API, search a word -> BOARD hit), `boardTitleSearchable`, `banglaBoardTextSearchable`; palette test `boardHitOpensBoardRoute`.
- [ ] `git commit -m "feat: search boards"`
**Done when:** tests pass. Open PR 7.

---

## Tiers
- **Routine (a cheaper, faster implementer is fine):** 1.1, 1.2, 1.3, 2.1, 2.3, 3.1, 4.1, 4.4, 5.2, 5.4, 5.5, 6.2, 7.2, 7.3, 7.4 — signatures and tests fully fixed here, little judgement.
- **Core (needs the senior implementer):** 1.4, 1.5, 2.2, 2.4, 3.2, 4.2, 4.3, 5.1, 5.3, 6.1, 6.3, 7.1 — concurrency/CRDT rules, security (sanitizers), licence judgement, or third-party API integration that may need adapting.
- Every PR gets a senior review before merge.

## Calls made while planning (review these)
1. Pinned `@excalidraw/excalidraw` 0.18.1 (latest stable on 2026-11-27) and `@excalidraw/mermaid-to-excalidraw` 2.2.2 (matches Excalidraw's own dependency, avoids two Mermaid copies).
2. Undo uses `Y.UndoManager` (origin `local`) instead of Excalidraw's history, because Excalidraw's delta undo can revert a property someone changed later; Excalidraw's undo buttons are hidden and keys rerouted. Restored elements are re-stamped (`maxSeen + 1`, new nonce) inside the same undo step so collab's newer-version rule keeps them; one gesture = one step via `stopCapturing()` on gesture end. While a text element is being typed in, Ctrl+Z stays with the text box.
3. Own Mermaid dialog instead of the built-in one (built-in inserts images for unsupported types and can't be intercepted).
4. Own follow logic and avatar menu; Excalidraw's built-in user list is not used.
5. Bengali via extra `FontFace` under the `Nunito`/`Excalifont` family names + SVG post-processing.
6. Assets copied by a small script into `public/excalidraw-assets/` (gitignored) instead of adding a Vite copy plugin.
7. Preview stored as its own fields on `node_contents` (`preview`, `previewUpdatedAt`), next to the board state but never inside the Yjs state: it doesn't count toward the 4 MB cap, isn't copied into versions, isn't sent to collab or the content GET, and purge already removes it. Served by its own GET with a strict CSP.
8. SVG sanitizer written with the JDK XML parser and an allowlist (no new dependency).
9. Board block stores only `{boardId}` and always shows the board's current title from the API. For search, collab sends the page's embedded board ids with each store; Spring keeps `search.embeds: [{id, title}]` on the page's `node_contents` and updates every copy when a board is renamed. Board titles are kept out of the page's Yjs text, so a rename never needs a page edit.
10. Collab relays only allowlisted stateless messages (`summon`, `continued`) from EDIT connections, 1 per 10 s per connection.
11. Board-specific live cap only if the Task 5.5 memory measurement needs it.
12. ADR 0008 update goes in Phase 1.
13. Perf test is tagged and kept out of CI (needs throttled real hardware numbers).
