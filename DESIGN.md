---
name: Kenning design system
status: final 2026-11-15 (replaces the 2026-11-03 "Notion-warm" version). Every screen below has an approved mockup.
references: Linear (structure), Miro (palette and warmth), Notion (per-page colour)
---

# Kenning Design System

This file is the single source of truth for how Kenning looks and behaves.
If code and this file disagree, this file wins. Change this file first, then the code.

## 0. Decisions (2026-11-15)

| Topic | Decision |
|---|---|
| Look | (2026-11-17, D0) **Ledger**: the page panel has a hairline edge instead of a shadow, radii 6–10px, 28px titles (32px page title), Outfit 600 section heads, quicker motion (90–140ms). Yellow only on drafts and the selection. |
| Structure | Linear: left sidebar with fixed sections, a white page panel, an optional right details panel. Every feature has one obvious home. |
| Palette | Warm grey ground, white page panel, near-black primary, one yellow accent. |
| Body / UI font | **Outfit** 400/500/600/700 (Google Fonts). |
| Title font | **Newsreader** 500 (Google Fonts, optical sizes): page titles, section headings, login heading. Never for buttons, labels or data. |
| Code font | **Fragment Mono** 400: only in code blocks and inline code. |
| Page tree | Indentation only. **No guide lines** (the 2026-11-09 wireframe idea is dropped). |
| Page colour | Each page can carry one colour dot, picked by the user from the page palette (section 2). |
| Page icons | **No emoji anywhere.** Until the custom vector icon set exists, a page icon is a line glyph in a soft tint tile (section 6). |
| Auth screens | (2026-11-17, D0) One centred form card on a decorative stage: dot grid that fades out around the form, six app fragments joined to the card by thin curves, two named cursors, a Newsreader tagline above the form. Replaces the split screen with the product preview. |
| Page view | Notion-style properties block under the title (Status, Tags, Last edited). No full-width draft bar. Comments, Files and Summary live in the right panel. |
| List views | Linear-style: no big title, slim view tabs + filter/display icons, icon column headers, compact rows, grouped with header rows. |
| Right panel | Details (members, activity, history) live in a right panel the user opens and closes from the top bar. Never stacked under the main content. |
| Lists | Every list on an overview screen has a hard cap and a "View all" link (section 8). Nothing grows with team size. |

**Tokens changed by Ledger (2026-11-17)**, old → new: `--hover` #e4e3df → #e6e5e1 · `--line` .09 → .12 · `--line-soft` .06 → .08 ·
`--pill-bg` #efeeea → #ffefb0 · `--pill-ink` #4a4843 → #5a4500 · `--r-row` 8 → 6 · `--r-lg` 12 → 8 · `--r-card` 14 → 8 · `--r-panel` 18 → 10 ·
`--shadow-2` (panel shadow) → none · `--dur-fast` 120ms → 90ms · `--dur` 180ms → 140ms · `--ease-out` cubic-bezier(0.2, 0.8, 0.2, 1) → cubic-bezier(0.2, 0.9, 0.3, 1) ·
`--panel-inset` 10 → 8 · `--topbar-height` 56 → 48 · `--sidebar-width` 264 → 248.

## 1. Principles

- **Calm first.** Opening the app shows only what *you* need next. Team-wide noise goes to Inbox, not Home.
- **Bounded by design.** A screen must look the same with 4 members or 400. If a number can grow without limit, it does not go in a sentence or an unpaged list.
- **One home per feature.** Same place, every screen: navigation left, page actions top right, details right.
- **Content is the brightest thing.** The page panel is white; everything else sits on the warm grey ground.
- **Separate with space and surface, not lines.** Use a gap, a background change or a soft shadow. A line is only for dividing rows in a list, tabs, and the top bar.
- **One primary action per view.** Everything else is ghost, icon or link.

## 2. Colour tokens

All colours go through these CSS variables. No raw colour values in components.

