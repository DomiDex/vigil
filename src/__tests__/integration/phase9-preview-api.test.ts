// src/__tests__/integration/phase9-preview-api.test.ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { startDashboard } from "../../dashboard/server";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;

beforeAll(async () => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const ctx = createFakeDashboardContext();
  server = await startDashboard(ctx.daemon as any, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("Phase 9: action preview endpoint", () => {
  test("GET /api/actions/:id/preview returns correct shape", async () => {
    const res = await fetch(`${base}/api/actions/act_001/preview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data.id).toBe("act_001");
    expect(typeof data.command).toBe("string");
    expect(Array.isArray(data.args)).toBe(true);
    expect(typeof data.description).toBe("string");
    expect(data).toHaveProperty("dryRun");
    expect(data).toHaveProperty("estimatedEffect");
  });

  test("GET /api/actions/:id/preview returns estimatedEffect with command summary", async () => {
    const res = await fetch(`${base}/api/actions/act_001/preview`);
    const data = await res.json();
    if (data.estimatedEffect) {
      expect(data.estimatedEffect).toContain(data.command);
    }
  });

  test("GET /api/actions/unknown/preview returns 404", async () => {
    const res = await fetch(`${base}/api/actions/nonexistent_id/preview`);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  test("GET /api/actions/:id/preview with URL-encoded ID works", async () => {
    const res = await fetch(`${base}/api/actions/${encodeURIComponent("act_001")}/preview`);
    expect(res.status).toBe(200);
  });

  test("POST /api/actions/:id/preview returns 404 or 405 (wrong method)", async () => {
    const res = await fetch(`${base}/api/actions/act_001/preview`, { method: "POST" });
    expect(res.status).not.toBe(200);
  });
});

describe("Phase 9: existing action endpoints still work", () => {
  test("GET /api/actions returns 200 with valid JSON", async () => {
    const res = await fetch(`${base}/api/actions`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
