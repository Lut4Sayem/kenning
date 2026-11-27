# Real-time Co-editing (Release 1b, sync piece) Implementation Plan


**Goal:** Several people edit one page live through a Hocuspocus service, with presence, view-only watchers, offline safety and the D6 epoch rule kept.

**Architecture:** New Node service `collab/` (Hocuspocus v4 + Yjs) holds one Y.Doc per open page, authenticates with a short HMAC ticket from Spring, and is the only writer of page content through Spring's `/internal/collab/*` API (shared secret). Spring keeps every rule (access, revision, epoch, caps, search copy, versions) and tells collab to reset/revalidate/flush. The browser connects with `HocuspocusProvider`; BlockNote's collaboration config gives cursors; the per-tab local copy stays as the offline safety net.

**Tech Stack:** Java 17 / Spring Boot 4.1, MongoDB; Node 22 (required by Hocuspocus 4) + TypeScript + `@hocuspocus/server` 4.x + `yjs` ^13.6.33 + Vitest; React + BlockNote 0.57 + `@hocuspocus/provider` 4.x; Playwright; Docker Compose + Caddy on the Azure VM.

**Spec:** `Docs/specs/2026-11-21-realtime-coediting-design.md` (APPROVED 2026-11-21). Section numbers below (7.1 ...) point into it.

## Global Constraints

- Branch `feature/1b-realtime-coediting` from `main`; one commit per task; PR at the end, not merged; CI green.
- Commits carry no attribution trailers; local-only notes are never committed; never `git add -f`.
- After every task: update `Docs/PROJECT_CONTEXT.md` (local only): progress line, code map, decisions.
- Secrets only from env: `COLLAB_SECRET` (app + collab), `APP_ORIGIN` (collab, e.g. `https://knowledgeforge-lrs.eastasia.cloudapp.azure.com`), `SPRING_INTERNAL_URL` (collab, default `http://localhost:8080`), `COLLAB_INTERNAL_URL` (app, default `http://localhost:1234`). Spring props: `kf.collab.secret=${COLLAB_SECRET:}`, `kf.collab.url=${COLLAB_INTERNAL_URL:http://localhost:1234}`.
- Ticket: `exp = now + 60 s`; HMAC-SHA256 with `COLLAB_SECRET`.
- Store: debounce 2000 ms, maxDebounce 10000 ms; retry backoff 1, 2, 5, 10, 30 s (stay at 30); doc not unloaded until stored.
- Caps: state 4 MB, text 1 MB (existing `NodeContentService.decodeState`); live doc cap 4 MB.
- Limits: 25 connections per page, 10 sockets per user, `maxPayload` 1 MB, rate 50 messages/s burst per connection, forced reconnect after 30 min.
- Close codes: `4403` access changed / ticket refresh, `4409` restored, `4429` too many.
- Copy (exact): too large = "This page reached its size limit. Move some sections into sub-pages."; limit = "Too many people on this page right now."; offline = "Offline: changes kept on this device"; retry = "Couldn't save, retrying"; restore notice = existing `RECOVERED_NOTICE`.
- Collab container `mem_limit: 192m`, `NODE_OPTIONS=--max-old-space-size=128`.
- Fragment name is always `'document-store'`; a page without state starts from `EMPTY_PAGE_STATE` (bytes copied from `frontend/src/editor/schema.ts`).
- Logs: one line per connect/disconnect/store/error with `nodeId` + `userId`, never content.
- Before coding Tasks 1, 3 and 4: re-check the current Hocuspocus v4 server/provider docs and BlockNote 0.57 collaboration docs. Names used below that must be confirmed: `onAuthenticate` `data.connection.readOnly`, `requestHeaders` (Fetch `Headers` in v4), `onStoreDocument` `lastContext`, `onRequest`, `Document.broadcastStateless`, `connection.close({code, reason})`, `server.hocuspocus.documents`, provider `token` as async function, provider `onStateless`, `onClose`, `onAuthenticationFailed`, `unsyncedChanges`. If one is renamed, use the new name; do not change the behaviour.

## Review Focus

