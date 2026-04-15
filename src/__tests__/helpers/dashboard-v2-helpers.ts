import { spyOn } from "bun:test";

/**
 * Creates a minimal fake DashboardContext for server function tests.
 * Does not need real EventLog/VectorStore -- server functions just pass
 * the context through to API handlers, which we spy on.
 */
export function createFakeDashboardContext() {
  return {
    config: {
      tickInterval: 30,
      blockingBudget: 120,
      sleepAfter: 900,
      sleepTickInterval: 300,
      dreamAfter: 1800,
      tickModel: "test-model",
      escalationModel: "test-model",
      maxEventWindow: 100,
      notifyBackends: ["file"] as string[],
      webhookUrl: "",
      desktopNotify: false,
      allowModerateActions: false,
    },
    repos: new Map(),
    eventLog: {} as any,
    vectorStore: {} as any,
    taskManager: {} as any,
    actionQueue: {} as any,
    scheduler: {} as any,
    memoryStats: {} as any,
  };
}

/**
 * Spies on getVigilContext to return the fake context.
 * Returns a restore function for afterEach cleanup.
 */
export async function mockVigilContext() {
  const ctx = createFakeDashboardContext();
  const mod = await import("../../../dashboard-v2/src/server/vigil-context.ts");
  const spy = spyOn(mod, "getVigilContext").mockReturnValue(ctx as any);
  return { ctx, spy, restore: () => spy.mockRestore() };
}

/**
 * List of all expected route stubs with their path and phase label.
 */
export const EXPECTED_ROUTES = [
  { file: "repos", path: "/repos", label: "Repos" },
  { file: "dreams", path: "/dreams", label: "Dreams" },
  { file: "tasks", path: "/tasks", label: "Tasks" },
  { file: "actions", path: "/actions", label: "Actions" },
  { file: "memory", path: "/memory", label: "Memory" },
  { file: "scheduler", path: "/scheduler", label: "Scheduler" },
  { file: "metrics", path: "/metrics", label: "Metrics" },
  { file: "config", path: "/config", label: "Config" },
  { file: "agents", path: "/agents", label: "Agents" },
  { file: "health", path: "/health", label: "Health" },
  { file: "webhooks", path: "/webhooks", label: "Webhooks" },
  { file: "channels", path: "/channels", label: "Channels" },
  { file: "notifications", path: "/notifications", label: "Notifications" },
  { file: "a2a", path: "/a2a", label: "A2A" },
] as const;
