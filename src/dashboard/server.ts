import { join } from "node:path";
import type { Daemon } from "../core/daemon.ts";
import { getOverviewFragment, getOverviewJSON } from "./api/overview.ts";
import { SSEManager, wireSSE } from "./api/sse.ts";

const STATIC_DIR = join(import.meta.dir, "static");

/** Shared context passed to all API handlers */
export interface DashboardContext {
  daemon: Daemon;
  sse: SSEManager;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function getMime(path: string): string {
  const ext = path.slice(path.lastIndexOf("."));
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function serveStatic(path: string): Promise<Response> {
  const filePath = join(STATIC_DIR, path);

  // Security: prevent directory traversal
  if (!filePath.startsWith(STATIC_DIR)) {
    return new Response("Forbidden", { status: 403 });
  }

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file, {
    headers: {
      "Content-Type": getMime(filePath),
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export function startDashboard(daemon: Daemon, port = 7480): ReturnType<typeof Bun.serve> {
  const sse = new SSEManager();
  const ctx: DashboardContext = { daemon, sse };

  // Wire SSE events from daemon
  wireSSE(sse, ctx);

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const path = url.pathname;

      // --- API Routes ---
      if (path === "/api/overview") {
        return json(getOverviewJSON(ctx));
      }
      if (path === "/api/overview/fragment") {
        return html(getOverviewFragment(ctx));
      }
      if (path === "/api/sse") {
        return sse.connect();
      }

      // --- Static Files ---
      if (path === "/dash" || path === "/dash/") {
        return serveStatic("index.html");
      }
      if (path.startsWith("/dash/")) {
        const subPath = path.slice("/dash/".length);
        return serveStatic(subPath);
      }

      // Root redirect to dashboard
      if (path === "/") {
        return Response.redirect("/dash", 302);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}
