# Docs

What's here and when to read it.

| Path | What it is |
|---|---|
| `PRD.md` | Product requirements: who Kenning is for, user stories, non-functional requirements. |
| `adr/` | Architecture decisions (0001-0009), one short file each. 0007 is superseded; 0008 records the whiteboard engine choice. |
| `specs/2026-11-09-domain-model-design.md` | Domain rules: permissions, trash, drafts, page lock, versions. |
| `specs/2026-11-09-physical-schema.md` | MongoDB collections, fields, limits and indexes (ERD: `specs/physical-schema-erd.svg`). |
| `specs/2026-11-21-realtime-coediting-design.md` | Live co-editing (Yjs + Hocuspocus collab service). Shipped. |
| `specs/2026-11-24-whiteboard-design.md` | Whiteboard (Excalidraw with our own Yjs binding). In progress. |
| `plans/2026-11-27-whiteboard-plan.md` | Current build plan: 7 phases, one PR each. |
| `archive/` | Finished plans (Release 1a, live co-editing), kept for history. |

UI rules live in `DESIGN.md` at the repo root. Deployment steps live in `deploy/README.md`.
