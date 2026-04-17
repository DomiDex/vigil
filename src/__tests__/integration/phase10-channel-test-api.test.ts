// src/__tests__/integration/phase10-channel-test-api.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDashboard } from "../../dashboard/server";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;
let channelId: string;

beforeAll(async () => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const ctx = createFakeDashboardContext();
  channelId = ctx.daemon.channelManager.register({
    name: "test-channel",
    type: "webhook",
    config: { url: "https://example.com/hook" },
  });
  server = await startDashboard(ctx.daemon, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("Phase 10: channel test endpoint", () => {
  test("POST /api/channels/:id/test returns success shape", async () => {
    const res = await fetch(`${base}/api/channels/${channelId}/test`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toBeString();
    expect(data.channelId).toBe(channelId);
  });

  test("POST /api/channels/unknown/test returns 404", async () => {
    const res = await fetch(`${base}/api/channels/nonexistent_id/test`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("GET /api/channels/:id/test returns 404 or 405 (wrong method)", async () => {
    const res = await fetch(`${base}/api/channels/${channelId}/test`);
    expect(res.status).not.toBe(200);
  });

  test("existing GET /api/channels still works (regression)", async () => {
    const res = await fetch(`${base}/api/channels`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
