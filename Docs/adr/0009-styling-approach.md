# ADR 0009: Styling approach: plain CSS with CSS Modules and DESIGN.md tokens

Date: 2026-11-15 · Status: Accepted

## Context
The design pass applies the final design system (`DESIGN.md`: warm palette, Outfit + Newsreader) to every screen.
The frontend already has tokens in `frontend/src/styles/tokens.css`. Mantine is installed only because BlockNote's
React view (`@blocknote/mantine`) needs it; app components do not use it.

## Options
- Mantine components themed with tokens: **Rejected**. Its own look fights DESIGN.md, and it would mean rewriting
  working, tested components and adding test setup.
- Tailwind + shadcn/ui: **Rejected**. Adds a build tool and a second styling system to a codebase that already has tokens.
- Plain CSS with CSS Modules: built into Vite, no new dependency, works with the existing tokens.

## Decision
Every app component is styled with plain CSS and CSS Modules (`Component.module.css`). All values (colours, type,
spacing, radii, shadows) come from the DESIGN.md tokens in `frontend/src/styles/tokens.css`; no raw values in components.
`@mantine/*` is not imported in app code. The only exception is `frontend/src/editor/**`, where the editor is themed
through BlockNote's `theme` prop using the same tokens. An ESLint `no-restricted-imports` rule enforces this.

## Consequences
- + One styling system, one source of truth (DESIGN.md -> tokens.css).
- + CSS Modules scope class names, so one screen's styles cannot break another's.
- + No new dependency or build step.
- We write small pieces ourselves: toast, dropdown menu, tooltip, segmented control.
- Mantine stays in `package.json` for BlockNote until the editor stops needing it.
