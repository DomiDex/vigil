import { join } from "node:path";
import { setVigilContext } from "../../dashboard-v2/src/server/vigil-context.ts";
import type { Daemon } from "../core/daemon.ts";
import {
  getActionsFragment,
  getActionsJSON,
  getActionsPendingJSON,
  handleApprove,
  handleReject,
} from "./api/actions.ts";
import { getDreamPatternsJSON, getDreamsFragment, getDreamsJSON, handleDreamTrigger } from "./api/dreams.ts";
import {
  getMemoryFragment,
  getMemoryJSON,
  getMemorySearchFragment,
  getMemorySearchJSON,
  handleAsk,
} from "./api/memory.ts";
import { getMetricsFragment, getMetricsJSON } from "./api/metrics.ts";
import { getOverviewFragment, getOverviewJSON } from "./api/overview.ts";
import { getRepoDetailJSON, getRepoFragment, getRepoNavFragment, getReposJSON } from "./api/repos.ts";
import {
  getSchedulerFragment,
  getSchedulerJSON,
  handleSchedulerCreate,
  handleSchedulerDelete,
  handleSchedulerTrigger,
} from "./api/scheduler.ts";
import { SSEManager, wireSSE } from "./api/sse.ts";
import {
  getTasksFragment,
  getTasksJSON,
  handleTaskActivate,
  handleTaskCancel,
  handleTaskComplete,
  handleTaskCreate,
  handleTaskFail,
  handleTaskUpdate,
} from "./api/tasks.ts";
import { getEntryFragment, getTimelineFragment, getTimelineJSON, handleReply } from "./api/timeline.ts";
import { getConfigJSON, handleConfigUpdate, getFeatureGatesJSON, handleFeatureToggle } from "./api/config.ts";
import {
  getWebhookEventsJSON,
  getWebhookSubscriptionsJSON,
  handleSubscriptionCreate,
  handleSubscriptionDelete,
  getWebhookStatusJSON,
} from "./api/webhooks.ts";
import {
  getChannelsJSON,
  handleChannelRegister,
  handleChannelDelete,
  getChannelPermissionsJSON,
  getChannelQueueJSON,
} from "./api/channels.ts";
import {
  getNotificationsJSON,
  handleTestNotification,
  handleNotificationRulesUpdate,
} from "./api/notifications.ts";
import { getAgentsJSON, getCurrentAgentJSON, handleAgentSwitch } from "./api/agents.ts";
import { getHealthJSON } from "./api/health.ts";
import { getA2AStatusJSON, getA2ASkillsJSON, getA2AHistoryJSON } from "./api/a2a-status.ts";
import { loadUserPlugins, getPluginApiRoutes, type PluginApiRoute } from "./plugin-loader.ts";
import { corePlugins } from "../../dashboard-v2/src/plugins/index.ts";
import type { DashboardContext } from "./types.ts";

const STATIC_DIR = join(import.meta.dir, "static");
const V2_DIST_DIR = join(import.meta.dir, "../../dashboard-v2/dist");

// TanStack Start handler (loaded lazily on first request)
let startHandler: { fetch: (req: Request) => Response | Promise<Response> } | null = null;
let startHandlerLoaded = false;

async function loadStartHandler(): Promise<typeof startHandler> {
  if (startHandlerLoaded) return startHandler;
  startHandlerLoaded = true;
  try {
    const mod = await import("../../dashboard-v2/dist/server/server.js");
    if (mod.default?.fetch) {
      startHandler = mod.default;
      console.log("[dashboard] TanStack Start handler loaded");
    }
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
      console.log("[dashboard] TanStack Start handler not found, serving legacy HTML");
    } else {
      console.error("[dashboard] Failed to load TanStack Start handler:", e);
    }
  }
  return startHandler;
}