1. **Server confirms a store that does not yet hold my edits**: the local copy must stay until a stored state vector covers every client clock in my doc. Pinned by `coversLocal` tests (Task 5).
2. **Late store after a restore**: collab stores the old-epoch doc after Spring bumped the epoch; Spring must refuse with `409 EPOCH` and collab must drop the doc, never retry it. Pinned by `staleEpochStoreRejected` (Task 2) and `epochConflictDropsDoc` (Task 3).
3. **Access lost while connected**: a removed member or a page that became locked/trashed must stop writing at once, including across the 60 s ticket validity. Pinned by `memberRemovalCallsRevalidate` (Task 6), `revalidateUserClosesItsSockets` (Task 7) and the Playwright removal test (Task 12).
4. **Collab down or Spring down**: typing continues, nothing is lost, the indicator says so, the doc is not unloaded. Pinned by `storeRetriesWithBackoff` (Task 3) and the offline Playwright test (Task 12).
5. **Two tabs of one user on one page**: each tab keeps its own slot and Web Lock (1a rule); both connect and merge live. Pinned by `twoTabsSameUser` in Task 12.

---

## File Map

| File | Responsibility |
|---|---|
| `collab/package.json`, `tsconfig.json`, `vitest.config.ts`, `Dockerfile`, `.dockerignore` | Service project |
| `collab/src/config.ts` | Reads env into `Config` |
| `collab/src/ticket.ts` | `verifyTicket` |
| `collab/src/spring.ts` | `SpringApi` (internal HTTP client) |
| `collab/src/extractText.ts` | Plain text from `Y.XmlFragment` |
| `collab/src/server.ts` | `createServer(config, spring)`: hooks, internal routes, limits |
| `collab/src/main.ts` | Entry: `createServer(...).listen()` |
| `collab/test/*.test.ts` | Vitest |
| `src/main/java/.../collab/` | `CollabProperties`, `CollabTicketService`, `CollabController`, `InternalCollabController`, `CollabClient`, DTOs |
| `frontend/src/api/collab.ts` | `getTicket` |
| `frontend/src/editor/collab.ts` | `useCollab` hook: provider, status, notices |
| `frontend/src/editor/userColor.ts` | `userColor(userId)` |
| `frontend/src/editor/pushCopy.ts` | Sends a kept copy through collab (logout, back online) |
| `frontend/src/page/Presence.tsx` | Avatar stack |

---

### Task 1: Collab service skeleton + ticket auth

**Files:**
- Create: `collab/package.json` (scripts `dev` = `tsx watch src/main.ts`, `build` = `tsc`, `start` = `node dist/main.js`, `test` = `vitest`, `typecheck`), `collab/tsconfig.json`, `collab/src/config.ts`, `collab/src/ticket.ts`, `collab/src/server.ts`, `collab/src/main.ts`, `collab/test/ticket.test.ts`, `collab/test/auth.test.ts`
- Modify: `.github/workflows/ci.yml` (new job `collab`: `npm ci`, `npm run typecheck`, `npm test -- --run` in `collab/`), `.gitignore` (`collab/node_modules`, `collab/dist`)
- Also commit: the spec (status line set to `APPROVED 2026-11-21`) and this plan.

**Interfaces:**
- Produces:
  - `interface Ticket { nodeId: string; userId: string; name: string; access: 'EDIT' | 'VIEW'; epoch: number; exp: number }` (exp in epoch ms)
  - Token format: `base64url(utf8 JSON payload) + "." + base64url(HMAC_SHA256(secret, payloadPart))`, where `payloadPart` is the first segment as sent.
  - `verifyTicket(token: string, secret: string, now: number): Ticket` throws `Error('bad-ticket' | 'expired')`; compares with `crypto.timingSafeEqual`.
  - `interface Config { port: number; secret: string; appOrigin: string; springUrl: string }`; `loadConfig(env): Config` throws if `secret` or `appOrigin` is empty.
  - `createServer(config: Config, spring: SpringApi): Server`; connection context `{ userId, name, access, epoch, connectedAt: number }`.
  - `GET /health` -> `200 {"status":"UP"}` (via `onRequest`).
  - Shared test vector (used again in Task 2): secret `test-secret`, payload JSON `{"nodeId":"n1","userId":"u1","name":"Ann","access":"EDIT","epoch":0,"exp":4102444800000}`; compute the token once here and paste it as a constant into both tests.

