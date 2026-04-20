import { corePlugins } from "../../dashboard-v2/src/plugins/index.ts";
import { setVigilContext } from "../../dashboard-v2/src/server/vigil-context.ts";
import type { Daemon } from "../core/daemon.ts";
import { getA2AHistoryJSON, getA2ASkillsJSON, getA2AStatusJSON } from "./api/a2a-status.ts";
import {
  getActionPreviewJSON,
  getActionsJSON,
  getActionsPendingJSON,
  handleApprove,
  handleReject,
} from "./api/actions.ts";
import { getAgentsJSON, getCurrentAgentJSON, handleAgentSwitch } from "./api/agents.ts";
import {
  getChannelPermissionsJSON,
  getChannelQueueJSON,
  getChannelsJSON,
  handleChannelDelete,
  handleChannelPermissionsUpdate,
  handleChannelRegister,
  handleChannelTest,
} from "./api/channels.ts";
import { getConfigJSON, getFeatureGatesJSON, handleConfigUpdate, handleFeatureToggle } from "./api/config.ts";
import { getDreamPatternsJSON, getDreamsJSON, handleDreamTrigger } from "./api/dreams.ts";
import { getHealthJSON, handlePrune, handleVacuum } from "./api/health.ts";
import {
  getMemoryJSON,
  getMemorySearchJSON,
  handleAsk,
  handleMemoryCreate,
  handleMemoryDelete,
  handleMemoryRelevance,
} from "./api/memory.ts";
import { getMetricsJSON } from "./api/metrics.ts";
import { getNotificationsJSON, handleNotificationRulesUpdate, handleTestNotification } from "./api/notifications.ts";
import { getOverviewJSON } from "./api/overview.ts";
import { addRepoJSON, getRepoDetailJSON, getReposJSON, removeRepoJSON } from "./api/repos.ts";
import { getRepoDiffJSON } from "./api/repos-diff.ts";
import {
  getSchedulerJSON,
  handleSchedulerCreate,
  handleSchedulerDelete,
  handleSchedulerTrigger,
} from "./api/scheduler.ts";
import {
  getFlakyTestsJSON,
  getSpecialistDetailJSON,
  getSpecialistFindingDetailJSON,
  getSpecialistFindingsJSON,
  getSpecialistsJSON,
  handleFindingCreateAction,
  handleFindingDismiss,
  handleFlakyTestReset,
  handleFlakyTestRun,
  handleSpecialistCreate,
  handleSpecialistDelete,
  handleSpecialistRun,
  handleSpecialistToggle,
  handleSpecialistUpdate,
} from "./api/specialists.ts";
import { SSEManager, wireSSE } from "./api/sse.ts";
import {
  getTasksJSON,
  handleTaskActivate,
  handleTaskCancel,
  handleTaskComplete,
  handleTaskCreate,
  handleTaskFail,
  handleTaskUpdate,
} from "./api/tasks.ts";
import { getTimelineJSON, handleReply } from "./api/timeline.ts";
import {
  getWebhookEventDetailJSON,
  getWebhookEventsJSON,
  getWebhookStatusJSON,
  getWebhookSubscriptionsJSON,
  handleSubscriptionCreate,
  handleSubscriptionDelete,
} from "./api/webhooks.ts";
import { getPluginApiRoutes, loadUserPlugins } from "./plugin-loader.ts";
import type { DashboardContext } from "./types.ts";

// TanStack Start handler (loaded lazily on first request)
let startHandler: { fetch: (req: Request) => Response | Promise<Response> } | null = null;
let startHandlerLoaded = false;

async function loadStartHandler(): Promise<typeof startHandler> {
  if (startHandlerLoaded) return startHandler;
  startHandlerLoaded = true;
  try {
    // @ts-expect-error — runtime dynamic import of build artifact, no .d.ts exists
    const mod = await import("../../dashboard-v2/dist/server/server.js");
    if (mod.default?.fetch) {
      startHandler = mod.default;
      console.log("[dashboard] TanStack Start handler loaded");
    }
  } catch (e: unknown) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
      console.log("[dashboard] TanStack Start handler not found — build dashboard-v2 first");
    } else {
      console.error("[dashboard] Failed to load TanStack Start handler:", e);
    }
  }
  return startHandler;
}