### Surfaces and ink
| Token | Value | Use |
|---|---|---|
| `--ground` | `#efefec` | App background behind everything; both sidebars sit on it |
| `--canvas` | `#ffffff` | The page panel, cards on it, inputs, dialogs |
| `--surface-card` | `#f7f6f3` | Cards and tiles inside the white panel (recently visited, spaces) |
| `--surface-card-hover` | `#f3f2ee` | Hover on those cards |
| `--hover` | `#e6e5e1` | Hover on sidebar rows and ghost buttons |
| `--ink` | `#1c1b17` | Headings, primary text |
| `--ink-doc` | `#2f2d28` | Long reading text in pages |
| `--ink-label` | `#3d3b36` | Form labels |
| `--ink-muted` | `#66635c` | Meta text, counts, placeholders, icons (5.3:1 on ground) |
| `--line` | `rgb(28 27 23 / .12)` | Input borders are NOT this (see inputs); the page panel edge, the top bar bottom, card edges, the search field |
| `--line-soft` | `rgb(28 27 23 / .08)` | Row separators, tabs |

### Brand and actions
| Token | Value | Use |
|---|---|---|
| `--primary` | `#1c1b17` | Primary button, checked boxes, focus outline |
| `--on-primary` | `#ffffff` | Text on primary |
| `--accent` | `#ffd23f` | The one accent: logo dots, focus ring glow, selected picker, highlights |
| `--accent-soft` | `#ffefb0` | Own avatar, soft highlights |
| `--accent-ink` | `#5a4500` | Text on accent-soft |
| `--link` | `#3554d1` | Inline links, "View all", always underlined in prose |
| `--ring` | `rgb(255 208 47 / .55)` | 3px focus glow on inputs |
| `--selection` | `#ffeaa0` | Text selection |

### State
| Token | Value | Use |
|---|---|---|
| `--pill-bg` / `--pill-ink` | `#ffefb0` / `#5a4500` | Draft pill everywhere (lists and the properties block). Drafts are the one thing in yellow besides the selection. |
| `--draft-bg` / `--draft-pill` / `--draft-ink` | `#fffbea` / `#ffe48a` / `#4d3a00` | Unread rows |
| `--published-bg` / `--published-ink` | `#d9f3e1` / `#136c27` | Published pill |
| `--callout` | `#fff6d6` | Callout blocks |
| `--success-text` / `--warning-text` / `--error-text` | `#136c27` / `#92400e` / `#b42318` | Semantic colour as text |
| `--error-soft` / `--error-ink` | `#fdecea` / `#7a1d14` | Error banners |

Status is never colour alone: pills always carry their word.

### Tints (tags, roles, team initials)
Background / text pairs. Pick deterministically from a hash of the name.

| Tint | Bg | Text |
|---|---|---|
| sky | `#dcecfa` | `#0b5c99` |
| mint | `#d9f3e1` | `#136c27` |
| peach | `#ffe8d4` | `#793400` |
| rose | `#fde0ec` | `#a02e6d` |
| lavender | `#e6e0f5` | `#391c57` |
| yellow | `#fef7d6` | `#6b5200` |
| gray | `#f0eeec` | `#37352f` |

Roles: Admin = lavender, Editor = sky, Viewer = gray.

