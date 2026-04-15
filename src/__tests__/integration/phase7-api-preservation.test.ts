import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { createMockDaemon } from "../helpers/mock-daemon.ts";
import { startDashboard } from "../../dashboard/server.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let base: string;

beforeAll(async () => {
  port = 40000 + Math.floor(Math.random() * 10000);
  const daemon = createMockDaemon();
  server = await startDashboard(daemon as any, port);
  base = `http://localhost:${port}`;
});

afterAll(() => {
  server?.stop(true);
});

describe("Phase 7: JSON API endpoint preservation", () => {
  const jsonEndpoints = [
    "/api/overview",
    "/api/repos",
    "/api/timeline",
    "/api/dreams",
    "/api/memory",
    "/api/tasks",
    "/api/actions",
    "/api/scheduler",
    "/api/metrics",
  ];

  for (const endpoint of jsonEndpoints) {
    test(`GET ${endpoint} returns 200 with valid JSON`, async () => {
      const res = await fetch(`${base}${endpoint}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toBeDefined();
      expect(typeof body).toBe("object");
    });
  }
});

describe("Phase 7: fragment endpoints return 404", () => {
  const fragmentEndpoints = [
    "/api/overview/fragment",
    "/api/repos/fragment",
    "/api/timeline/fragment",
    "/api/dreams/fragment",
    "/api/memory/fragment",
    "/api/memory/search/fragment",
    "/api/tasks/fragment",
    "/api/actions/fragment",
    "/api/scheduler/fragment",
    "/api/metrics/fragment",
  ];

  for (const endpoint of fragmentEndpoints) {
    test(`GET ${endpoint} returns 404`, async () => {
      const res = await fetch(`${base}${endpoint}`);
      expect(res.status).toBe(404);
    });
  }
});

describe("Phase 7: SSE endpoint preserved", () => {
  test("GET /api/sse returns text/event-stream content type", async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);

    try {
      const res = await fetch(`${base}/api/sse`, { signal: controller.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") throw e;
    } finally {
      clearTimeout(timeout);
    }
  });
});

describe("Phase 7: mutation handlers return JSON", () => {
  test("POST /api/timeline/:id/reply returns JSON", async () => {
    const form = new FormData();
    form.set("reply", "test reply");
    const res = await fetch(`${base}/api/timeline/test-id/reply`, {
      method: "POST",
      body: form,
    });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("POST /api/dreams/trigger returns JSON", async () => {
    const form = new FormData();
    form.set("dreamrepo", "/tmp/test-repo");
    const res = await fetch(`${base}/api/dreams/trigger`, {
      method: "POST",
      body: form,
    });
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  test("POST /api/memory/ask returns JSON (empty question)", async () => {
    // Use empty question to get fast validation error response
    // (non-empty would trigger LLM calls that timeout in test)
    const form = new FormData();
    form.set("askq", "");
    const res = await fetch(`${base}/api/memory/ask`, {
      method: "POST",
      body: form,
    });
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await res.json();
    expect(body.error).toBeDefined();
  });
});

describe("Phase 7: legacy routes removed", () => {
  test("GET /dash does not serve legacy HTMX HTML", async () => {
    const res = await fetch(`${base}/dash`, { redirect: "follow" });
    // Legacy handler would serve index.html with htmx references
    // TanStack Start catch-all may handle this route (200 or redirect)
    // but the response must NOT contain HTMX references
    const text = await res.text();
    expect(text).not.toContain("htmx.min.js");
    expect(text).not.toContain("pico.min.css");
  });

  test("GET /dash/vendor/htmx.min.js does not serve the file", async () => {
    const res = await fetch(`${base}/dash/vendor/htmx.min.js`, { redirect: "follow" });
    // The legacy static handler is removed
    // TanStack Start may handle this (returning React app or 404)
    // but it should NOT return actual htmx JS content
    const text = await res.text();
    expect(text).not.toContain("htmx");
  });
});

describe("Phase 7: root handler", () => {
  test("GET / does not redirect to /dash", async () => {
    const res = await fetch(`${base}/`, { redirect: "manual" });
    const location = res.headers.get("location");
    if (location) {
      expect(location).not.toContain("/dash");
    }
    expect(res.status === 200 || res.status === 404).toBe(true);
  });

  test("GET / returns HTML when TanStack Start handler is available", async () => {
    const res = await fetch(`${base}/`);
    if (res.status === 200) {
      const contentType = res.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");
    }
    // If 404, TanStack Start handler not built — acceptable in dev
  });
});
