# Real-time co-editing (Release 1b, sync piece) — Design

Date: 2026-11-21 · Status: APPROVED 2026-11-21 · Owner: MD. Lutfur Rahman
Repo location when committed: `Docs/specs/2026-11-21-realtime-coediting-design.md`

## 1. Why
The main use case: a student team (e.g. a thesis group W, X, Y, Z) in a meeting or brainstorm, all on one page, all typing at once. Nobody waits for one typist, nobody screen-shares. It must feel like four people around one notebook. The whiteboard (next release) is the same moment on another surface, so the sync server is built for any Yjs content, not only pages.

## 2. Goals
- Edits from everyone show up live (target: under ~1 s on a normal connection) and merge with no lost text.
- Presence inside the page: avatar stack of who is here; named, coloured cursors and selections for editors.
- Users with EDIT access type live; users with VIEW access (e.g. a supervisor without edit rights) watch live, read-only.
- People join by opening the page link (shared in their group chat).
- The server saves snapshots; version history keeps working.
- Offline safety from 1a is kept: edits made offline are kept on the device and merge when back online.
- Runs on the existing Azure VM (~836 MB usable RAM) within the $0 budget.

## 3. Non-goals (later)
- Team-wide presence in the sidebar ("W, Y are in Chapter 3 plan"), follow mode.
- Per-author colours in version history (D3 stays: colour per version author).
- Live comments, notifications, share links, page permissions UI (rest of 1b).
- More than one collab server (scale-out path noted in 9).
- The whiteboard itself.

## 4. Anti-goals (failure even if it "works")
- Lag or vanished text in the middle of a meeting.
- The VM running out of memory when a few teams meet at once.
- Any path where a view-only user, a removed member, or someone with a stale tab can change content.
- Content written after a restore bringing old content back (the D6 epoch rule must still hold).

## 5. Approaches considered
| | Approach | Trade-off | Verdict |
|---|---|---|---|
| A | Hocuspocus (Node) service next to Spring; Spring stays the only owner of data and rules (ADR 0004). Collab holds open docs in memory, relays updates, asks Spring for access, loads/saves through Spring's internal API. | One more process (~100-190 MB). Server merges and validates; one trusted writer; whiteboard reuses it as-is; standard architecture. | **Chosen by owner (2026-11-21).** |
| B | Relay inside Spring (WebSocket passes opaque Yjs messages; browsers keep autosaving). | No new process, tiny memory. Server can't validate or merge, every client saves the full page, garbage from a bad client is stored, awkward for boards. | Rejected. |
| - | Hocuspocus writing to MongoDB directly | Breaks ADR 0004; duplicates revision/epoch/search/version rules. | Dropped. |
| - | Hosted (Liveblocks, etc.) | Free-tier limits, data outside, less to learn. | Dropped. |

## 6. How it works (big picture)
```
Browser (BlockNote + Yjs + HocuspocusProvider)
   |  wss://<host>/collab   (Caddy routes to collab:1234, docker network only)
Collab (Node, Hocuspocus)  -- holds one Y.Doc per open page, relays updates + awareness
   |  http://app:8080/internal/collab/*   (shared secret, not exposed by Caddy)
Spring Boot  -- access rules, revisions, epochs, search text, versions, Mongo
```
Yjs is a CRDT: every client's edits are small updates that merge in any order to the same result, so nobody needs a lock. The server's job is to relay, keep one authoritative copy, and save it.

## 7. Design decisions