- [x] **Step 1: Write failing tests** `ticket.test.ts`: `acceptsValidTicket` (vector -> fields equal), `rejectsBadSignature` (last char changed -> `bad-ticket`), `rejectsExpired` (`now = exp + 1` -> `expired`), `rejectsMalformed` (`"abc"` -> `bad-ticket`). `auth.test.ts` (real server on port 0, `HocuspocusProvider` + `ws` in Node, or `onAuthenticate` called directly with a fake payload if the docs allow): `wrongNodeRejected` (ticket nodeId `n1`, documentName `n2`), `badOriginRejected` (`Origin` other than `appOrigin`), `viewIsReadOnly` (VIEW ticket -> `connection.readOnly === true`, its update does not reach a second EDIT client), `healthIsUp`.
- [x] **Step 2:** `npm test -- --run` in `collab/` -> FAIL (modules missing).
- [x] **Step 3: Implement** `ticket.ts`, `config.ts`, `server.ts` (`onAuthenticate`: verify, nodeId == `documentName`, `Origin` == `appOrigin`, VIEW -> readOnly, return context; `onConnect`/`onDisconnect` log lines), `main.ts`. `spring` is unused until Task 3 (pass a stub in tests).
- [x] **Step 4:** tests PASS; `npm run typecheck` clean.
- [x] **Step 5: Commit** `feat(collab): add the collaboration service with ticket auth`

### Task 2: Spring ticket endpoint + internal content API

**Files:**
- Create: `collab/CollabProperties.java` (`@ConfigurationProperties("kf.collab")`: `secret`, `url`), `collab/CollabTicketService.java`, `collab/CollabController.java`, `collab/TicketDTO.java` (`record TicketDTO(String ticket, String access, int epoch)`), `collab/InternalCollabController.java`, `collab/StoreRequest.java` (`record StoreRequest(Long baseRevision, Integer baseEpoch, String state, String text, List<String> authors)`), `nodecontent/StaleEpochException.java` (409, body `{"error":"EPOCH","epoch":n}`)
- Modify: `nodecontent/NodeContentService.java` (add `storeFromCollab`, add `contentFor(nodeId)` without access check), `SecurityConfig.java` (`/internal/**` permitAll + CSRF ignored; the secret check guards it), `application.properties` (two props), `src/test/resources` test props (`kf.collab.secret=test-secret`)
- Test: `collab/CollabTicketServiceTest.java` (unit), `collab/CollabIT.java`

**Interfaces:**
- Consumes: ticket format + test vector from Task 1.
- Produces:
  - `POST /api/nodes/{id}/collab-ticket` (session + CSRF) -> `TicketDTO`; access from `NodeAccessService.resolve(userId, node)`: EDIT -> `EDIT`, VIEW -> `VIEW`, else the same 403/404/410 the REST rules give. Empty secret -> 503.
  - `CollabTicketService.sign(String payloadJson): String`, `issue(Node, User, Access, int epoch): String`
  - `GET /internal/collab/nodes/{id}/content` -> `ContentDTO` (existing record; `state` empty string when none)
  - `PUT /internal/collab/nodes/{id}/content` (`StoreRequest`) -> `SavedDTO`; errors: `409 {"error":"EPOCH"}` when `baseEpoch` != current, `409` `StaleRevisionException` when revision moved, 400/413 from `decodeState`.
  - Every `/internal/**` call needs header `X-Collab-Secret` equal to `kf.collab.secret` (`MessageDigest.isEqual`), else 403; empty configured secret -> always 403.
  - `NodeContentService.storeFromCollab(String nodeId, StoreRequest req): SavedDTO`: same update pipeline as `save` but filter `{_id, revision: baseRevision, contentEpoch: baseEpoch}`, session authors = union with `req.authors()` (ObjectIds), `Node.updatedBy` = last id in `authors` (skip the node update when `authors` is empty). Keep `save` for now (removed in Task 5).

- [x] **Step 1: Write failing tests**: `CollabTicketServiceTest.signMatchesVector` (vector payload -> token constant from Task 1). `CollabIT`: `collabTicketNeedsView` (non-member 403/404), `ticketAccessMatchesRole` (editor -> EDIT; viewer -> VIEW; locked page + editor -> VIEW; parsed payload has nodeId, userId, epoch, `exp - now` within 55..60 s), `internalApiRejectsWithoutSecret` (GET/PUT without header and with wrong header -> 403), `staleEpochStoreRejected` (bump `contentEpoch` in Mongo, PUT with old `baseEpoch` -> 409 `EPOCH`, state unchanged), `storeKeepsRules` (good PUT -> revision +1, `search.title` set, `editSession.authors` contains both given ids, `updatedBy` = last author).
- [x] **Step 2:** `./mvnw -q test -Dtest='CollabTicketServiceTest,CollabIT'` -> FAIL.
- [x] **Step 3: Implement** as in Interfaces; Jackson writes the payload JSON in a fixed field order (`@JsonPropertyOrder`).
- [x] **Step 4:** same command PASS, then `./mvnw -q test` PASS.
- [x] **Step 5: Commit** `feat(collab): ticket endpoint and internal content API for the collaboration service`

