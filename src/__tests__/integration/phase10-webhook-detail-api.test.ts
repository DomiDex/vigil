// src/__tests__/integration/phase10-webhook-detail-api.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { startDashboard } from "../../dashboard/server";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;

beforeAll(async () => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const ctx = createFakeDashboardContext();
  server = await startDashboard(ctx.daemon, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("Phase 10: webhook event detail endpoint", () => {
  test("GET /api/webhooks/events/:id returns event with payload field", async () => {
    const res = await fetch(`${base}/api/webhooks/events/evt_001`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data.id).toBe("evt_001");
    expect(data.payload).toBeDefined();
    expect(typeof data.payload).toBe("object");
  });

  test("event detail includes repo and eventType", async () => {
    const res = await fetch(`${base}/api/webhooks/events/evt_001`);
    const data = await res.json();
    expect(data.repo).toBeString();
    expect(data.eventType).toBeString();
  });

  test("event detail includes optional headers and processingTime", async () => {
    const res = await fetch(`${base}/api/webhooks/events/evt_001`);
    const data = await res.json();
    if (data.headers) {
      expect(typeof data.headers).toBe("object");
    }
    if (data.processingTime !== undefined) {
      expect(data.processingTime).toBeNumber();
    }
  });

  test("GET /api/webhooks/events/unknown returns 404", async () => {
    const res = await fetch(`${base}/api/webhooks/events/nonexistent_id`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("existing GET /api/webhooks/events still works (regression)", async () => {
    const res = await fetch(`${base}/api/webhooks/events`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeArray();
  });
});
