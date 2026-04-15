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

export async function getMetrics() {
  return api("/api/metrics");
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