### 7.1 Connecting and access
1. Page opens -> `POST /api/nodes/{id}/collab-ticket` (session + CSRF, needs VIEW). Spring returns `{ticket, access: EDIT|VIEW, epoch}`. Ticket = HMAC-SHA256 signed `{nodeId, userId, name, access, epoch, exp: now+60s}` with secret `COLLAB_SECRET` (in `.env`, shared by app and collab).
2. Browser connects `HocuspocusProvider({url: wss://<host>/collab, name: nodeId, token: ticket})`.
3. Collab `onAuthenticate`: verify signature, expiry, nodeId match; check `Origin` header equals the app origin (stops cross-site WebSocket hijacking). `access=VIEW` -> `connection.readOnly = true` (server drops their document updates; awareness still allowed so they show in the avatar stack).
4. Why a ticket and not the session cookie: no cookie forwarding between services, no CSRF surface on the socket, and collab needs no round trip to Spring per connection.
5. Access changes during a session: Spring calls `POST collab/internal/nodes/{id}/revalidate` when anything that can change access happens (member removed, role changed, page trashed/archived/locked, restriction changed later in 1b). Collab closes all connections for that page with close code `4403 access-changed`; clients fetch a new ticket and reconnect (and get VIEW, or a 403 page). Safety net: collab also closes any connection older than 30 min, forcing a fresh ticket.
6. Locked or trashed/archived pages: ticket endpoint returns `access: VIEW` (locked) or 404/410 (trashed), as the REST rules already do.

### 7.2 Loading
- Collab `onLoadDocument` -> `GET /internal/collab/nodes/{id}/content` -> `{state(base64), revision, epoch}`; applies the state to the new Y.Doc. No saved state -> `EMPTY_PAGE_STATE` (same fixed state as 1a, so merges still work).
- Browser: for a fast first paint it still `GET`s `/api/nodes/{id}/content` and applies it to its local Y.Doc before the socket syncs. Safe: both come from the same Yjs history, so they merge without duplicates.

### 7.3 Saving (collab is the only writer)
- Collab `onStoreDocument` with debounce 2 s, max debounce 10 s -> `PUT /internal/collab/nodes/{id}/content {baseRevision, baseEpoch, state, text, authors[]}`.
- Spring keeps all 1a rules: atomic revision check, 4 MB state / 1 MB text caps, `contentHash`, `search` copy, `editSession` (authors = user ids that sent updates since the last store), `updatedBy`.
- `baseEpoch` differs from current -> Spring returns `409 EPOCH`; collab drops the in-memory doc and closes connections with `4409 restored` (see 7.5).
- Revision 409 with the same epoch should not happen (single writer); if it does, collab loads the server state, merges it into its doc and stores again (same as D6).
- Store fails (Spring down) -> retry with backoff 1, 2, 5, 10, 30 s; the doc is not unloaded until stored. If collab itself crashes, the clients still hold every edit and push them on reconnect.
- The browser no longer `PUT`s content. The public `PUT /api/nodes/{id}/content` is removed (internal endpoint replaces it). `POST .../versions/recovered` stays.
- Search text: collab builds `text` by walking the `Y.XmlFragment('document-store')` in a small pure function (`collab/src/extractText.ts`), no BlockNote/React in Node. A parity test checks it matches the browser `extractText` on fixture pages (headings, lists, tables, status chips, bookmarks). Builder's call to share the fixtures.
- Size cap live: if the doc grows past 4 MB, collab rejects further updates for that page and sends a stateless message; every connection becomes read-only (owner, 2026-11-21) and clients show "This page reached its size limit. Move some sections into sub-pages." (edits already made stay; copying text out still works).
- Size warning (owner, 2026-11-22): when the live doc reaches 90 % of the live cap, collab sends a stateless `size {near: true}` and clients show a warning bar: "This page is almost at its size limit. Move some sections into sub-pages." It goes away (`size {near: false}`) once the page shrinks below 85 %. Collab keeps a running estimate (last stored size plus every update since) and measures the real size before turning the warning or the limit on.
- At the cap, collab stores what it accepted before the cap, then sends `too-large {final: true, snap}` with the snapshot of that last store. A client whose edits that snapshot does not cover had them refused: it gets the same `Not saved` handling as losing edit rights (next bullet).
- Edit rights lost with unconfirmed edits (`4403` or revalidate: access gone, or EDIT dropped to VIEW; owner, 2026-11-22; a page in the trash, locked or archived is different, see 7.4): the editor turns read-only at once and the unsaved text stays on screen so it can be copied. Banner: "You can't edit this page anymore, so your last changes couldn't be saved. Copy anything you need before leaving." SaveIndicator shows `Not saved`; the `beforeunload` prompt stays while that text is on screen; the content is not reloaded over it. The local copy for that page is deleted (it can never be sent) and no recovered version is made. If edit rights come back while the tab is open (unlocked, restored from the trash, a fresh EDIT ticket), the editor is editable again, the copy is stored again and the usual confirmation clears it.

