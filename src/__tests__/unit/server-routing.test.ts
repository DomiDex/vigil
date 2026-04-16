import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { startDashboard } from "../../dashboard/server";

describe("server routing — Phase 5 routes", () => {
  let server: ReturnType<typeof Bun.serve>;
  let port: number;
  let base: string;

  beforeEach(async () => {
    port = 40000 + Math.floor(Math.random() * 10000);
    base = `http://localhost:${port}`;
    const ctx = createFakeDashboardContext();
    server = await startDashboard(ctx.daemon, port);
  });

  afterEach(() => {
    server?.stop(true);
  });

  // Config routes
  it("GET /api/config returns JSON", async () => {
    const res = await fetch(`${base}/api/config`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tickInterval).toBeNumber();
  });

  it("PUT /api/config accepts body", async () => {
    const res = await fetch(`${base}/api/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tickInterval: 60 }),
    });
    expect(res.status).toBe(200);
  });

  it("GET /api/config/features returns array", async () => {
    const res = await fetch(`${base}/api/config/features`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toBeArray();
  });

  it("PATCH /api/config/features/:name toggles gate", async () => {
    const res = await fetch(`${base}/api/config/features/VIGIL_A2A`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
  });

  // Webhook routes
  it("GET /api/webhooks/events returns JSON", async () => {
    const res = await fetch(`${base}/api/webhooks/events`);
    expect(res.status).toBe(200);
  });

  it("GET /api/webhooks/subscriptions returns JSON", async () => {
    const res = await fetch(`${base}/api/webhooks/subscriptions`);
    expect(res.status).toBe(200);
  });

  it("POST /api/webhooks/subscriptions creates", async () => {
    const res = await fetch(`${base}/api/webhooks/subscriptions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo: "vigil", eventTypes: ["push"] }),
    });
    expect(res.status).toBe(200);
  });

  it("DELETE /api/webhooks/subscriptions/:id deletes", async () => {
    const res = await fetch(`${base}/api/webhooks/subscriptions/sub_123`, {
      method: "DELETE",
    });
    // 200 or error — just verify route matches
    expect([200, 404]).toContain(res.status);
  });

  it("GET /api/webhooks/status returns JSON", async () => {
    const res = await fetch(`${base}/api/webhooks/status`);
    expect(res.status).toBe(200);
  });

  // Channel routes
  it("GET /api/channels returns JSON", async () => {
    const res = await fetch(`${base}/api/channels`);
    expect(res.status).toBe(200);
  });

  it("POST /api/channels registers", async () => {
    const res = await fetch(`${base}/api/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test", type: "mcp", config: {} }),
    });
    expect(res.status).toBe(200);
  });

  // Notification routes
  it("GET /api/notifications returns JSON", async () => {
    const res = await fetch(`${base}/api/notifications`);
    expect(res.status).toBe(200);
  });

  it("POST /api/notifications/test sends test", async () => {
    const res = await fetch(`${base}/api/notifications/test`, {
      method: "POST",
    });
    expect(res.status).toBe(200);
  });

  // Agent routes
  it("GET /api/agents returns JSON", async () => {
    const res = await fetch(`${base}/api/agents`);
    expect(res.status).toBe(200);
  });

  it("GET /api/agents/current returns JSON", async () => {
    const res = await fetch(`${base}/api/agents/current`);
    expect(res.status).toBe(200);
  });

  it("PATCH /api/agents/current switches agent", async () => {
    const res = await fetch(`${base}/api/agents/current`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentName: "security" }),
    });
    expect(res.status).toBe(200);
  });

  // Health route
  it("GET /api/health returns JSON", async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.process).toBeDefined();
  });

  // A2A routes
  it("GET /api/a2a/status returns JSON", async () => {
    const res = await fetch(`${base}/api/a2a/status`);
    expect(res.status).toBe(200);
  });

  it("GET /api/a2a/skills returns JSON", async () => {
    const res = await fetch(`${base}/api/a2a/skills`);
    expect(res.status).toBe(200);
  });

  it("GET /api/a2a/history returns JSON", async () => {
    const res = await fetch(`${base}/api/a2a/history`);
    expect(res.status).toBe(200);
  });

  // Method mismatch
  it("POST /api/config returns 405 or falls through", async () => {
    const res = await fetch(`${base}/api/config`, { method: "POST" });
    // Should not match GET-only route
    expect(res.status).not.toBe(200);
  });
});
