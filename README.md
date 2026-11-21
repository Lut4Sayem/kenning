# Kenning

A kenning joins two words to make a new meaning. Kenning joins your team's notes, wiki and boards into one place.

A knowledge base for student project teams. Teams own spaces, spaces hold a tree of pages, and pages are edited in a block editor with autosave, version history, comments and file attachments.

**Live:** https://knowledgeforge-lrs.eastasia.cloudapp.azure.com

---

## Features

- **Teams and roles:** invite link, join requests, ADMIN / EDITOR / VIEWER roles, a private personal space per user.
- **Nested pages:** drag to reorder or re-parent, breadcrumbs, tags, DRAFT / PUBLISHED, archive and trash with restore.
- **Block editor:** `/` menu, bookmarks, file uploads, autosave with an offline-safe local copy, soft edit lock.
- **History:** automatic and named versions, restore any version.
- **Search:** full-text search (Atlas Search) over the pages you can read, plus a command palette.
- **Comments, attachments, move a private page to a team.**
- **AI assistant (optional):** page summaries and "Ask this space", see below.

### AI assistant

- **Summarize** a page into a few bullet points (cached until the page content changes).
- **Ask this space:** ask a question and get an answer based only on that space's pages, with clickable `[n]` sources. Pages are found with Atlas Search (keywords, not meaning), so a question worded very differently from the pages may get "I don't know".
- Answers are cached per space and question until the space's pages change, so repeats cost nothing.
- Available to every member of the team, viewers included, and only for pages they can read.
- Limits: 10 requests per user per day and a daily token budget for the whole site, both configurable (below).
- **Privacy:** page text is sent to an external provider (Groq, OpenAI-compatible API) when these features are used.
- Without an API key the app works normally and the AI buttons are hidden.

Endpoints: `POST /api/nodes/{id}/ai/summary`, `POST /api/spaces/{id}/ai/ask` with body `{"question": "..."}`.

---

## Architecture

| Part | Technology |
|---|---|
| Backend | Java 17, Spring Boot 4.1, Spring Security (session login, CSRF, BCrypt) |
| Frontend | React + TypeScript (Vite), BlockNote editor, served by Spring Boot under `/app` |
| Database | MongoDB Atlas (database `knowledgeforge_v1`), Atlas Search for full-text search |
| Hosting | One Azure VM (1 GB RAM): the app, the collaboration service (Node, Hocuspocus, live editing) and Caddy (automatic HTTPS) in Docker Compose |
| Deploy | Pull-based: a push to `main` builds an image and pushes it to GHCR; the VM pulls it every 5 minutes and rolls back if the health check fails |
| Backups | Nightly `mongodump`, encrypted with `age`, kept 7 days as a workflow artifact |
| Monitoring | `/actuator/health` (public, no details) for an uptime monitor |

```
frontend/                      React app (built into target/classes/static/app)
collab/                        live-editing service (Node, Hocuspocus): tickets, load/store through Spring, limits
src/main/java/.../knowledgeforge/
  access/ node/ nodecontent/ nodeversion/ collab/     pages, content, history, live-editing tickets
  team/ space/ user/ auth/ comment/ attachment/       teams, spaces, accounts, comments, files
  search/ dashboard/ activity/ ai/ linkpreview/       search, dashboard, activity log, summaries
deploy/                        docker-compose.yml, Caddyfile, update script, VM setup notes
```

Deployment details and VM setup: [`deploy/README.md`](deploy/README.md).

---

## Run locally

You need Java 17, Node and a MongoDB with Atlas Search (Atlas-local in Docker works).

```bash
docker run -d --name kf-mongo -p 27017:27017 mongodb/mongodb-atlas-local:8.0
export SPRING_DATA_MONGODB_URI="mongodb://localhost:27017/kf_dev?directConnection=true"
./mvnw spring-boot:run          # builds the frontend too (add -Dskip.npm -Dskip.installnodenpm to skip)
```

Open http://localhost:8080/app and register.

Optional variables (values without quotes or trailing spaces):

```bash
export AI_BASE_URL="https://api.groq.com/openai/v1"   # AI assistant; all three are needed to turn it on
export AI_MODEL="openai/gpt-oss-20b"
export AI_API_KEY="your-groq-key"
# AI_USER_DAILY_LIMIT (default 10), AI_SITE_DAILY_TOKENS (default 180000)
# KF_AUTH_RATE_LIMIT_PER_MINUTE (default 10, failed logins per IP and email)
```

Frontend alone with hot reload: `cd frontend && npm install && npm run dev`.

**Tests**

```bash
./mvnw test                     # integration tests start Atlas-local with Testcontainers (skipped without Docker)
cd frontend && npm test         # Vitest
cd frontend && npm run e2e      # Playwright, needs the app running
```

**Performance data (optional, local only):** `--spring.profiles.active=dev --kf.seed=true` adds a user `seed@example.test` / `password123` with 10,000 pages. It refuses to run against a database that is not on localhost.

---

## Security notes

- Every page, space and team endpoint checks team membership; a logged-in user outside the team gets 403 or 404, and tag, search and recent lists hold nothing of the team's (`NonMemberApiIT`).
- CSRF token on all writes, BCrypt passwords, session cookie `SameSite=Lax`.
- Failed logins: 10 per minute per IP and email, so a class on one network can all sign in; successful logins never count. Register: 10 per minute per IP. Local Playwright runs make more calls than that: set `KF_AUTH_RATE_LIMIT_PER_MINUTE=1000` when starting the app.
- Page text is rendered as text; search snippets are escaped on the server and again in the browser; bookmark links allow only `http(s)`; uploads are always served as downloads with `nosniff`.

---

## Known limits

- One collaboration service instance: live editing does not scale out to several (the Hocuspocus Redis extension would be the next step).
- The whole page tree of a space loads at once (about 2 MB for 10,000 pages before compression).
- Rate limiting is in memory, so it assumes one app instance.
- Trash, archive, restore and move-to-team update several documents without a database transaction: they work in chunks so large branches stay inside MongoDB's transaction limits, some steps are raw pipeline updates, and a repeat of trash, archive or restore finishes the job. If move-to-team fails half way, the branch needs a manual repair.
- Uploaded files are not scanned for malware (5 MB limit, allowlist of types).
- Summaries and Ask can hit the provider's free-tier limits under heavy use.
- Bookmark images load from third-party sites.

---

## Author

**MD. LUTFUR RAHMAN**, BRAC University. Started as a CSE391 course project.
