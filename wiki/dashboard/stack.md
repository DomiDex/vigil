---
title: Dashboard Stack & Entry
type: subsystem
updated: 2026-04-19
sources:
  - dashboard-v2/package.json
  - dashboard-v2/src/router.tsx
  - dashboard-v2/src/routes/__root.tsx
  - dashboard-v2/src/app.css
---

# Dashboard Stack & Entry

`dashboard-v2/` is a TanStack Start + React 19 SPA. It's built with Vite and served by the Vigil daemon on the same port as the REST API.

## Stack

| Piece | Version | Role |
|---|---|---|
| React | 19.2.5 | UI framework |
| TanStack Start | 1.167.41 | File-based routing + server functions |
| TanStack React Router | 1.168.22 | Routing primitives |
| TanStack React Query | 5.99.0 | Server state / caching |
| TanStack React Table | 8.21.3 | Sortable/paginated tables |
| Radix UI | 1.4.3 | Accessible primitives (shadcn base) |
| Tailwind CSS | 4.2.2 | Styling with `@theme` directive |
| Zod | 4.3.6 | Runtime validation (shared with backend) |
| Recharts | 3.8.0 | Metrics charts |
| Sonner | 2.0.7 | Toasts |
| Lucide-react | 1.8.0 | Icons |
| class-variance-authority, clsx, tailwind-merge | — | `cn()` helper + variant styling |

Shadcn components are **copied, not depended on** — they live under `src/components/ui/` and are owned source.

## Build commands

```bash
# Dev (Vite + HMR)
bun run dashboard:dev

# Production build
bun run dashboard:build
```

`dashboard:build` produces `dashboard-v2/dist/`. The daemon lazy-imports `dist/server/server.js` on first request (`src/dashboard/server.ts`).

## Dev proxy

`dashboard-v2/vite.config.ts` proxies `/api/*` to `http://localhost:7480` so the dev server and the backend can both run locally while still sharing paths.

## Router boot

`src/router.tsx` creates the router + `QueryClient`:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,        // 30 s
      gcTime: 5 * 60_000,       // 5 min
      refetchOnWindowFocus: false,
    },
  },
});
```

Routes are auto-generated in `src/routeTree.gen.ts` from the files in `src/routes/`. See [Routing](routing.md).

## Root layout

`src/routes/__root.tsx:22-68`:

```
<html lang="en" className="dark">
  <QueryClientProvider>
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <SiteHeader />
          <main>
            <Outlet />     {/* route content */}
          </main>
          <CommandPalette />
        </SidebarInset>
      </SidebarProvider>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>
</html>
```

Default theme is `dark`. `useSSE()` is invoked here so every page share a single EventSource connection.

## Styling

`src/app.css` declares Tailwind v4 `@theme` variables (colors from memory: `bg: #222745` navy, `accent: #FF8102` orange). Components use `cn(...)` from `src/lib/cn.ts`:

```ts
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(...inputs));
```

## Data flow at a glance

```
React component
   └─► useQuery(queryKey, () => getX())      [src/lib/query-keys.ts]
           └─► server function getX()         [src/server/functions.ts]
                   └─► fetch('/api/...')      → Bun.serve → API handler
                                              → VigilContext (daemon)

SSE / useSSE()
   └─► EventSource('/api/sse')
           └─► on event → queryClient.invalidateQueries(keyFromMap)
```

## See also

- [Server Functions](server-functions.md) — full RPC surface.
- [Plugins](plugins.md) — the pluggable page layer.
- [Routing & SSE](routing.md) — route table + event map.
- [Components](components.md) — layout / ui / vigil components.
