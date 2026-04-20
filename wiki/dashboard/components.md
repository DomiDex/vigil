---
title: Dashboard Components
type: reference
updated: 2026-04-19
sources:
  - dashboard-v2/src/components/layout/
  - dashboard-v2/src/components/ui/
  - dashboard-v2/src/components/vigil/
---

# Components

Three buckets of components under `dashboard-v2/src/components/`:

- `layout/` — chrome (sidebar, header, countdown).
- `ui/` — shadcn-style primitives (copied, not npm-depended).
- `vigil/` — domain-specific (DreamEntry, TimelineEntry, ActionApproval, …).

## Layout

### AppSidebar — `src/components/layout/app-sidebar.tsx:52-102`

- Props: `plugins: PluginWidget[]`.
- `Sidebar` is collapsible to icon-only.
- Header: brand (`V` badge) + label.
- Tab list: iterates `plugins.filter(p => p.slot === "tab")` ordered by `.order`.
- Per-plugin item: icon + label + active link via TanStack Router.
- Footer: contextual — renders repo cards with `RepoStateIndicator` (active / sleeping / dreaming, dirty chip) and daemon state + next-tick countdown.
- **Queries**: `getRepos`, `getOverview` (refetchInterval 30 s).

### SiteHeader — `src/components/layout/site-header.tsx:36-74`

- `SidebarTrigger` + breadcrumb ("Vigil > <page label>").
- `NextTickCountdown` pinned right (consumes `overview.nextTickIn`).
- `routeLabels` object maps route paths to display names.

### NextTickCountdown — `src/components/layout/next-tick-countdown.tsx`

- Subscribes to `getOverview` and decrements locally between refetches.

## UI primitives

Under `src/components/ui/`. All are shadcn/ui copies owned by the repo. Groups:

- **Structural**: `sidebar.tsx`, `card.tsx`, `breadcrumb.tsx`, `dialog.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `tabs.tsx`, `collapsible.tsx`, `scroll-area.tsx`, `separator.tsx`.
- **Input**: `input.tsx`, `textarea.tsx`, `label.tsx`, `button.tsx`, `switch.tsx`, `select.tsx`, `command.tsx`, `calendar.tsx`.
- **Display**: `badge.tsx`, `table.tsx`, `skeleton.tsx`, `tooltip.tsx`, `dropdown-menu.tsx`.
- **Toast**: `sonner.tsx` (wraps `sonner`).
- **Charts**: `chart.tsx` (recharts integration).

Styling convention: variants via `class-variance-authority`, classes merged via `cn()` from `src/lib/cn.ts`.

## Vigil domain components

Under `src/components/vigil/`:

| Component | Role |
|---|---|
| `DreamEntry` | Card for a single consolidated dream (Moon icon, repo, confidence bar, expandable summary, insights, patterns) |
| `TimelineEntry` | Row for a `VigilMessage` — decision icon, source, severity badge |
| `ActionApproval` | Card for a pending ActionRequest, with approve/reject. `getTierBadgeClasses()` for tier chrome |
| `RepoCard` | Compact repo display; `computeDecisionPercentages` util for the decision mix |
| `DiffViewer` | Side-by-side git diff |
| `MemorySearch` | Search input + result list over `searchMemory()` |
| `AskVigil` | Q&A widget over `askVigil()` |
| `CommandPalette` | cmdk palette driven by `command-palette-data.ts` registry |
| `ErrorBoundary` | Standard React error boundary for plugin-level isolation |

## Specialist-specific helpers

Co-located under `src/plugins/agents/`:

- `SpecialistCard.tsx` — grid card (name, class badge, model, findings count, last run, cooldown remaining, trigger events).
- `SpecialistEditSheet.tsx` — create/edit form: name, class select, description, model, trigger events multi-select, watch patterns, system prompt (textarea), cooldown seconds, severity threshold.
- `FindingDetailSheet.tsx` — severity icon + badge, description, reproduction steps, **Dismiss** (with optional ignore pattern) + **Create action from finding**.
- `severity.ts` — `severityClasses(sev)` returns Tailwind class tuples.
- `time.ts` — `formatRelativeTime(iso)` → "12m ago".

## See also

- [Plugins](plugins.md) — pages that consume these.
- [Stack](stack.md) — full dep list.