### 7.4 Offline and the local copy
- Keep the per-tab local copy (pendingStore, Web Lock ownership, quarantine) but it now stores the local Y.Doc state + `epoch`, written on every local update.
- Socket down -> SaveIndicator "Offline: changes kept on this device"; typing continues. On reconnect the provider syncs; Yjs merges the offline edits; once the server confirms (provider `synced` and the next collab store is done, signalled by a stateless `saved {revision}` message), the local copy is cleared.
- Opening a page with a local copy of the **same** epoch: apply it to the doc before connecting; the sync merges it.
- Local copy of an **older** epoch (page was restored while you were offline): send it to `POST /versions/recovered` (D6), show the existing notice, start from the server state.
- SaveIndicator states map: `Saved` (server confirmed), `Saving…` (local changes not yet confirmed), `Offline: changes kept on this device`, `Couldn't save, retrying` (connected but store failing, sent by collab), `Not saved` (the edits can never be stored, see 7.3).
- Page trashed, locked or archived while it has unconfirmed local edits (option C, owner, 2026-11-22): all three can be undone, so the copy is kept. The editor turns read-only, SaveIndicator shows `Not saved` and the banner says "This page is in the trash. Your last changes are kept on this device and are added back if the page is restored." (locked: "This page is locked. Your last changes are kept on this device and are added back if it is unlocked."; archived: "This page is archived. Your last changes are kept on this device and are added back if it is unarchived."). A VIEW ticket alone does not say why, so the client fetches the page again to tell a lock or archive from a lost role. The local copy is kept (no leave prompt: nothing is lost by leaving). If the page comes back (restored, unlocked, unarchived), the copy is merged the next time the page is opened, or sent in the background (app start, back online, logout). It is deleted only when the page is purged (`404 Page not found`) or the user can no longer read it (`403`), and never while an open tab holds it. Other loss of edit rights follows 7.3 (copy deleted).
- Logout and `beforeunload` keep the 1a rules, based on "unconfirmed local changes exist".

### 7.5 Restore and the epoch rule (D6 still holds)
- Restore in Spring bumps `contentEpoch` as today, then calls `POST collab/internal/nodes/{id}/reset`. Collab stores nothing more, drops the doc, closes connections with `4409 restored`.
- Clients on `4409`: their unconfirmed local edits (if any) go to `versions/recovered`, the notice is shown, and they reconnect to the restored state.
- A late store from collab with the old epoch is refused by Spring (`409 EPOCH`). Old content cannot come back.

### 7.6 Versions
- The existing session job keeps making AUTO versions from `editSession`; authors now come from collab.
- Named versions / publish: Spring first calls `POST collab/internal/nodes/{id}/flush` (collab stores now if the doc is open, returns the revision), then snapshots from the DB as today. If the flush fails (collab unreachable), snapshot what is stored and say so in the response: both return `liveEditsMissing: true` (owner, 2026-11-22). After publishing, the client then shows "Published, but the newest live edits may be missing." instead of the usual confirmation.

### 7.7 Presence (awareness)
- BlockNote `collaboration: {provider, fragment: ydoc.getXmlFragment('document-store'), user: {name, color}}` gives cursors, selections and name tags.
- Colour: stable per user (hash of user id -> one of 8 colours from the DESIGN.md tokens, readable on white, with dark text where needed).
- Avatar stack in the page header: up to 4 initials circles + "+N", tooltip with names; viewers appear in the stack with an eye badge; no cursor for viewers.
- Awareness state is small (`{user, cursor}`); throttle cursor updates to 10/s.

