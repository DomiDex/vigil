// Client-safe data functions that fetch from Vigil's /api/* JSON endpoints.
// These run in the browser (via useQuery/useMutation) and do NOT depend on
// server-only getVigilContext(). The Bun.serve() at port 7480 handles both
// the dashboard and the API routes.

const BASE = typeof window !== "undefined" ? "" : "http://localhost:7480";

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return res.json();
}

async function apiMutate(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new Error(`API ${path}: ${res.status}`);
  return { success: true };
}

// --- Reads ---

export async function getOverview() {
  return api("/api/overview");
}

export async function getRepos() {
  return api("/api/repos");
}

export async function getRepoDetail({ data }: { data: { name: string } }) {
  return api(`/api/repos/${encodeURIComponent(data.name)}`);
}

export async function getRepoDiff({ data }: { data: { name: string } }) {
  return api(`/api/repos/${encodeURIComponent(data.name)}/diff`);
}

export async function addRepo({ data }: { data: { path: string } }) {
  const res = await fetch(`${BASE}/api/repos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json();
  if (!res.ok || !body.success) {
    throw new Error(body.error ?? `API /api/repos: ${res.status}`);
  }
  return body;
}

export async function removeRepo({ data }: { data: { name: string } }) {
  return apiMutate(`/api/repos/${encodeURIComponent(data.name)}`, { method: "DELETE" });
}

export async function getTimeline({
  data,
}: {
  data: { status?: string; repo?: string; q?: string; page?: number };
}) {
  const params = new URLSearchParams();
  if (data.status) params.set("status", data.status);
  if (data.repo) params.set("repo", data.repo);
  if (data.q) params.set("q", data.q);
  if (data.page) params.set("page", String(data.page));
  const qs = params.toString();
  return api(`/api/timeline${qs ? `?${qs}` : ""}`);
}

export async function getDreams() {
  return api("/api/dreams");
}

export async function getDreamPatterns({ data }: { data: { repo: string } }) {
  return api(`/api/dreams/patterns/${encodeURIComponent(data.repo)}`);
}

export async function getTasks({
  data,
}: {
  data: { status?: string; repo?: string };
}) {
  const params = new URLSearchParams();
  if (data.status) params.set("status", data.status);
  if (data.repo) params.set("repo", data.repo);
  const qs = params.toString();
  return api(`/api/tasks${qs ? `?${qs}` : ""}`);
}

export async function getActions({
  data,
}: {
  data: { status?: string };
}) {
  const params = new URLSearchParams();
  if (data.status) params.set("status", data.status);
  const qs = params.toString();
  return api(`/api/actions${qs ? `?${qs}` : ""}`);
}

export async function getActionPreview({ data }: { data: { id: string } }): Promise<import("../types/api").ActionPreview> {
  return api(`/api/actions/${encodeURIComponent(data.id)}/preview`);
}

export async function getActionsPending() {
  return api("/api/actions/pending");
}

export async function getMemory() {
  return api("/api/memory");
}

export async function searchMemory({
  data,
}: {
  data: { query: string; repo?: string };
}) {
  const params = new URLSearchParams();
  params.set("memq", data.query);
  if (data.repo) params.set("memrepo", data.repo);
  return api(`/api/memory/search?${params.toString()}`);
}

export async function createMemory({ data }: { data: FormData }) {
  return apiMutate("/api/memory", { method: "POST", body: data });
}

export async function deleteMemory({ id }: { id: number | string }) {
  return apiMutate(`/api/memory/${id}`, { method: "DELETE" });
}

export async function updateMemoryRelevance({
  id,
  data,
}: {
  id: number | string;
  data: { relevant: boolean };
}) {
  return api(`/api/memory/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getMetrics({ from, to }: { from?: number; to?: number } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", String(from));
  if (to) params.set("to", String(to));
  const qs = params.toString();
  return api(`/api/metrics${qs ? `?${qs}` : ""}`);
}

export async function getScheduler() {
  return api("/api/scheduler");
}

// --- Mutations ---

export async function triggerDream({ data }: { data: { repo?: string } }) {
  const body = new FormData();
  if (data.repo) body.set("dreamrepo", data.repo);
  return apiMutate("/api/dreams/trigger", { method: "POST", body });
}

export async function createTask({
  data,
}: {
  data: { title: string; description?: string; repo?: string };
}) {
  const body = new FormData();
  body.set("title", data.title);
  if (data.description) body.set("description", data.description);
  if (data.repo) body.set("repo", data.repo);
  return apiMutate("/api/tasks", { method: "POST", body });
}

export async function activateTask({ data }: { data: { id: string } }) {
  return apiMutate(`/api/tasks/${encodeURIComponent(data.id)}/activate`, {
    method: "POST",
  });
}

export async function completeTask({ data }: { data: { id: string } }) {
  return apiMutate(`/api/tasks/${encodeURIComponent(data.id)}/complete`, {
    method: "POST",
  });
}

export async function failTask({ data }: { data: { id: string } }) {
  return apiMutate(`/api/tasks/${encodeURIComponent(data.id)}/fail`, {
    method: "POST",
  });
}

export async function updateTask({
  data,
}: {
  data: { id: string; title?: string; description?: string };
}) {
  const body = new FormData();
  if (data.title) body.set("title", data.title);
  if (data.description) body.set("description", data.description);
  return apiMutate(`/api/tasks/${encodeURIComponent(data.id)}`, {
    method: "PUT",
    body,
  });
}

export async function cancelTask({ data }: { data: { id: string } }) {
  return apiMutate(`/api/tasks/${encodeURIComponent(data.id)}`, {
    method: "DELETE",
  });
}

export async function approveAction({ data }: { data: { id: string } }) {
  return apiMutate(`/api/actions/${encodeURIComponent(data.id)}/approve`, {
    method: "POST",
  });
}

export async function rejectAction({ data }: { data: { id: string } }) {
  return apiMutate(`/api/actions/${encodeURIComponent(data.id)}/reject`, {
    method: "POST",
  });
}

export async function askVigil({
  data,
}: {
  data: { question: string; repo?: string };
}) {
  const body = new FormData();
  body.set("askq", data.question);
  if (data.repo) body.set("askrepo", data.repo);
  return apiMutate("/api/memory/ask", { method: "POST", body });
}

export async function createSchedule({
  data,
}: {
  data: { name: string; cron: string; action: string; repo?: string };
}) {
  const body = new FormData();
  body.set("name", data.name);
  body.set("cron", data.cron);
  body.set("action", data.action);
  if (data.repo) body.set("repo", data.repo);
  return apiMutate("/api/scheduler", { method: "POST", body });
}

export async function deleteSchedule({ data }: { data: { id: string } }) {
  return apiMutate(`/api/scheduler/${encodeURIComponent(data.id)}`, {
    method: "DELETE",
  });
}

export async function triggerSchedule({ data }: { data: { id: string } }) {
  return apiMutate(`/api/scheduler/${encodeURIComponent(data.id)}/trigger`, {
    method: "POST",
  });
}

// --- Config ---

export async function getConfig() {
  return api("/api/config");
}

export async function updateConfig({ data }: { data: Record<string, any> }) {
  return api("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function getFeatureGates() {
  return api("/api/config/features");
}

export async function toggleFeatureGate({
  data,
}: {
  data: { name: string; enabled: boolean };
}) {
  return api(`/api/config/features/${encodeURIComponent(data.name)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled: data.enabled }),
  });
}

// --- Webhooks ---

export async function getWebhookEvents() {
  return api("/api/webhooks/events");
}

export async function getWebhookSubscriptions() {
  return api("/api/webhooks/subscriptions");
}

export async function createWebhookSubscription({
  data,
}: {
  data: { repo: string; eventTypes: string[]; expiry?: number };
}) {
  return api("/api/webhooks/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteWebhookSubscription({
  data,
}: {
  data: { id: string };
}) {
  return apiMutate(
    `/api/webhooks/subscriptions/${encodeURIComponent(data.id)}`,
    { method: "DELETE" },
  );
}

export async function getWebhookStatus() {
  return api("/api/webhooks/status");
}

// --- Channels ---

export async function getChannels() {
  return api("/api/channels");
}

export async function registerChannel({
  data,
}: {
  data: { name: string; type: string; config?: Record<string, any> };
}) {
  return api("/api/channels", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteChannel({ data }: { data: { id: string } }) {
  return apiMutate(`/api/channels/${encodeURIComponent(data.id)}`, {
    method: "DELETE",
  });
}

export async function getChannelPermissions({
  data,
}: {
  data: { id: string };
}) {
  return api(
    `/api/channels/${encodeURIComponent(data.id)}/permissions`,
  );
}

export async function getChannelQueue({ data }: { data: { id: string } }) {
  return api(`/api/channels/${encodeURIComponent(data.id)}/queue`);
}

// --- Notifications ---

export async function getNotifications() {
  return api("/api/notifications");
}

export async function testNotification() {
  return api("/api/notifications/test", { method: "POST" });
}

export async function updateNotificationRules({
  data,
}: {
  data: Record<string, any>;
}) {
  return api("/api/notifications/rules", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- Agents ---

export async function getAgents() {
  return api("/api/agents");
}

export async function getCurrentAgent() {
  return api("/api/agents/current");
}

export async function switchAgent({
  data,
}: {
  data: { agentName: string };
}) {
  return api("/api/agents/current", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- Health ---

export async function getHealth() {
  return api("/api/health");
}

export async function vacuumDatabase() {
  return api("/api/health/vacuum", { method: "POST" });
}

export async function pruneEvents({ data }: { data: { olderThanDays: number } }) {
  return api("/api/health/prune", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// --- A2A ---

export async function getA2AStatus() {
  return api("/api/a2a/status");
}

export async function getA2ASkills() {
  return api("/api/a2a/skills");
}

export async function getA2AHistory() {
  return api("/api/a2a/history");
}
