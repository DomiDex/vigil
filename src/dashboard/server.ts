import { join } from "node:path";
import type { Daemon } from "../core/daemon.ts";
import { getMetricsFragment, getMetricsJSON } from "./api/metrics.ts";
import { getOverviewFragment, getOverviewJSON } from "./api/overview.ts";
import { getRepoDetailJSON, getRepoFragment, getRepoNavFragment, getReposJSON } from "./api/repos.ts";
import { SSEManager, wireSSE } from "./api/sse.ts";
import { getDreamPatternsJSON, getDreamsFragment, getDreamsJSON, handleDreamTrigger } from "./api/dreams.ts";
import { getMemoryFragment, getMemoryJSON, getMemorySearchFragment, getMemorySearchJSON, handleAsk } from "./api/memory.ts";
import { getEntryFragment, getTimelineFragment, getTimelineJSON, handleReply } from "./api/timeline.ts";

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

      // --- Metrics API ---
      if (path === "/api/metrics" && req.method === "GET") {
        return json(getMetricsJSON(ctx));
      }
      if (path === "/api/metrics/fragment" && req.method === "GET") {
        return html(getMetricsFragment(ctx));
      }

      // --- Repo API ---
      if (path === "/api/repos" && req.method === "GET") {
        return json(getReposJSON(ctx));
      }
      if (path === "/api/repos/fragment" && req.method === "GET") {
        return html(getRepoNavFragment(ctx));
      }
      // Match /api/repos/:name/fragment
      const repoFragMatch = path.match(/^\/api\/repos\/([^/]+)\/fragment$/);
      if (repoFragMatch && req.method === "GET") {
        const fragment = await getRepoFragment(ctx, decodeURIComponent(repoFragMatch[1]));
        if (!fragment) return json({ error: "Repo not found" }, 404);
        return html(fragment);
      }
      // Match /api/repos/:name (must be after /fragment to avoid shadowing)
      const repoDetailMatch = path.match(/^\/api\/repos\/([^/]+)$/);
      if (repoDetailMatch && req.method === "GET") {
        const detail = await getRepoDetailJSON(ctx, decodeURIComponent(repoDetailMatch[1]));
        if (!detail) return json({ error: "Repo not found" }, 404);
        return json(detail);
      }

      // --- Timeline API ---
      if (path === "/api/timeline" && req.method === "GET") {
        return json(getTimelineJSON(ctx, url));
      }
      if (path === "/api/timeline/fragment" && req.method === "GET") {
        return html(getTimelineFragment(ctx, url));
      }
      // Match /api/timeline/:id/fragment
      const entryMatch = path.match(/^\/api\/timeline\/([^/]+)\/fragment$/);
      if (entryMatch && req.method === "GET") {
        const id = entryMatch[1];
        const collapsed = url.searchParams.get("collapsed") === "1";
        const fragment = getEntryFragment(ctx, id, collapsed);
        if (!fragment) return json({ error: "Not found" }, 404);
        return html(fragment);
      }
      // Match /api/timeline/:id/reply
      const replyMatch = path.match(/^\/api\/timeline\/([^/]+)\/reply$/);
      if (replyMatch && req.method === "POST") {
        const id = replyMatch[1];
        const body = await req.formData().catch(() => null);
        const replyText = body?.get("reply")?.toString() || "";
        return html(handleReply(ctx, id, replyText));
      }

      // --- Memory API ---
      if (path === "/api/memory" && req.method === "GET") {
        return json(getMemoryJSON(ctx));
      }
      if (path === "/api/memory/fragment" && req.method === "GET") {
        return html(getMemoryFragment(ctx));
      }
      if (path === "/api/memory/search" && req.method === "GET") {
        const q = url.searchParams.get("memq") || "";
        const repo = url.searchParams.get("memrepo") || undefined;
        return json(getMemorySearchJSON(ctx, q, repo));
      }
      if (path === "/api/memory/search/fragment" && req.method === "GET") {
        const q = url.searchParams.get("memq") || "";
        const repo = url.searchParams.get("memrepo") || undefined;
        return html(getMemorySearchFragment(ctx, q, repo));
      }
      if (path === "/api/memory/ask" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        const question = body?.get("askq")?.toString() || "";
        const repo = body?.get("askrepo")?.toString() || undefined;
        const result = await handleAsk(ctx, question, repo);
        return html(result);
      }

      // --- Dreams API ---
      if (path === "/api/dreams" && req.method === "GET") {
        return json(getDreamsJSON(ctx));
      }
      if (path === "/api/dreams/fragment" && req.method === "GET") {
        const repo = url.searchParams.get("dreamrepo") || undefined;
        return html(getDreamsFragment(ctx, repo));
      }
      if (path === "/api/dreams/trigger" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        const repo = body?.get("dreamrepo")?.toString() || undefined;
        const result = await handleDreamTrigger(ctx, repo);
        return html(result);
      }
      // Match /api/dreams/patterns/:repo
      const patternsMatch = path.match(/^\/api\/dreams\/patterns\/([^/]+)$/);
      if (patternsMatch && req.method === "GET") {
        return json(getDreamPatternsJSON(ctx, decodeURIComponent(patternsMatch[1])));
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
