# KnowledgeForge

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
- **Summarize and Ask:** optional page summary and a question box that answers from one space's pages (needs an API key, hidden without one).

---

## Architecture

| Part | Technology |
|---|---|
| Backend | Java 17, Spring Boot 4.1, Spring Security (session login, CSRF, BCrypt) |
| Frontend | React + TypeScript (Vite), BlockNote editor, served by Spring Boot under `/app` |
| Database | MongoDB Atlas (database `knowledgeforge_v1`), Atlas Search for full-text search |
| Hosting | One Azure VM (1 GB RAM): the app and Caddy (automatic HTTPS) in Docker Compose |
| Deploy | Pull-based: a push to `main` builds an image and pushes it to GHCR; the VM pulls it every 5 minutes and rolls back if the health check fails |
| Backups | Nightly `mongodump`, encrypted with `age`, kept 7 days as a workflow artifact |
| Monitoring | `/actuator/health` (public, no details) for an uptime monitor |

```
frontend/                      React app (built into target/classes/static/app)
src/main/java/.../knowledgeforge/
  access/ node/ nodecontent/ nodeversion/ editlock/   pages, content, history, soft lock
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

Optional variables: `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` (summaries and Ask), `KF_AUTH_RATE_LIMIT_PER_MINUTE` (default 10).

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

- Every `/api` call checks team membership; a user outside the team gets 403 or 404 (covered by `NonMemberApiIT`).
- CSRF token on all writes, BCrypt passwords, session cookie `SameSite=Lax`.
- Login and register: 10 attempts per minute per IP.
- Page text is rendered as text; search snippets are escaped on the server and again in the browser; bookmark links allow only `http(s)`; uploads are always served as downloads with `nosniff`.

---

## Known limits

- No real-time co-editing; two people can edit the same page, and their changes are merged on save. A soft lock warns the second person.
- The whole page tree of a space loads at once (about 2 MB for 10,000 pages before compression).
- Rate limiting is in memory, so it assumes one app instance.
- Trash, archive and move-to-team update several documents without a database transaction (see `Docs/PROJECT_CONTEXT.md`).
- Uploaded files are not scanned for malware (5 MB limit, allowlist of types).
- Summaries and Ask use a free API tier and find pages by keywords, not meaning.
- Bookmark images load from third-party sites.

---

## Author

**MD. LUTFUR RAHMAN**, BRAC University. Started as a CSE391 course project.
