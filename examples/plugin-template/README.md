# Vigil Plugin Template

A minimal example plugin for the Vigil dashboard.

## Directory Structure

```
my-plugin/
  widget.ts        # Plugin manifest (default export) — REQUIRED
  PluginPage.tsx   # React component rendered in dashboard
```

## Installation

Symlink your plugin directory into `~/.vigil/plugins/`:

```bash
mkdir -p ~/.vigil/plugins
ln -s /path/to/my-plugin ~/.vigil/plugins/my-plugin
```

Restart the Vigil daemon. Your plugin will appear in the sidebar.

## Manifest Schema

The `widget.ts` file must have a default export matching this schema:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `id` | `string` | Yes | Lowercase alphanumeric + hyphens only (`/^[a-z0-9-]+$/`) |
| `label` | `string` | Yes | Display name in sidebar |
| `icon` | `string` | Yes | Lucide icon name (e.g., `"Puzzle"`, `"Zap"`) |
| `slot` | `WidgetSlot` | Yes | One of: `"tab"`, `"sidebar"`, `"timeline-card"`, `"overlay"`, `"top-bar"` |
| `order` | `number` | Yes | Must be >= 100. Core plugins use 0-99. |
| `component` | `() => Promise<{ default: ComponentType<WidgetProps> }>` | Yes | Lazy import factory for the React component |
| `sseEvents` | `string[]` | No | SSE event names that trigger query re-fetches |
| `queryKeys` | `string[][]` | No | TanStack Query keys invalidated by SSE events |
| `apiRoutes` | `ApiRoute[]` | No | HTTP endpoints mounted at `/api/plugins/<id>/*` |

### API Routes

Each route in `apiRoutes` has:

| Field | Type | Notes |
|-------|------|-------|
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE"` | HTTP method |
| `path` | `string` | Relative path (e.g., `"/hello"` becomes `/api/plugins/<id>/hello`) |
| `handler` | `(req: Request) => Response \| Promise<Response>` | Handler receives raw Request, must return Response |

## WidgetProps

Your component receives:

```typescript
interface WidgetProps {
  activeRepo: string | null;   // Currently selected repo name
  queryClient: QueryClient;     // TanStack Query client instance
}
```

## Ordering

- Core plugins: 0-99 (reserved)
- User plugins: 100+ (your plugin)
- Lower numbers appear first in the sidebar

## Error Handling

Plugins are wrapped in React error boundaries. If your component throws during render, it shows an error card without affecting the rest of the dashboard. API route handlers are wrapped in try/catch — a throwing handler returns `{ error: "Plugin error" }` with status 500.

## Slot Types

| Slot | Where it renders |
|------|-----------------|
| `tab` | Main content area with sidebar entry |
| `sidebar` | Sidebar-only widget |
| `timeline-card` | Card in the timeline feed |
| `overlay` | Floating overlay panel |
| `top-bar` | Top navigation bar widget |