### 7.8 Removed from 1a
- Soft lock: `editlock` package, `edit_locks` collection (drop it), endpoints, `SoftLockBanner`, heartbeat. Read-only now comes only from access/locked.

### 7.9 Limits and memory (VM: app ~200 MiB, Caddy ~14 MiB, ~350 MB free)
- Collab container: `mem_limit: 192m`, Node `--max-old-space-size=128`.
- Doc unloaded right after the last client leaves and the final store succeeds.
- Max 25 connections per page, 10 open sockets per user, WebSocket `maxPayload` 8 MB (a reconnect sends all unsent edits in one message, so anything storable must fit; a bigger message is closed with `1009`, the client stops resending it and shows `Not saved` with the size-limit message); over the limit -> close `4429`, client shows "Too many people on this page right now."
- Per-connection update rate limit (e.g. 50 messages/s burst) to stop a runaway client.
- Expected load: a page with ~50 KB of Yjs state costs roughly 1-2 MB in memory, so ~20 open pages fit easily. Measure on the VM and record in PROJECT_CONTEXT.
- Internal endpoints: on the docker network only, never routed by Caddy, and every call carries `X-Collab-Secret` (both directions). Spring's `/internal/**` rejects calls without it.

### 7.10 Infra
- `collab/`: Node 20, TypeScript, `@hocuspocus/server`, `yjs`. Own Dockerfile; image pushed to GHCR by the same deploy workflow; `update.sh` pulls both images, health checks both (`GET /health` on collab), rolls back both together.
- Compose: `collab` service on the internal network; Caddyfile: `handle /collab* { reverse_proxy collab:1234 }` (WebSockets work through Caddy by default).
- Dev: `npm run dev` in `collab/` on :1234; Vite proxy `/collab` with `ws: true`.
- Logs: one line per connect/disconnect/store/error with nodeId + userId, no content.

## 8. Testing
- Collab (Vitest): ticket verify (bad signature, expired, wrong node, bad Origin), VIEW is read-only, store debounce and backoff, `409 EPOCH` drops the doc, `extractText` parity, size cap, connection limits.
- Spring IT: `collabTicketNeedsView`, `ticketAccessMatchesRole`, `internalApiRejectsWithoutSecret`, `staleEpochStoreRejected`, `restoreCallsCollabReset` (collab mocked), `memberRemovalCallsRevalidate`, `namedVersionFlushesFirst`.
- Playwright (two browser contexts, real collab): both type in one page and see each other within 2 s; cursor name visible; viewer sees live text and cannot type; remove a member mid-session -> their tab goes read-only/forbidden; go offline, type, come back -> text merged; restore while another tab is open -> notice and restored content.

## 9. Scaling path (not built now)
One collab instance is fine for this VM. Beyond it: Hocuspocus Redis extension so several collab instances share docs, sticky routing by page id at the proxy. Nothing in this design blocks that.

## 10. Left to the builder
- File layout inside `collab/`, exact close-code handling UI copy beyond what is written here, test fixture sharing for `extractText` parity, exact avatar component styling (follow DESIGN.md tokens; plain is fine).
- Check the current Hocuspocus and BlockNote collaboration docs first; APIs move fast.

## 11. Calls made without the owner (review these)
Ticket instead of cookie auth; collab as the only writer (browser PUT removed); server-side text extraction by walking the Y.XmlFragment; store debounce 2 s / max 10 s; 30-min forced reconnect; limits in 7.9; viewers shown in avatars but without cursors; colour per user from 8 tokens.

## 12. Known issues
- The per-page (25) and per-user (10) connection limits are checked on connect, so connections arriving at the same instant can slightly exceed them.
