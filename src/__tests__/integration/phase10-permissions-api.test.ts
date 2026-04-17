// src/__tests__/integration/phase10-permissions-api.test.ts
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
    name: "perm-channel",
    type: "mcp",
    config: {},
  });
  server = await startDashboard(ctx.daemon, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("Phase 10: channel permissions PATCH endpoint", () => {
  test("PATCH /api/channels/:id/permissions returns echoed permissions", async () => {
    const permissions = {
      read: true,
      write: true,
      execute: false,
      admin: false,
      subscribe: true,
    };
    const res = await fetch(`${base}/api/channels/${channelId}/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(permissions),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data.channelId).toBe(channelId);
    expect(data.read).toBe(true);
    expect(data.write).toBe(true);
    expect(data.execute).toBe(false);
    expect(data.admin).toBe(false);
    expect(data.subscribe).toBe(true);
  });

  test("PATCH validates all 5 boolean fields present", async () => {
    const incomplete = { read: true, write: false };
    const res = await fetch(`${base}/api/channels/${channelId}/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(incomplete),
    });
    expect(res.status).toBe(400);
  });

  test("PATCH rejects non-boolean field values", async () => {
    const invalid = {
      read: "yes",
      write: true,
      execute: false,
      admin: false,
      subscribe: true,
    };
    const res = await fetch(`${base}/api/channels/${channelId}/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(invalid),
    });
    expect(res.status).toBe(400);
  });

  test("PATCH rejects extra unknown fields", async () => {
    const extra = {
      read: true,
      write: true,
      execute: false,
      admin: false,
      subscribe: true,
      superAdmin: true,
    };
    const res = await fetch(`${base}/api/channels/${channelId}/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(extra),
    });
    // Should either strip unknown or reject -- either way, response should not include superAdmin
    if (res.status === 200) {
      const data = await res.json();
      expect(data.superAdmin).toBeUndefined();
    }
    // 400 is also acceptable
  });

  test("PATCH to unknown channel returns 404", async () => {
    const res = await fetch(`${base}/api/channels/nonexistent/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        read: true,
        write: true,
        execute: false,
        admin: false,
        subscribe: true,
      }),
    });
    expect(res.status).toBe(404);
  });

  test("GET to permissions path returns current permissions (regression)", async () => {
    const res = await fetch(`${base}/api/channels/${channelId}/permissions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(typeof data.read).toBe("boolean");
  });
});