// Re-export from types.ts for backward compatibility
export type { DashboardContext } from "./types.ts";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function startDashboard(daemon: Daemon, port = 7480): Promise<ReturnType<typeof Bun.serve>> {
  const sse = new SSEManager();
  const ctx: DashboardContext = { daemon, sse };

  // Set context for TanStack Start server functions
  setVigilContext(ctx);

  // Wire SSE events from daemon
  wireSSE(sse, ctx);

  // Load user plugins from ~/.vigil/plugins/ — await before serving
  const userPlugins = await loadUserPlugins().catch((err) => {
    console.warn("[dashboard] Failed to load user plugins:", err);
    return [] as Awaited<ReturnType<typeof loadUserPlugins>>;
  });
  const pluginApiRoutes = getPluginApiRoutes();
  if (userPlugins.length > 0) {
    console.log(`[dashboard] Loaded ${userPlugins.length} user plugin(s): ${userPlugins.map((p) => p.id).join(", ")}`);
  }

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
      if (path === "/api/sse") {
        return sse.connect();
      }

      // --- Metrics API ---
      if (path === "/api/metrics" && req.method === "GET") {
        const fromParam = url.searchParams.get("from");
        const toParam = url.searchParams.get("to");
        const opts: { from?: number; to?: number } = {};
        if (fromParam) {
          const n = Number(fromParam);
          if (!Number.isNaN(n)) opts.from = n;
        }
        if (toParam) {
          const n = Number(toParam);
          if (!Number.isNaN(n)) opts.to = n;
        }
        return json(getMetricsJSON(ctx, Object.keys(opts).length > 0 ? opts : undefined));
      }

      // --- Repo API ---
      if (path === "/api/repos" && req.method === "GET") {
        return json(getReposJSON(ctx));
      }
      if (path === "/api/repos" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body?.path) return json({ error: "Missing 'path' in request body" }, 400);
        const result = await addRepoJSON(ctx, body.path);
        return json(result, result.success ? 200 : 400);
      }
      // Match /api/repos/:name/diff (must be before generic :name)
      const repoDiffMatch = path.match(/^\/api\/repos\/([^/]+)\/diff$/);
      if (repoDiffMatch && req.method === "GET") {
        const diff = await getRepoDiffJSON(ctx, decodeURIComponent(repoDiffMatch[1]));
        if (!diff) return json({ error: "Repo not found" }, 404);
        return json(diff);
      }
      // Match /api/repos/:name — GET (detail) or DELETE (remove)
      const repoNameMatch = path.match(/^\/api\/repos\/([^/]+)$/);
      if (repoNameMatch) {
        const name = decodeURIComponent(repoNameMatch[1]);
        if (req.method === "DELETE") {
          const result = removeRepoJSON(ctx, name);
          return json(result, result.success ? 200 : 404);
        }
        if (req.method === "GET") {
          const detail = await getRepoDetailJSON(ctx, name);
          if (!detail) return json({ error: "Repo not found" }, 404);
          return json(detail);
        }
      }

      // --- Timeline API ---
      if (path === "/api/timeline" && req.method === "GET") {
        return json(getTimelineJSON(ctx, url));
      }
      // Match /api/timeline/:id/reply
      const replyMatch = path.match(/^\/api\/timeline\/([^/]+)\/reply$/);
      if (replyMatch && req.method === "POST") {
        const id = replyMatch[1];
        const body = await req.formData().catch(() => null);
        const replyText = body?.get("reply")?.toString() || "";
        return json(handleReply(ctx, id, replyText));
      }

      // --- Memory API ---
      if (path === "/api/memory" && req.method === "GET") {
        return json(getMemoryJSON(ctx));
      }
      if (path === "/api/memory/search" && req.method === "GET") {
        const q = url.searchParams.get("memq") || "";
        const repo = url.searchParams.get("memrepo") || undefined;
        return json(getMemorySearchJSON(ctx, q, repo));
      }
      if (path === "/api/memory" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        if (!body) return json({ error: "Invalid form data" }, 400);
        const content = body.get("content")?.toString() || "";
        const repo = body.get("repo")?.toString() || undefined;
        const tagsRaw = body.get("tags")?.toString();
        const tags = tagsRaw
          ? tagsRaw
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined;
        const result = handleMemoryCreate(ctx, { content, repo, tags });
        return json(result, result.error ? 400 : 201);
      }
      if (path === "/api/memory/ask" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        const question = body?.get("askq")?.toString() || "";
        const repo = body?.get("askrepo")?.toString() || undefined;
        const result = await handleAsk(ctx, question, repo);
        return json(result);
      }
      // Match DELETE /api/memory/:id
      const memoryDeleteMatch = path.match(/^\/api\/memory\/([^/]+)$/);
      if (memoryDeleteMatch && req.method === "DELETE") {
        const result = handleMemoryDelete(ctx, decodeURIComponent(memoryDeleteMatch[1]));
        return json(result, result.success ? 200 : 404);
      }
      // Match PATCH /api/memory/:id
      const memoryPatchMatch = path.match(/^\/api\/memory\/([^/]+)$/);
      if (memoryPatchMatch && req.method === "PATCH") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        const result = handleMemoryRelevance(ctx, decodeURIComponent(memoryPatchMatch[1]), body);
        return json(result, result.success ? 200 : 400);
      }

      // --- Dreams API ---
      if (path === "/api/dreams" && req.method === "GET") {
        return json(getDreamsJSON(ctx));
      }
      if (path === "/api/dreams/trigger" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        const repo = body?.get("dreamrepo")?.toString() || undefined;
        const result = await handleDreamTrigger(ctx, repo);
        return json(result);
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
      if (path === "/api/tasks" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        if (!body) return json({ error: "Invalid form data" }, 400);
        const result = handleTaskCreate(ctx, body);
        return json(result, result.ok ? 200 : 400);
      }
      // Match POST /api/tasks/:id/activate
      const taskActivateMatch = path.match(/^\/api\/tasks\/([^/]+)\/activate$/);
      if (taskActivateMatch && req.method === "POST") {
        return json(handleTaskActivate(ctx, taskActivateMatch[1]));
      }
      // Match POST /api/tasks/:id/complete
      const taskCompleteMatch = path.match(/^\/api\/tasks\/([^/]+)\/complete$/);
      if (taskCompleteMatch && req.method === "POST") {
        return json(handleTaskComplete(ctx, taskCompleteMatch[1]));
      }
      // Match POST /api/tasks/:id/fail
      const taskFailMatch = path.match(/^\/api\/tasks\/([^/]+)\/fail$/);
      if (taskFailMatch && req.method === "POST") {
        return json(handleTaskFail(ctx, taskFailMatch[1]));
      }
      // Match PUT /api/tasks/:id (edit)
      const taskUpdateMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskUpdateMatch && req.method === "PUT") {
        const body = await req.formData();
        return json(handleTaskUpdate(ctx, taskUpdateMatch[1], body));
      }
      // Match DELETE /api/tasks/:id
      const taskDeleteMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
      if (taskDeleteMatch && req.method === "DELETE") {
        return json(handleTaskCancel(ctx, taskDeleteMatch[1]));
      }

      // --- Actions API ---
      if (path === "/api/actions" && req.method === "GET") {
        const status = url.searchParams.get("status") || undefined;
        return json(getActionsJSON(ctx, { status }));
      }
      if (path === "/api/actions/pending" && req.method === "GET") {
        return json(getActionsPendingJSON(ctx));
      }
      // Match GET /api/actions/:id/preview
      const actionPreviewMatch = path.match(/^\/api\/actions\/([^/]+)\/preview$/);
      if (actionPreviewMatch && req.method === "GET") {
        const preview = getActionPreviewJSON(ctx, decodeURIComponent(actionPreviewMatch[1]));
        if (!preview) return json({ error: "Action not found" }, 404);
        return json(preview);
      }
      // Match POST /api/actions/:id/approve
      const actionApproveMatch = path.match(/^\/api\/actions\/([^/]+)\/approve$/);
      if (actionApproveMatch && req.method === "POST") {
        const result = await handleApprove(ctx, actionApproveMatch[1]);
        return json(result);
      }
      // Match POST /api/actions/:id/reject
      const actionRejectMatch = path.match(/^\/api\/actions\/([^/]+)\/reject$/);
      if (actionRejectMatch && req.method === "POST") {
        return json(handleReject(ctx, actionRejectMatch[1]));
      }

      // --- Scheduler API ---
      if (path === "/api/scheduler" && req.method === "GET") {
        return json(getSchedulerJSON(ctx));
      }
      if (path === "/api/scheduler" && req.method === "POST") {
        const body = await req.formData().catch(() => null);
        if (!body) return json({ error: "Invalid form data" }, 400);
        const result = await handleSchedulerCreate(ctx, body);
        return json(result);
      }
      // Match DELETE /api/scheduler/:id
      const schedDeleteMatch = path.match(/^\/api\/scheduler\/([^/]+)$/);
      if (schedDeleteMatch && req.method === "DELETE") {
        return json(handleSchedulerDelete(ctx, schedDeleteMatch[1]));
      }
      // Match POST /api/scheduler/:id/trigger
      const schedTriggerMatch = path.match(/^\/api\/scheduler\/([^/]+)\/trigger$/);
      if (schedTriggerMatch && req.method === "POST") {
        const result = await handleSchedulerTrigger(ctx, schedTriggerMatch[1]);
        return json(result);
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
      // Match GET /api/webhooks/events/:id (must be before the list endpoint)
      const webhookEventDetailMatch = path.match(/^\/api\/webhooks\/events\/([^/]+)$/);
      if (webhookEventDetailMatch && req.method === "GET") {
        const detail = getWebhookEventDetailJSON(ctx, decodeURIComponent(webhookEventDetailMatch[1]));
        if (!detail) return json({ error: "Event not found" }, 404);
        return json(detail);
      }
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
      // Match POST /api/channels/:id/test
      const channelTestMatch = path.match(/^\/api\/channels\/([^/]+)\/test$/);
      if (channelTestMatch && req.method === "POST") {
        const result = handleChannelTest(ctx, decodeURIComponent(channelTestMatch[1]));
        if (!result) return json({ error: "Channel not found" }, 404);
        return json(result);
      }
      // Match PATCH /api/channels/:id/permissions
      const channelPermsPatchMatch = path.match(/^\/api\/channels\/([^/]+)\/permissions$/);
      if (channelPermsPatchMatch && req.method === "PATCH") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        const result = handleChannelPermissionsUpdate(ctx, decodeURIComponent(channelPermsPatchMatch[1]), body);
        if (!result) return json({ error: "Channel not found" }, 404);
        if (result.error) return json(result, 400);
        return json(result);
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

      // --- Specialists API ---
      // IMPORTANT: Specific paths must be checked before parameterized /:name catch-all

      // Findings sub-routes (before /:name)
      const findingDismissMatch = path.match(/^\/api\/specialists\/findings\/([^/]+)\/dismiss$/);
      if (findingDismissMatch && req.method === "POST") {
        const body = await req.json().catch(() => null);
        const result = handleFindingDismiss(ctx, decodeURIComponent(findingDismissMatch[1]), body);
        return json(result, result.error ? 404 : 200);
      }
      const findingActionMatch = path.match(/^\/api\/specialists\/findings\/([^/]+)\/action$/);
      if (findingActionMatch && req.method === "POST") {
        const body = await req.json().catch(() => null);
        const result = await handleFindingCreateAction(ctx, decodeURIComponent(findingActionMatch[1]), body);
        if (!result.error) return json(result);
        const status = result.error === "Finding not found" ? 404 : 400;
        return json(result, status);
      }
      const findingDetailMatch = path.match(/^\/api\/specialists\/findings\/([^/]+)$/);
      if (findingDetailMatch && req.method === "GET") {
        const detail = getSpecialistFindingDetailJSON(ctx, decodeURIComponent(findingDetailMatch[1]));
        if (!detail) return json({ error: "Finding not found" }, 404);
        return json(detail);
      }
      if (path === "/api/specialists/findings" && req.method === "GET") {
        return json(getSpecialistFindingsJSON(ctx, url));
      }

      // Flaky test sub-routes (before /:name)
      if (path === "/api/specialists/flaky/run" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        const result = await handleFlakyTestRun(ctx, body);
        return json(result, result.error ? 400 : 200);
      }
      const flakyResetMatch = path.match(/^\/api\/specialists\/flaky\/([^/]+)$/);
      if (flakyResetMatch && req.method === "DELETE") {
        const repo = url.searchParams.get("repo") || undefined;
        const result = handleFlakyTestReset(ctx, decodeURIComponent(flakyResetMatch[1]), repo);
        if (result.error === "Flaky test not found") return json(result, 404);
        return json(result, result.error ? 400 : 200);
      }
      if (path === "/api/specialists/flaky" && req.method === "GET") {
        return json(getFlakyTestsJSON(ctx, url));
      }

      // Parameterized /:name sub-routes
      const specialistToggleMatch = path.match(/^\/api\/specialists\/([^/]+)\/toggle$/);
      if (specialistToggleMatch && req.method === "POST") {
        const body = await req.json().catch(() => null);
        const result = handleSpecialistToggle(ctx, decodeURIComponent(specialistToggleMatch[1]), body);
        if (!result) return json({ error: "Specialist not found" }, 404);
        return json(result);
      }
      const specialistRunMatch = path.match(/^\/api\/specialists\/([^/]+)\/run$/);
      if (specialistRunMatch && req.method === "POST") {
        const body = await req.json().catch(() => null);
        const result = await handleSpecialistRun(ctx, decodeURIComponent(specialistRunMatch[1]), body);
        if (!result) return json({ error: "Specialist not found" }, 404);
        return json(result, (result as { error?: string }).error ? 400 : 200);
      }

      // /:name catch-all (GET detail, PUT update, DELETE remove)
      const specialistNameMatch = path.match(/^\/api\/specialists\/([^/]+)$/);
      if (specialistNameMatch) {
        const name = decodeURIComponent(specialistNameMatch[1]);
        if (req.method === "GET") {
          const detail = getSpecialistDetailJSON(ctx, name);
          if (!detail) return json({ error: "Specialist not found" }, 404);
          return json(detail);
        }
        if (req.method === "PUT") {
          const body = await req.json().catch(() => null);
          if (!body) return json({ error: "Invalid JSON body" }, 400);
          const result = handleSpecialistUpdate(ctx, name, body);
          if (!result) return json({ error: "Specialist not found" }, 404);
          return json(result, result.error ? 400 : 200);
        }
        if (req.method === "DELETE") {
          const result = handleSpecialistDelete(ctx, name);
          return json(result, result.error ? 400 : 200);
        }
      }

      // Collection root (GET list, POST create)
      if (path === "/api/specialists" && req.method === "GET") {
        return json(getSpecialistsJSON(ctx));
      }
      if (path === "/api/specialists" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ error: "Invalid JSON body" }, 400);
        const result = handleSpecialistCreate(ctx, body);
        return json(result, result.error ? 400 : 200);
      }

      // --- Health API ---
      if (path === "/api/health" && req.method === "GET") {
        return json(getHealthJSON(ctx));
      }
      if (path === "/api/health/vacuum" && req.method === "POST") {
        return json(handleVacuum(ctx));
      }
      if (path === "/api/health/prune" && req.method === "POST") {
        const body = await req.json().catch(() => null);
        if (!body) return json({ success: false, error: "Invalid JSON body", deletedCount: 0 }, 400);
        const result = handlePrune(ctx, body);
        return json(result, result.success ? 200 : 400);
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
        const pluginPath = `/${segments.slice(4).join("/")}`;
        const routes = pluginApiRoutes.get(pluginId);
        if (routes) {
          const route = routes.find((r) => r.path === pluginPath && r.method === req.method);
          if (route) {
            try {
              return await route.handler(req);
            } catch (err) {
              console.error(`[plugins] Route handler error in ${pluginId}:`, err);
              return json({ error: "Plugin error" }, 500);
            }
          }
        }
        return json({ error: "Not found" }, 404);
      }

      // --- Serve static assets from TanStack Start build ---
      if (path.startsWith("/assets/")) {
        const filePath = `${import.meta.dirname}/../../dashboard-v2/dist/client${path}`;
        const file = Bun.file(filePath);
        if (await file.exists()) {
          return new Response(file);
        }
        return new Response("Not found", { status: 404 });
      }

      // --- TanStack Start handler for all non-API routes ---
      const handler = await loadStartHandler();
      if (handler) {
        return handler.fetch(req);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  return server;
}