### Task 3: Collab loads and stores through Spring

**Files:**
- Create: `collab/src/spring.ts`, `collab/src/extractText.ts`, `collab/test/store.test.ts`, `collab/test/extractText.test.ts`, `collab/test/fixtures/` (base64 Y.Doc states + expected text)
- Create (frontend, fixture generator test, kept): `frontend/src/editor/extractText.parity.node.test.ts` writes nothing; it asserts browser `extractText(yDocToBlocks(...))` equals each fixture's expected text, so both sides read the same `collab/test/fixtures/*.json`.
- Modify: `collab/src/server.ts`

**Interfaces:**
- Consumes: Task 2 endpoints.
- Produces:
  - `interface Loaded { state: Uint8Array | null; revision: number; epoch: number }`
  - `class EpochError extends Error`, `class RevisionError extends Error`
  - `interface SpringApi { load(nodeId: string): Promise<Loaded>; store(nodeId: string, body: { baseRevision: number; baseEpoch: number; state: string; text: string; authors: string[] }): Promise<{ revision: number }> }`; `springApi(config): SpringApi` (fetch + `X-Collab-Secret`; 409 body `EPOCH` -> `EpochError`, other 409 -> `RevisionError`).
  - `extractText(fragment: Y.XmlFragment): string`: same output as browser `extractText` (one line per block, table rows tab-joined, status label, bookmark `title url`, caption/name fallback, empty lines dropped).
  - Per-doc meta kept in a `Map<string, { revision: number; epoch: number; authors: Set<string>; tooLarge: boolean; dropped: boolean }>`.
  - Stateless messages (JSON strings) sent to all connections of a doc: `{"type":"saved","revision":n,"sv":"<base64 Y.encodeStateVector>"}`, `{"type":"retrying"}`.

- [x] **Step 1: Write failing tests** (`store.test.ts`, fake `SpringApi`, Vitest fake timers): `loadsServerState` (doc content equals loaded state); `emptyPageUsesFixedState` (`state: null` -> doc equals `EMPTY_PAGE_STATE`); `storesAfterDebounce` (one edit -> no store at 1.9 s, one store by 2.1 s with `baseRevision`, `baseEpoch`, authors = editing userId); `storeRetriesWithBackoff` (store rejects 3 times -> attempts at +1, +2, +5 s, sends `retrying`, then `saved`); `savedCarriesStateVector`; `epochConflictDropsDoc` (`EpochError` -> no retry, connections closed `4409`, meta `dropped`); `revisionConflictMerges` (`RevisionError` -> `load` called, server state applied, store again with new revision). `extractText.test.ts`: each fixture -> expected text.
- [x] **Step 2:** `npm test -- --run` -> FAIL.
- [x] **Step 3: Implement** `onLoadDocument` (load, apply, set meta), `onChange` (add `lastContext`/connection userId to `authors` unless readOnly), `onStoreDocument` (skip when `dropped`; encode state, `extractText(doc.getXmlFragment('document-store'))`, store with backoff loop, update revision, clear authors, broadcast `saved`), `unloadImmediately` behaviour per v4 docs so the doc unloads after the last client leaves and the final store succeeded. Server options `debounce: 2000, maxDebounce: 10000`.
- [x] **Step 4:** collab tests PASS; `npm test -- --run` in `frontend/` PASS (parity).
- [x] **Step 5: Commit** `feat(collab): load and store pages through the internal API`

### Task 4: Frontend provider + presence (browser stops PUTting)

**Files:**
- Create: `frontend/src/api/collab.ts`, `frontend/src/editor/collab.ts`, `frontend/src/editor/userColor.ts`, `frontend/src/page/Presence.tsx` (+ `Presence.module.css`), tests `frontend/src/editor/userColor.test.ts`, `frontend/src/page/Presence.test.tsx`
- Modify: `frontend/package.json` (`@hocuspocus/provider` 4.x, same major as server), `frontend/vite.config.ts` (proxy `'/collab': { target: 'ws://localhost:1234', ws: true }`), `frontend/src/editor/Editor.tsx` (`useKfEditor(ydoc, user, editable, files, provider?)`: passes `provider` and `user: {name, color}` to `collaboration`), `frontend/src/editor/autosave.ts` (Autosave no longer sends `saveContent`; still writes the local copy), `frontend/src/page/PageView.tsx` (create collab, pass provider, render `<Presence>` in the page header), `.github/workflows/ci.yml` e2e job (build + start collab with `APP_ORIGIN=http://localhost:8080`, `COLLAB_SECRET`, frontend built with `VITE_COLLAB_URL=ws://localhost:1234`)

