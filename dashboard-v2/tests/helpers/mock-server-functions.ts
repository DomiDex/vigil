import { mock } from "bun:test";

export function createMockServerFunctions() {
  return {
    createTask: mock(() => Promise.resolve({ ok: true })),
    createWebhookSubscription: mock(() => Promise.resolve({ ok: true })),
    createSchedule: mock(() => Promise.resolve({ ok: true })),
    getOverview: mock(() =>
      Promise.resolve({
        repos: [
          { name: "vigil", path: "/home/user/vigil", state: "active" },
          { name: "myapp", path: "/home/user/myapp", state: "sleeping" },
        ],
      }),
    ),
  };
}