### Page colours (the dot a user picks per page)
`gray #787774` · `brown #93694f` · `orange #b05a0a` · `yellow #9a7200` · `green #0f7b6c` · `blue #2e7dbb` · `purple #8a5cc4` · `pink #c4337c` · `red #e03e3e`. Default: gray. (D-10, 2026-11-19: gray #9b9a97 → #787774, orange #d9730d → #b05a0a, yellow #dfab01 → #9a7200, so every dot passes 3:1 on white, the sidebar ground and a hovered row.)
Dot: 8×8px, radius 3px. On cards: 12×12px, radius 4px.

Dark mode: not in this release. Tokens are named by role so a dark theme can be added later by redefining them.

## 3. Typography

Fonts load from Google Fonts with `display=swap`.
- UI: `"Outfit", ui-sans-serif, system-ui, sans-serif`
- Titles: `"Newsreader", Georgia, serif`
- Code: `"Fragment Mono", ui-monospace, "Cascadia Code", Consolas, monospace`

| Token | Font | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|---|
| `title-page` | Newsreader | 28 / 1.1 | 500 | -0.01em | Screen titles (`h1`), team name, greeting |
| `title-doc` | Newsreader | 32 / 1.1 (28 under 640px) | 500 | -0.015em | The page title in the page view |
| `title-login` | Newsreader | 40 / 1.1 (34 under 480px) | 400 | -0.015em | Auth headings (centred) |
| `tagline` | Newsreader | 19 / 1.35 | 400 | 0 | The one line above the auth form, `--ink-label`, centred |
| `title-section` | Newsreader | 26 / 1.25 | 500 | -0.01em | h2 inside a page |
| `title-group` | Outfit | 15 / 1.25 | 600 | 0 | Section heads on overview screens ("Recently visited") |
| `body-doc` | Outfit | 16.5 / 1.65 | 400 | 0 | Page reading text, max 740px column |
| `body` | Outfit | 14 / 1.5 | 400 | 0 | Default UI |
| `body-strong` | Outfit | 14 / 1.5 | 500–600 | 0 | Nav items, list titles, buttons |
| `small` | Outfit | 13 / 1.4 | 400–500 | 0 | Meta, breadcrumbs, buttons in the top bar |
| `caption` | Outfit | 12 / 1.4 | 500–600 | 0 | Panel section heads, timestamps, pills |
| `micro` | Outfit | 11 / 1.4 | 600 | 0 | Count badges, avatar initials. **11px is the floor**: nothing smaller. |

Rules: labels are sentence case, never uppercase or letter-spaced. Headings use `text-wrap: balance`. Numbers in lists and counts use `font-variant-numeric: tabular-nums`. No italic words inside a heading.

## 4. Layout and the app shell

```
┌ ground #efefec ───────────────────────────────────────────────────────────┐
│ Sidebar 248   │ ┌ page panel (white, radius 10) ────────────┐ │ Details 288 │
│ (on ground)   │ │ top bar 48                                │ │ (on ground, │
│               │ │ ─ content: 740 reading / 1080 overview ─   │ │  optional)  │
│               │ └──────────────────────────────────────────┘ │             │
└───────────────────────────────────────────────────────────────────────────┘
```

- **Page panel:** white, radius 10px, inset 8px from the window on top, right and bottom, a 1px `--line` hairline edge (`box-shadow: 0 0 0 1px var(--line)`), no drop shadow.
- **Left sidebar** (248px, on ground, no border), top to bottom:
  0. Brand: the small Kenning mark (20px) + the live-text wordmark "kenning" (Outfit 600, lowercase); links to Home ("Kenning home"). On phones the top bar shows the mark alone at 24px in a 44px tap target, also linking to Home.
  1. Workspace switcher + New page icon button
  2. Search field (opens Ctrl+K): white, 1px `--line` border, radius 6, no shadow
  3. Home · Inbox (count badge) · Recent · Bookmarks
  4. Favourites
  5. Your teams: team row (initial on a tint) → spaces → page tree
  6. Private
  7. (space) Trash (opens a picker: each team's trash, or Private) · you + Help. Separated by space, no line. No Settings: the app has no settings screen; Profile is in the account menu.
  Rows are 32px, radius 6px. Active row: `--hover` background, no shadow. Group labels have 16px above them. Hovering a tree row shows `…` and `+` on the right.
- **Top bar** (48px, inside the panel, bottom line `--line`): breadcrumbs left; right side in this order: save state, avatars of people here, icon buttons (history, bookmark), the one primary button, `…`, then the details-panel toggle (last, far right). No Share button in Release 1a (sharing is 1b).
- **Team sub-navigation:** on team screens a slim row (44px) under the top bar: Overview · Pages · Members · Requests (count) · Trash. Active tab = `--surface-card-hover` pill. Only Overview repeats the team name as a big title.
- **Right details panel** (288px, on ground, outside the white panel, no border). Opens and closes from the top-bar toggle and its own close button; remembers its state per screen. Holds members, activity, version history. Section heads are `caption` muted with a link on the right ("Manage", "View all").
- **Content widths:** reading pages 740px (40px from the top); overview screens 1080px (Home 1040px). Page padding 40px, 32px from the top on Home and team screens.
- **Spacing:** 4px base. Use 4, 8, 12, 16, 20, 24, 32, 40, 56, 64. Tight inside a group (4–8), generous between groups (24–40).

## 5. Shapes and depth

Radius (Ledger, 2026-11-17): 4 tiny chips · 5 tags · 6 sidebar rows (`--r-row`) and rectangular buttons (top bar, Home, team screens, danger zone) · 8 cards (`--r-card`), inputs and callouts (`--r-lg`), the 40px page icon tile, danger rows · 10 page panel (`--r-panel`) · 18 the auth form card · 20 dialogs · 999 pills, avatars, the auth submit button.

Borders for structure (list rows, tabs, inputs, cards, the page panel edge), shadows only for things that float (menus, dialogs, toasts). Nested radii: outer = inner + padding.

| Level | Shadow | Use |
|---|---|---|
| 0 | none | Cards on white (white with a `--line` edge) |
| 1 | `0 1px 2px rgb(20 20 15 / .08)` | Segmented control's active segment |
| 2 | `none` (`--shadow-2`) | The page panel uses the hairline edge instead |
| 3 | `0 12px 32px -12px rgb(20 20 15 / .18), 0 0 0 1px rgb(28 27 23 / .06)` | Menus, Ctrl+K, dialogs, toasts |

## 6. Components

- **Buttons:** height 30 (top bar) or 40 (forms), radius 999, `small`/`body` 500. Primary = black with white text. Ghost = transparent + `--line` border. Icon button = 28×28, radius 8, muted icon, hover `--hover`. Press: scale 0.96 over 150ms. Disabled: 50% opacity, no press.
- **Inputs:** 40px, white, 1px border `#8f8b84` (3.4:1 on white; lighter greys fail the 3:1 rule), radius 12, label above (13/500 `--ink-label`). Focus: black border + 3px `--ring` glow.
- **List row:** 38px, bottom line `--line-soft`, lead (dot or icon) · title 500 · location muted · status pill · avatar · time (tabular, right).
- **Card (recently visited, spaces):** white with a 1px `--line` edge, radius 8, padding 14, min height 92, icon/dot top, title 600, meta row at the bottom (location left, time right). The edge turns `--ink-muted` on hover.
- **Tabs:** no underline tabs. Use the team sub-navigation pills (section 4) or the segmented control.
- **Pills:** 11–12px 600, radius 999. Draft, Published, roles, count.
- **Tags:** 12px 600, radius 999, tint pair.
- **Avatar:** circle 24px (lists) / 22px (sidebar), initials 11px 700 on a tint, white 2px ring when stacked.
- **Callout:** `--callout` background, radius 12, padding 16, icon + text.
- **Draft state:** shown in the page's properties block (Draft pill + one sentence + "Compare"), never as a full-width bar.
- **Icons:** one line icon set, 16px, stroke 1.4–1.5, `currentColor`. Never emoji for UI icons.
- **Icon tile:** a line glyph (`currentColor`) centred in a rounded square with a tint background: 20px/radius 6 in group headers, 36px/radius 10 in result and trash rows, 40px/radius 8 as the page icon above the title.
- **Properties block (page view):** two-column grid (label column 120px, muted, with a 14px icon; value column ink). Rows 32px. Draft = soft yellow pill with a dot; tags with "+ Add"; last edited = avatar, name, time.
- **Segmented control:** pill track `--surface-card-hover`, active segment white + level-1 shadow, counts in an 11px badge. Used for Trash/Archived, result types, Inbox filters, panel tabs.
- **View bar (list screens):** view tabs as small pills on the left, active filters as yellow chips with ×, Filter and Display icon buttons on the right.
- **Group header row:** 36px, `--surface-card`, collapse chevron, colour dot, name, count, `+` on the right.
- **Comment:** white bubble (radius 14) on the ground-coloured panel; avatar, name, time, text. Composer pinned at the bottom with a round black send button.
- **Presence banner (soft lock):** rounded `--surface-card` box under the top bar, aligned to the reading column; avatar with a green live dot, one short sentence, "Open read-only" (white) and "Edit anyway" (quiet text). No colour wash, no full-width line.
- **Dialog:** white, radius 20, level 3, max 560px, Newsreader title, footer right-aligned (ghost Cancel, black primary). Consequences go in a soft yellow box with ticks and one red warning line.
- **Empty states:** one line saying what goes here + one action. Never "Nothing here".
- **Loading:** skeleton rows, never a spinner in content. Spinner only inside a button.
- **Error state:** one inline line in `--error-text` saying what failed + a "Try again" link-button; a whole screen that fails uses the empty-state layout (Newsreader 26 heading, one muted line, one ghost button).
- **Toast:** bottom-right, 16px from the edges, white, radius 8, level 3, max 360px wide, 13.5px text, a dismiss icon button; errors carry an info icon in `--error-text`. Gone after 6 s, at most 3 at once. The `aria-live="polite"` region is always in the page. Toasts replace `alert()` for failures that have no place on screen.

## 7. Screen patterns

- **Home:** greeting in `title-page` ("Good morning, Sayem") + date. **Recently visited:** up to 6 cards, only pages you opened. **Your drafts:** only yours, up to 5 + "View all". No team activity, no team list (both live elsewhere).
- **Team overview:** slim team tabs, then title, one-line description, facts row (members stack + count, spaces and page count, your role, last update). Spaces (cards) and Recently updated (8 rows + "View all N pages"). Members and Activity go in the right panel.
- **Team pages list:** view bar (All pages · Drafts · Published · Edited by me), icon column headers (Title, Status, Last edited by, Edited), rows 40px grouped by space with group header rows, status as a small circle (filled = published), `…` on hover, footer line "N pages · grouped by space · sorted by last edited", 25 per page.
- **Team members:** member rows (avatar, name, email, role pill that opens a menu, remove ×); beside them a yellow Join requests box (Accept / Decline) and a grey Invite link box (read-only field + Copy).
- **Page view:** breadcrumbs, 740px column, page icon tile, `title-page`, properties block, blocks. Right panel tabs: Comments · Files · Summary.
- **Editing:** "Saving…" with a yellow dot in the top bar; hovered block gets a soft background with `+` and drag handle on its left; `/` opens the block menu (Basic blocks · Media · Others, each item an icon tile + name + one-line description + shortcut; selected item soft yellow).
- **Someone else is editing:** presence banner (section 6) and a "Read-only" tag in the top bar; Publish hidden.
- **Ctrl+K palette:** dialog 680px wide, 110px from the top, over a dimmed screen (`rgb(28 27 23 / .32)`). Search field 56px, a scope row (All · Pages · Content · Actions with counts; Tab switches), then groups separated by a line, each with an icon-tile header and count: Pages (dot, title, location chip), Found inside pages (two lines: matching text, "in <page>"), Actions (grey tiles). Selected row soft yellow with "Open ↵". Footer with key hints.
- **Search page:** large search field with a yellow focus glow, Status filter, removable tag chip, segmented type filter with counts; results grouped (Pages, Spaces), each result a rounded row: icon tile, title + status pill, highlighted snippet, location chip, editor, time; "Show all N" per group.
- **Trash (per space):** title + one line, segmented Trash · Archived, filter field; items grouped "Gone for good this week" (soft red rows, solid red days-left badge) and "Later"; each item a rounded row: icon tile, title, sub-page badge, "Was in …", note when the parent is gone, deleted by, days-left badge, Restore, red delete icon.
- **Move to team:** dialog with Team and Space pickers side by side, "Put it under" radio tree, consequences box.
- **Profile:** two cards: You (88px avatar with camera button, upload/remove, name, read-only email, Save) and My teams (team tile, name, role pill).
- **Inbox (Release 1b):** segmented Unread · All · Mentions, team filter, notifications grouped Today / Earlier on a `--surface-card` panel, unread rows soft yellow with a dot, a type tile (mention, comment, join request, publish), Mark all read, Load more.
- **Version history:** opens in the right panel. Versions grouped by day (avatar, name, kind: Autosaved / Published / Restored, time); the current one has a "Current" pill. Selecting one shows a bar above the page ("Viewing version 11 by …") and highlights changes in the page, one colour per author with a legend at the top of the panel. Restore this version (primary) and Compare with current at the bottom.
- **Login / register / join:** no sidebar. A decorative stage fills the window (`--ground`, aria-hidden, nothing focusable, never catches the pointer): a 28px dot grid that fades out around the form, a soft yellow glow behind it, six app fragments (a page card, a meeting note with to-dos, an API call, a Files list, a named version, a Published pill) each joined to the form card by a thin soft S-curve with small end circles (leaves the fragment flat, arrives at the card flat, controls at 45%/55% of the width). Every curve rises or falls at least 48px: the card-side end moves toward or away from the card's vertical centre, never the fragment; where 48px does not fit it becomes a gentle double wave (two ~20px bends). Three depths keep it calm and balanced side to side, and each curve takes its fragment's opacity: clear (1) API design notes, the Published pill, Ayesha's cursor; half (0.55) Weekly sync, the POST card, Rafi's cursor; faded (0.25, scale 0.94, 0.5px blur) Before the demo and Files; and two named cursors (Ayesha `--cursor-a`, Rafi `--cursor-b`) on a slow 60s drift. Nothing moves under reduced motion. The page card hides below 1200px (it cannot keep 48px from the form card there). 700–1100px: only the Published pill and the cursors. Under 700px: only the Published pill and Ayesha's cursor, in an 84px band under the brand. Brand centred at the top (the small Kenning mark plus the live-text wordmark "kenning", Outfit 600), footer at the bottom ("© year Kenning" left, "Source on GitHub" → github.com/Lut4Sayem/kenning right). The form is one white card centred in the window: max 440px, padding 32 (24/20 under 700px), radius 18, a `--line` edge plus a soft drop shadow. Inside, centred: the `tagline` "Your team’s knowledge, in one place.", the `title-login` heading at weight 400, one muted line; then left-aligned 44px inputs, a full-width black 46px button, and a centred link to the other auth page. Join puts the team (52px tile, name, "N members · invited by …") under the tagline, then who you are signed in as ("Not you?"), Ask to join, and one line on what happens next; it needs `GET /api/team-invites/{code}` and falls back to "Join a team" without it.

## 8. Bounded lists (non-negotiable)

| Where | Shows at most | Then |
|---|---|---|
| Home · Recently visited | 6 | nothing (it's yours) |
| Home · Your drafts | 5 | View all |
| Team overview · Recently updated | 8 | View all N pages → Pages tab (sort, filter, paging) |
| Right panel · Members | 5 | + N more → Members tab |
| Right panel · Activity | 5 | View all → Inbox filtered to this team |
| Inbox | 25 per page | Load more |
| Ctrl+K palette | 5 per group | refine the search |
| Version history | 20 | Load older versions |
| Trash / Archived | 25 per page | Load more |
| Search page | 3 per group | Show all N |
| Team pages list | 25 per page | Previous / Next |
| Comments panel | 20 | Load earlier comments |

Sentences never contain counts that grow with the team ("100 people changed 50 pages" is banned).

## 9. Motion

90–140ms (`--dur-fast` 90ms for hover and press, `--dur` 140ms for panels and menus), ease-out `cubic-bezier(0.2, 0.9, 0.3, 1)`. Animate only `opacity`, `transform`/`scale` and `background-color`; never `transition: all`. Hover feedback is instant or ≤140ms. Panels slide in `--dur`. The auth stage is the one exception: slow ambient drift (a 60s cursor path, a 14s glow), fully still under reduced motion. Everything respects `prefers-reduced-motion: reduce` (fall back to an opacity fade). No page-load sequences.

## 10. Accessibility (non-negotiable)

Text ≥ 4.5:1, large text and input borders ≥ 3:1. Visible `:focus-visible` on everything (2px black outline, 2px offset). Real `<button>`/`<a>`, labels tied to inputs, `aria-label` on icon buttons, `aria-live` for toasts. Skip-to-content link. Touch targets ≥ 40px on touch screens (`pointer: coarse`). No horizontal scroll at 360px.

Breakpoints: **1024px and up** the full shell. **640–1023px** a menu button opens and folds the sidebar (remembered); the right panel floats over the page (level 3) and starts closed. **Under 640px** the sidebar is an off-canvas drawer (max 300px, scrim, Esc and a close button, the page behind is inert, closes on navigation) opened from a menu button at the left of the top bar; the right panel is a full-screen sheet on the ground colour with its own close button.

## 11. Do / Don't

Do: space and surface to separate · one primary action · caps and "View all" on every overview list · sentence-case labels · Newsreader only for titles.
Don't: big repeated titles on list screens · full-width coloured bars with hard edges · centred auth cards · tree guide lines · uppercase or letter-spaced labels · counts in sentences · gradients or glows · cards inside cards · emoji as UI icons · dot-joined meta strings · `alert()`/`confirm()` · text under 11px · raw user text inserted as HTML.