**Interfaces:**
- Consumes: `POST /api/nodes/{id}/collab-ticket` -> `TicketDTO`.
- Produces:
  - `getTicket(nodeId: string): Promise<{ ticket: string; access: 'EDIT' | 'VIEW'; epoch: number }>`
  - `collabUrl()`: `import.meta.env.VITE_COLLAB_URL` or `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/collab`
  - `useCollab(nodeId: string, ydoc: Y.Doc): { provider: HocuspocusProvider | null; access: 'EDIT' | 'VIEW' | null; connected: boolean; lastSaved: { revision: number; sv: Uint8Array } | null; notice: string | null }`. Provider `token` is an async function calling `getTicket` on every (re)connect (so 4403 reconnects pick up new access); a 403/404/410 from `getTicket` destroys the provider and sets `access: null`.
  - `userColor(userId: string): string`: FNV-1a hash mod 8 over 8 colours taken from `DESIGN.md` tokens, each with 4.5:1 contrast for its name tag text (white or dark text chosen per colour).
  - Awareness user: `{ name, color, viewer: boolean }`. Viewers clear their `cursor` field; cursor updates throttled to 10/s (wrap the awareness `setLocalStateField('cursor', …)` with a 100 ms trailing throttle).
  - `<Presence provider={...} />`: up to 4 initials circles + `+N`, `title` lists names, viewers get an eye badge; one entry per user (dedupe same userId across tabs).

- [x] **Step 1: Write failing tests**: `userColor.test.ts`: `stablePerUser` (same id -> same colour), `alwaysInPalette`, `spreadsAcrossPalette` (100 ids hit at least 6 colours). `Presence.test.tsx` with a fake awareness: `showsFourPlusN` (6 users -> 4 circles + "+2"), `viewerHasEyeBadge`, `sameUserTwoTabsShownOnce`.
- [x] **Step 2:** `npm test -- --run` -> FAIL.
- [x] **Step 3: Implement** per Interfaces. Remove the `saveContent` call from `Autosave` (the local copy still gets written; it is cleared in Task 5). Edit mode comes from `useCollab().access === 'EDIT'` and the existing lock/role flags; switching rebuilds the editor (never flip `editable` live).
- [x] **Step 4:** `npm run lint && npm run typecheck && npm test -- --run` PASS. Manual check with dev servers (Spring, collab `npm run dev`, Vite): two browsers on one page see each other's text and cursor. Existing e2e may fail on PUT expectations until Task 5; note which.
- [x] **Step 5: Commit** `feat(editor): live co-editing through the collaboration service, with presence`

### Task 5: Offline and local copy rework; public PUT removed

**Files:**
- Create: `frontend/src/editor/pushCopy.ts`, `frontend/src/editor/pushCopy.test.ts`
- Modify: `frontend/src/editor/autosave.ts` (rename the class role to "local copy"; keep `openContent`, slots, Web Locks, quarantine), `frontend/src/editor/autosave.test.tsx`, `frontend/src/editor/SaveIndicator.tsx`, `frontend/src/editor/logout.ts`, `frontend/src/editor/sendWhenOnline.ts`, `frontend/src/api/content.ts` (remove `saveContent`, `SaveBody`), `frontend/e2e/autosave.spec.ts`, `frontend/e2e/offline-nav.spec.ts`
- Modify (backend): `nodecontent/NodeContentController.java` (remove PUT), `NodeContentService.save` removed, `SaveContentRequest` removed, `NodeContentServiceIT` moved to `storeFromCollab`

**Interfaces:**
- Consumes: `useCollab` (Task 4), `saved` stateless (Task 3), `saveRecovered` (existing).
- Produces:
  - `coversLocal(serverSv: Uint8Array, doc: Y.Doc): boolean`: true when for every `[client, clock]` in `Y.decodeStateVector(Y.encodeStateVector(doc))` the server vector has `>= clock`.
  - Local copy: on every ydoc `update`, `store.put(slot, {state, text, baseRevision, epoch, at})` (debounce-free state write as today); cleared when a `saved` arrives with `coversLocal === true`; `adopt` slots cleared at the same moment.
  - `SaveState` mapping: `saved` = confirmed; `saving` = local changes not covered yet and connected; `offline` = provider not connected (copy "Offline: changes kept on this device"); `retrying` = `retrying` stateless received after the last `saved`; `recovered` and `failed` unchanged.
  - `pushCopy(nodeId: string, userId: string, pending: Pending): Promise<boolean>`: `getTicket`; older epoch -> `saveRecovered`; same epoch -> temporary provider with a doc built from the copy, resolves `true` on a covering `saved`, `false` on timeout (15 s) or error; always destroys the provider.
  - `sendAllPending` and `useSendPendingWhenOnline` use `pushCopy` (signatures unchanged).
  - Open rules (7.4): same-epoch copy applied before connecting (already done by `openContent`); older-epoch copy -> `saveRecovered`, notice, server state.