// Re-export from types.ts for backward compatibility
export type { DashboardContext } from "./types.ts";

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

  // Set context for TanStack Start server functions
  setVigilContext(ctx);

  // Wire SSE events from daemon
  wireSSE(sse, ctx);

  // Load user plugins from ~/.vigil/plugins/
  let userPlugins: Awaited<ReturnType<typeof loadUserPlugins>> = [];
  let pluginApiRoutes: Map<string, PluginApiRoute[]> = new Map();

  loadUserPlugins()
    .then((plugins) => {
      userPlugins = plugins;
      pluginApiRoutes = getPluginApiRoutes();
      if (plugins.length > 0) {
        console.log(`[dashboard] Loaded ${plugins.length} user plugin(s): ${plugins.map((p) => p.id).join(", ")}`);
      }
    })
    .catch((err) => {
      console.warn("[dashboard] Failed to load user plugins:", err);
    });

  const server = Bun.serve({
    port,
    idleTimeout: 255, // SSE connections need long-lived sockets
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

      // --- Tasks API ---
      if (path === "/api/tasks" && req.method === "GET") {
        const status = url.searchParams.get("status") || undefined;
        const repo = url.searchParams.get("repo") || undefined;
        return json(getTasksJSON(ctx, { status, repo }));
      }
      if (path === "/api/tasks/fragment" && req.method === "GET") {
        const status = url.searchParams.get("status") || undefined;
        const repo = url.searchParams.get("repo") || undefined;
        return html(getTasksFragment(ctx, { status, repo }));
      }
      if (path === "/api/tasks" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        if (!body) return json({ error: "Invalid form data" }, 400);
        return html(handleTaskCreate(ctx, body));
      }
      // Match POST /api/tasks/:id/activate
      const taskActivateMatch = path.match(/^\/api\/tasks\/([^/]+)\/activate$/);
      if (taskActivateMatch && req.method === "POST") {
        return html(handleTaskActivate(ctx, taskActivateMatch[1]));
      }
      // Match POST /api/tasks/:id/complete
      const taskCompleteMatch = path.match(/^\/api\/tasks\/([^/]+)\/complete$/);
      if (taskCompleteMatch && req.method === "POST") {
        return html(handleTaskComplete(ctx, taskCompleteMatch[1]));
      }
      // Match POST /api/tasks/:id/fail
      const taskFailMatch = path.match(/^\/api\/tasks\/([^/]+)\/fail$/);
      if (taskFailMatch && req.method === "POST") {
        return html(handleTaskFail(ctx, taskFailMatch[1]));
      }
      // Match PUT /api/tasks/:id (edit)
      const taskUpdateMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskUpdateMatch && req.method === "PUT") {
        const body = await req.formData();
        return html(handleTaskUpdate(ctx, taskUpdateMatch[1], body));
      }
      // Match DELETE /api/tasks/:id
      const taskDeleteMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskDeleteMatch && req.method === "DELETE") {
        return html(handleTaskCancel(ctx, taskDeleteMatch[1]));
      }

      // --- Actions API ---
      if (path === "/api/actions" && req.method === "GET") {
        const status = url.searchParams.get("status") || undefined;
        return json(getActionsJSON(ctx, { status }));
      }
      if (path === "/api/actions/pending" && req.method === "GET") {
        return json(getActionsPendingJSON(ctx));
      }
      if (path === "/api/actions/fragment" && req.method === "GET") {
        const status = url.searchParams.get("status") || undefined;
        return html(getActionsFragment(ctx, { status }));
      }
      // Match POST /api/actions/:id/approve
      const actionApproveMatch = path.match(/^\/api\/actions\/([^/]+)\/approve$/);
      if (actionApproveMatch && req.method === "POST") {
        const result = await handleApprove(ctx, actionApproveMatch[1]);
        return html(result);
      }
      // Match POST /api/actions/:id/reject
      const actionRejectMatch = path.match(/^\/api\/actions\/([^/]+)\/reject$/);
      if (actionRejectMatch && req.method === "POST") {
        return html(handleReject(ctx, actionRejectMatch[1]));
      }

      // --- Scheduler API ---
      if (path === "/api/scheduler" && req.method === "GET") {
        return json(getSchedulerJSON(ctx));
      }
      if (path === "/api/scheduler/fragment" && req.method === "GET") {
        return html(getSchedulerFragment(ctx));
      }
      if (path === "/api/scheduler" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        if (!body) return json({ error: "Invalid form data" }, 400);
        const result = await handleSchedulerCreate(ctx, body);
        return html(result);
      }
      // Match DELETE /api/scheduler/:id
      const schedDeleteMatch = path.match(/^\/api\/scheduler\/([^/]+)$/);
      if (schedDeleteMatch && req.method === "DELETE") {
        return html(handleSchedulerDelete(ctx, schedDeleteMatch[1]));
      }
      // Match POST /api/scheduler/:id/trigger
      const schedTriggerMatch = path.match(/^\/api\/scheduler\/([^/]+)\/trigger$/);
      if (schedTriggerMatch && req.method === "POST") {
        const result = await handleSchedulerTrigger(ctx, schedTriggerMatch[1]);
        return html(result);
      }

      // --- Config API ---
      if (path === "/api/config" && req.method === "GET") {
        return json(getConfigJSON(ctx));
      }
      if (path === "/api/config" && req.method === "PUT") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        return json(await handleConfigUpdate(ctx, body));
      }
      if (path === "/api/config/features" && req.method === "GET") {
        return json(await getFeatureGatesJSON(ctx));
      }
      if (req.method === "PATCH") {
        const featureToggleMatch = path.match(/^\/api\/config\/features\/([^/]+)$/);
        if (featureToggleMatch) {
          const name = decodeURIComponent(featureToggleMatch[1]);
          const body = await req.json().catch(() => null);
          if (!body) return json({ error: "Invalid JSON body" }, 400);
          return json(await handleFeatureToggle(ctx, name, body.enabled));
        }
      }

      // --- Webhooks API ---
      if (path === "/api/webhooks/events" && req.method === "GET") {
        return json(getWebhookEventsJSON(ctx));
      }
      if (path === "/api/webhooks/subscriptions" && req.method === "GET") {
        return json(getWebhookSubscriptionsJSON(ctx));
      }
      if (path === "/api/webhooks/subscriptions" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        return json(await handleSubscriptionCreate(ctx, body));
      }
      if (req.method === "DELETE") {
        const webhookSubDeleteMatch = path.match(/^\/api\/webhooks\/subscriptions\/([^/]+)$/);
        if (webhookSubDeleteMatch) {
          return json(await handleSubscriptionDelete(ctx, decodeURIComponent(webhookSubDeleteMatch[1])));
        }
      }
      if (path === "/api/webhooks/status" && req.method === "GET") {
        return json(getWebhookStatusJSON(ctx));
      }

      // --- Channels API ---
      if (path === "/api/channels" && req.method === "GET") {
        return json(getChannelsJSON(ctx));
      }
      if (path === "/api/channels" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        return json(await handleChannelRegister(ctx, body));
      }
      if (req.method === "DELETE") {
        const channelDeleteMatch = path.match(/^\/api\/channels\/([^/]+)$/);
        if (channelDeleteMatch) {
          return json(await handleChannelDelete(ctx, decodeURIComponent(channelDeleteMatch[1])));
        }
      }
      if (req.method === "GET") {
        const channelPermsMatch = path.match(/^\/api\/channels\/([^/]+)\/permissions$/);
        if (channelPermsMatch) {
          return json(getChannelPermissionsJSON(ctx, decodeURIComponent(channelPermsMatch[1])));
        }
        const channelQueueMatch = path.match(/^\/api\/channels\/([^/]+)\/queue$/);
        if (channelQueueMatch) {
          return json(getChannelQueueJSON(ctx, decodeURIComponent(channelQueueMatch[1])));
        }
      }

      // --- Notifications API ---
      if (path === "/api/notifications" && req.method === "GET") {
        return json(getNotificationsJSON(ctx));
      }
      if (path === "/api/notifications/test" && req.method === "POST") {
        return json(await handleTestNotification(ctx));
      }
      if (path === "/api/notifications/rules" && req.method === "PATCH") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        return json(await handleNotificationRulesUpdate(ctx, body));
      }

      // --- Agents API ---
      if (path === "/api/agents/current" && req.method === "GET") {
        return json(getCurrentAgentJSON(ctx));
      }
      if (path === "/api/agents/current" && req.method === "PATCH") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        return json(await handleAgentSwitch(ctx, body));
      }
      if (path === "/api/agents" && req.method === "GET") {
        return json(await getAgentsJSON(ctx));
      }

      // --- Health API ---
      if (path === "/api/health" && req.method === "GET") {
        return json(getHealthJSON(ctx));
      }

      // --- A2A API ---
      if (path === "/api/a2a/status" && req.method === "GET") {
        return json(getA2AStatusJSON(ctx));
      }
      if (path === "/api/a2a/skills" && req.method === "GET") {
        return json(getA2ASkillsJSON(ctx));
      }
      if (path === "/api/a2a/history" && req.method === "GET") {
        return json(getA2AHistoryJSON(ctx));
      }

      // --- Plugin Manifest Endpoint ---
      if (path === "/api/plugins" && req.method === "GET") {
        const allPlugins = [
          ...corePlugins.map((p) => ({ ...p, source: "core" as const })),
          ...userPlugins.map((p) => ({ ...p, source: "user" as const })),
        ];
        const metadata = allPlugins
          .map(({ id, label, icon, slot, order, source, sseEvents, queryKeys }) => ({
            id,
            label,
            icon,
            slot,
            order,
            source,
            sseEvents: sseEvents ?? [],
            queryKeys: queryKeys ?? [],
            hasApiRoutes: pluginApiRoutes.has(id),
          }))
          .sort((a, b) => a.order - b.order);
        return json(metadata);
      }

      // --- User Plugin API Routes ---
      if (path.startsWith("/api/plugins/")) {
        const segments = path.split("/");
        const pluginId = segments[3];
        const pluginPath = "/" + segments.slice(4).join("/");
        const routes = pluginApiRoutes.get(pluginId);
        if (routes) {
          const route = routes.find(
            (r) => r.path === pluginPath && r.method === req.method,
          );
          if (route) {
            try {
              return await route.handler(req);
            } catch {
              return json({ error: "Plugin error" }, 500);
            }
          }
        }
        return json({ error: "Not found" }, 404);
      }

      // --- Static Files (legacy HTMX dashboard) ---
      if (path === "/dash" || path === "/dash/") {
        return serveStatic("index.html");
      }
      if (path.startsWith("/dash/")) {
        const subPath = path.slice("/dash/".length);
        return serveStatic(subPath);
      }

      // --- TanStack Start v2 dashboard ---
      // Serve static assets from the client build
      if (path.startsWith("/assets/")) {
        const v2ClientDir = join(V2_DIST_DIR, "client");
        const assetPath = join(v2ClientDir, path);

        // Security: prevent directory traversal
        if (!assetPath.startsWith(v2ClientDir)) {
          return new Response("Forbidden", { status: 403 });
        }

        const file = Bun.file(assetPath);
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "Content-Type": getMime(assetPath),
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          });
        }
      }

      // Try TanStack Start handler for all other routes
      const handler = await loadStartHandler();
      if (handler) {
        return handler.fetch(req);
      }

      // Fallback: redirect root to legacy dashboard
      if (path === "/") {
        return Response.redirect("/dash", 302);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}
