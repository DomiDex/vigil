import { getVigilContext } from "./vigil-context";
import { getOverviewJSON } from "../../../src/dashboard/api/overview";
import { getReposJSON, getRepoDetailJSON } from "../../../src/dashboard/api/repos";
import { getTimelineJSON } from "../../../src/dashboard/api/timeline";
import {
  getDreamsJSON,
  getDreamPatternsJSON,
  handleDreamTrigger,
} from "../../../src/dashboard/api/dreams";
import {
  getTasksJSON,
  handleTaskCreate,
  handleTaskActivate,
  handleTaskComplete,
  handleTaskFail,
  handleTaskUpdate,
  handleTaskCancel,
} from "../../../src/dashboard/api/tasks";
import {
  getActionsJSON,
  getActionsPendingJSON,
  handleApprove,
  handleReject,
} from "../../../src/dashboard/api/actions";
import {
  getMemoryJSON,
  getMemorySearchJSON,
  handleAsk,
} from "../../../src/dashboard/api/memory";
import { getMetricsJSON } from "../../../src/dashboard/api/metrics";
import {
  getSchedulerJSON,
  handleSchedulerCreate,
  handleSchedulerDelete,
  handleSchedulerTrigger,
} from "../../../src/dashboard/api/scheduler";

// --- Reads (13 functions) ---

export async function getOverview() {
  const ctx = getVigilContext();
  return getOverviewJSON(ctx);
}

export async function getRepos() {
  const ctx = getVigilContext();
  return getReposJSON(ctx);
}

export async function getRepoDetail({ data }: { data: { name: string } }) {
  const ctx = getVigilContext();
  return getRepoDetailJSON(ctx, data.name);
}

export async function getTimeline({
  data,
}: {
  data: { status?: string; repo?: string; q?: string; page?: number };
}) {
  const ctx = getVigilContext();
  const url = new URL("http://localhost/api/timeline");
  if (data.status) url.searchParams.set("status", data.status);
  if (data.repo) url.searchParams.set("repo", data.repo);
  if (data.q) url.searchParams.set("q", data.q);
  if (data.page) url.searchParams.set("page", String(data.page));
  return getTimelineJSON(ctx, url);
}

export async function getDreams() {
  const ctx = getVigilContext();
  return getDreamsJSON(ctx);
}

export async function getDreamPatterns({ data }: { data: { repo: string } }) {
  const ctx = getVigilContext();
  return getDreamPatternsJSON(ctx, data.repo);
}

export async function getTasks({
  data,
}: {
  data: { status?: string; repo?: string };
}) {
  const ctx = getVigilContext();
  return getTasksJSON(ctx, data);
}

export async function getActions({
  data,
}: {
  data: { status?: string };
}) {
  const ctx = getVigilContext();
  return getActionsJSON(ctx, data);
}

export async function getActionsPending() {
  const ctx = getVigilContext();
  return getActionsPendingJSON(ctx);
}

export async function getMemory() {
  const ctx = getVigilContext();
  return getMemoryJSON(ctx);
}

export async function searchMemory({
  data,
}: {
  data: { query: string; repo?: string };
}) {
  const ctx = getVigilContext();
  return getMemorySearchJSON(ctx, data.query, data.repo);
}

export async function getMetrics() {
  const ctx = getVigilContext();
  return getMetricsJSON(ctx);
}

export async function getScheduler() {
  const ctx = getVigilContext();
  return getSchedulerJSON(ctx);
}

// --- Mutations (13 functions) ---

export async function triggerDream({ data }: { data: { repo?: string } }) {
  const ctx = getVigilContext();
  await handleDreamTrigger(ctx, data.repo);
  return { success: true };
}

export async function createTask({
  data,
}: {
  data: { title: string; description?: string; repo?: string };
}) {
  const ctx = getVigilContext();
  const formData = new FormData();
  formData.set("title", data.title);
  if (data.description) formData.set("description", data.description);
  if (data.repo) formData.set("repo", data.repo);
  handleTaskCreate(ctx, formData);
  return { success: true };
}

export async function activateTask({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  handleTaskActivate(ctx, data.id);
  return { success: true };
}

export async function completeTask({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  handleTaskComplete(ctx, data.id);
  return { success: true };
}

export async function failTask({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  handleTaskFail(ctx, data.id);
  return { success: true };
}

export async function updateTask({
  data,
}: {
  data: { id: string; title?: string; description?: string };
}) {
  const ctx = getVigilContext();
  const formData = new FormData();
  if (data.title) formData.set("title", data.title);
  if (data.description) formData.set("description", data.description);
  handleTaskUpdate(ctx, data.id, formData);
  return { success: true };
}

export async function cancelTask({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  handleTaskCancel(ctx, data.id);
  return { success: true };
}

export async function approveAction({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  await handleApprove(ctx, data.id);
  return { success: true };
}

export async function rejectAction({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  handleReject(ctx, data.id);
  return { success: true };
}

export async function askVigil({
  data,
}: {
  data: { question: string; repo?: string };
}) {
  const ctx = getVigilContext();
  await handleAsk(ctx, data.question, data.repo);
  return { success: true };
}

export async function createSchedule({
  data,
}: {
  data: { name: string; cron: string; action: string; repo?: string };
}) {
  const ctx = getVigilContext();
  const formData = new FormData();
  formData.set("name", data.name);
  formData.set("cron", data.cron);
  formData.set("action", data.action);
  if (data.repo) formData.set("repo", data.repo);
  await handleSchedulerCreate(ctx, formData);
  return { success: true };
}

export async function deleteSchedule({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  handleSchedulerDelete(ctx, data.id);
  return { success: true };
}

export async function triggerSchedule({ data }: { data: { id: string } }) {
  const ctx = getVigilContext();
  await handleSchedulerTrigger(ctx, data.id);
  return { success: true };
}