- [x] **Step 1: Write failing tests**: `coversLocalTrueWhenServerHasAll`, `coversLocalFalseWhenOwnClockAhead`, `coversLocalFalseWhenAdoptedClientMissing` (pure, in `autosave.test.tsx`); `copyClearedOnlyOnCoveringSaved` (fake provider emits `saved` with a short sv -> slot kept; full sv -> slot cleared); `offlineStateWhenDisconnected`; `retryingStateAfterRetryMessage`; `pushCopyOlderEpochGoesToRecovered`; `pushCopyTimesOutFalse`. Backend: `NodeContentServiceIT` asserts `PUT /api/nodes/{id}/content` -> 405.
- [x] **Step 2:** run frontend tests + `./mvnw -q test -Dtest=NodeContentServiceIT` -> FAIL.
- [x] **Step 3: Implement**; update `autosave.spec.ts` / `offline-nav.spec.ts` to wait on the indicator text instead of PUT requests.
- [x] **Step 4:** `npm run lint && npm run typecheck && npm test -- --run`, `./mvnw -q test`, `npx playwright test autosave offline-nav` PASS.
- [x] **Step 5: Commit** `feat(editor): keep the local copy until the collaboration server confirms it; remove the content PUT`

### Task 6: Spring calls collab on restore, access changes and named versions

**Files:**
- Create: `collab/CollabClient.java` (`RestClient` built directly, 2 s timeouts, `X-Collab-Secret`)
- Modify: `nodeversion/NodeVersionService.java` (`restore` -> `collab.reset(nodeId)` after the epoch bump; `name` -> `collab.flush(nodeId)` first), `node/NodeService.java` (`publish` flush first; `lock`, `unlock` -> `revalidate`), `node/TrashService.java` (trash/archive/restore/unarchive -> `revalidate` for every node id in the branch), `team/TeamService.java` (`removeMember`, `updateMemberRole`, `leaveTeam` -> `revalidateUser(userId)`; `deleteTeam` -> `revalidateUser` for each former member), `nodeversion/VersionSummaryDTO.java` (+ `boolean flushFailed`), publish response DTO gets the same field.
- Test: `collab/CollabCallsIT.java` (`@MockitoBean CollabClient`)

**Interfaces:**
- Produces: `CollabClient.reset(String nodeId)`, `revalidate(String nodeId)`, `revalidateUser(String userId)` (all log and swallow failures; the 30-min sweep is the safety net), `OptionalLong flush(String nodeId)` (empty = unreachable). Collab routes (built in Task 7): `POST /internal/nodes/{id}/reset|revalidate|flush`, `POST /internal/users/{id}/revalidate`; flush answers `{"revision":n}`.
  - `revalidateUser` is the builder's call for member/role changes (spec 7.1.5 says "per page"; a member change touches every page of the team, and closing that user's sockets is exact and cheap).

- [x] **Step 1: Write failing tests**: `restoreCallsCollabReset` (after the restore the stored epoch is +1 and `reset(nodeId)` was called once, after the DB write: `InOrder` not needed, check epoch inside an `answer`), `memberRemovalCallsRevalidate` (`revalidateUser(removedId)`), `roleChangeCallsRevalidate`, `lockCallsRevalidate`, `trashCallsRevalidateForBranch` (parent + child ids), `namedVersionFlushesFirst` (`flush` called before the version insert; `flush` returns empty -> `flushFailed == true`, version still created).
- [x] **Step 2:** `./mvnw -q test -Dtest=CollabCallsIT` FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** `./mvnw -q test` PASS.
- [x] **Step 5: Commit** `feat(collab): reset, revalidate and flush the collaboration service when pages or access change`

### Task 7: Collab internal routes + 30-min sweep

**Files:**
- Modify: `collab/src/server.ts`
- Test: `collab/test/internal.test.ts`

**Interfaces:**
- Consumes: routes listed in Task 6.
- Produces: `onRequest` handles `/internal/*` (403 without matching `X-Collab-Secret`); `reset`: meta `dropped = true`, close all doc connections `4409`, unload without storing; `revalidate`: close doc connections `4403`; `revalidateUser`: close every connection whose context `userId` matches with `4403`; `flush`: store now if open (await), answer `{revision}`, `{revision:null}` when not open. Sweep every 60 s: close connections with `connectedAt` older than 30 min, code `4403`.

- [x] **Step 1: Write failing tests**: `internalNeedsSecret`, `resetClosesWith4409AndSkipsStore`, `revalidateClosesWith4403`, `revalidateUserClosesItsSockets` (other user's socket stays), `flushStoresNow`, `sweepClosesOldConnections` (fake timers, 31 min).
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** `npm test -- --run` PASS.
- [x] **Step 5: Commit** `feat(collab): internal reset, revalidate and flush routes, and a 30-minute reconnect`

### Task 8: Client handling of restore (4409) and access change (4403)

**Files:**
- Modify: `frontend/src/editor/collab.ts`, `frontend/src/page/PageView.tsx`; test `frontend/src/editor/collab.test.tsx`

**Interfaces:**
- Consumes: close codes from Task 7; `saveRecovered`; `RECOVERED_NOTICE`; `openContent`.
- Produces: on `4409`: if the local copy is not covered by the last `saved`, `saveRecovered({state, text, baseEpoch})` (slot cleared only after success, as in D6), show `RECOVERED_NOTICE`, reopen the page (`openContent` again -> new ydoc + provider). On `4403`: the provider reconnects; the token function fetches a new ticket; access may drop to VIEW (editor rebuilt read-only) or the ticket call fails (403/404/410 -> existing forbidden/gone page state).

- [x] **Step 1: Write failing tests** (fake provider): `restoredWithLocalEditsSavesRecovered`, `restoredWithoutLocalEditsJustReloads`, `accessChangeToViewRebuildsReadOnly`, `accessLostShowsForbidden`.
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** lint, typecheck, tests PASS.
- [x] **Step 5: Commit** `feat(editor): handle page restore and access changes during a live session`

### Task 9: Remove the soft lock

**Files:**
- Delete: `editlock/` package (5 files), `src/test/.../editlock/EditLockServiceIT.java`, `frontend/src/editor/SoftLockBanner.tsx`, `SoftLock.module.css`, `softLock.test.tsx`, `frontend/e2e/softlock.spec.ts`
- Modify: `node/TrashService.java` (drop the `EditLock` removal line), `common/SchemaSetup.java` (remove `edit_locks` indexes; drop the collection at startup if it exists), `SchemaSetupTest`, `frontend/src/api/content.ts` (remove edit-lock calls/types), `frontend/src/page/PageView.tsx` (remove `useEditLock`, banners; read-only only from access/lock)

- [x] **Step 1: Write failing test**: `SchemaSetupTest.dropsEditLocks` (collection present before -> absent after setup).
- [x] **Step 2:** FAIL. **Step 3:** delete and edit; `grep -ri "editlock\|edit-lock\|SoftLock" src frontend/src frontend/e2e` returns nothing.
- [x] **Step 4:** `./mvnw -q test`, frontend lint/typecheck/tests PASS.
- [x] **Step 5: Commit** `refactor: remove the soft lock, live editing replaces it`

### Task 10: Limits

**Files:**
- Modify: `collab/src/server.ts`, `frontend/src/editor/collab.ts`, `frontend/src/editor/SaveIndicator.tsx` (or a notice line in PageView)
- Test: `collab/test/limits.test.ts`, `frontend/src/editor/collab.test.tsx`

**Interfaces:**
- Produces: `websocketOptions: { maxPayload: 1024 * 1024 }`; in `onAuthenticate` reject with close `4429` (reason `too-many`) when the doc has 25 connections or the user has 10 sockets (counter by userId, decremented in `onDisconnect`); `beforeHandleMessage` token bucket 50 messages, refill 50/s, overflow -> close `4429`; after each store, if the encoded state > 4 MB: meta `tooLarge`, every connection `readOnly = true`, stateless `{"type":"too-large"}`. Client: `4429` -> notice "Too many people on this page right now." (no auto-retry loop: one retry after 30 s); `too-large` -> notice with the exact copy, editor read-only.

- [x] **Step 1: Write failing tests**: `rejects26thConnection`, `rejects11thSocketOfUser`, `rateLimitCloses4429`, `oversizedPayloadRejected`, `tooLargeMakesReadOnly`; client `tooManyShowsNotice`, `tooLargeShowsNotice`.
- [x] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** both test suites PASS.
- [x] **Step 5: Commit** `feat(collab): connection, rate and size limits`

### Task 11: Compose, Caddy, deploy

**Files:**
- Create: `collab/Dockerfile` (node:20-alpine multi-stage, `npm ci`, `npm run build`, prune dev deps, `USER node`, `EXPOSE 1234`, `HEALTHCHECK` on `/health`), `collab/.dockerignore`
- Modify: `deploy/docker-compose.yml` (service `collab`: image `ghcr.io/lut4sayem/knowledgeforge-collab:latest`, `env_file: .env`, `environment: NODE_OPTIONS=--max-old-space-size=128, SPRING_INTERNAL_URL=http://app:8080, PORT=1234`, `mem_limit: 192m`, `ports: 127.0.0.1:1234:1234` for the health check only; `app` gets `COLLAB_INTERNAL_URL=http://collab:1234`; caddy `depends_on: [app, collab]`), `deploy/Caddyfile` (`handle /collab* { reverse_proxy collab:1234 }` before the app proxy; `/internal/*` answered 404 by Caddy), `deploy/update.sh` (pull both, compare both image ids, health check both `:8080/actuator/health` and `:1234/health`, roll back both), `.github/workflows/deploy.yml` (second build-push for `collab/`), `deploy/README.md` (`.env` gains `COLLAB_SECRET` (32+ random chars) and `APP_ORIGIN`)

- [x] **Step 1:** `docker build collab` and `docker compose -f deploy/docker-compose.yml config` succeed locally; `sh -n deploy/update.sh` clean.
- [x] **Step 2:** Local stack smoke (throwaway Mongo, app + collab containers, as in the local test stack notes): `/health` UP, a ticketed provider connects, an edit is stored (revision +1 in Mongo).
- [x] **Step 3: Commit** `build(deploy): run the collaboration service next to the app behind Caddy`
- [ ] **Step 4 (owner, after merge):** add `COLLAB_SECRET` and `APP_ORIGIN` to `~/kf/.env`, copy the new compose/Caddyfile/update.sh, measure memory with 2-3 open pages (`docker stats --no-stream`) and record it in PROJECT_CONTEXT.

### Task 12: Playwright two-user tests

**Files:**
- Create: `frontend/e2e/coedit.spec.ts`
- Modify: `frontend/playwright.config.ts` only if a second base user fixture is needed; e2e helpers for creating two users in one team (reuse the existing e2e setup helpers).

- [x] **Step 1: Write the tests** (two browser contexts, real collab): `bothTypeAndSeeEachOther` (each sees the other's sentence within 2 s); `cursorNameVisible` (the other user's name tag shows); `viewerWatchesReadOnly` (viewer sees live text, typing changes nothing, no viewer name tag in the editor's view); `removedMemberLosesAccess` (admin removes B mid-session -> B's tab read-only or forbidden within 5 s, B's later typing never reaches A); `offlineEditsMerge` (B `context.setOffline(true)`, types, indicator says "Offline: changes kept on this device", back online -> A sees B's text and B shows "Saved"); `restoreWhileOpen` (A restores an older version -> B shows `RECOVERED_NOTICE` if B had unconfirmed edits, and the restored text); `twoTabsSameUser` (two pages of one context, both edit, both texts merged, one avatar).
- [x] **Step 2:** `npx playwright test coedit` locally against app + collab: PASS; full `npx playwright test` PASS.
- [x] **Step 3: Commit** `test(e2e): two-user live editing, viewers, removal, offline and restore`
- [x] **Step 4:** push the branch, open the PR (no merge), wait for all CI jobs green; fix and re-push in new small commits if not.

---

## Self-review notes

- Spec coverage: 7.1 -> T1, T2, T6-T8; 7.2 -> T3, T5; 7.3 -> T2, T3, T5, T10; 7.4 -> T5; 7.5 -> T6-T8; 7.6 -> T6 (AUTO versions keep working through `editSession` authors from T2/T3); 7.7 -> T4; 7.8 -> T9; 7.9 -> T10, T11; 7.10 -> T1, T4 (Vite proxy), T11; section 8 tests -> named in T1-T12.
- Builder's calls (spec 10): ticket token format, `revalidateUser` route, `coversLocal` state-vector confirmation, `pushCopy` for logout/back-online, too-large implemented as read-only for every connection, one retry after 30 s on `4429`.
- Between T4 and T5 the logout path still uses the public PUT (a second writer for orphan copies only); T5 removes it. The branch is merged as a whole.
