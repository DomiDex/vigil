import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startDashboard } from "../../dashboard/server.ts";
import { MessageRouter } from "../../messaging/index.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let baseUrl: string;

/** Minimal mock daemon with only the fields the dashboard accesses */
function createMockDaemon() {
  const messageRouter = new MessageRouter();

  return {
    config: {
      tickInterval: 30,
      sleepTickInterval: 300,
      tickModel: "claude-haiku-4-5-20251001",
      escalationModel: "claude-sonnet-4-6",
      sleepAfter: 900,
    },
    repoPaths: ["/home/user/projects/vigil", "/home/user/projects/other"],
    messageRouter,
    // Private fields accessed via bracket notation
    tickEngine: {
      currentTick: 42,
      isSleeping: false,
      paused: false,
      lastTickAt: Date.now() - 12_000,
      handlers: [],
      sleep: {
        getNextInterval: () => 24,
      },
      onTick(handler: any) {
        this.handlers.push(handler);
      },
    },
    session: {
      id: "e37c73e5-1234-5678-9abc-def012345678",
      startedAt: Date.now() - 15_120_000, // ~4h 12m ago
      tickCount: 42,
    },
  } as any;
}

beforeEach(() => {
  port = 40000 + Math.floor(Math.random() * 10000);
  baseUrl = `http://localhost:${port}`;
});

afterEach(() => {
  if (server) server.stop(true);
});

describe("dashboard static files", () => {
  test("GET /dash returns 200 with HTML", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/dash`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("VIGIL");
    expect(html).toContain("htmx.min.js");
  });

  test("GET /dash/ also works", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/dash/`);
    expect(res.status).toBe(200);
  });

  test("GET / redirects to /dash", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/`, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/dash");
  });

  test("GET /dash/styles.css returns CSS", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/dash/styles.css`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  test("GET /dash/vendor/htmx.min.js returns JS", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/dash/vendor/htmx.min.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("javascript");
  });

  test("GET /dash/nonexistent returns 404", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/dash/nonexistent.html`);
    expect(res.status).toBe(404);
  });

  test("directory traversal is blocked", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/dash/../../../etc/passwd`);
    // Blocked by either 403 (path check) or 404 (resolved path outside static dir)
    expect([403, 404]).toContain(res.status);
  });
});

describe("GET /api/overview", () => {
  test("returns valid JSON with all required fields", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data.repos).toBeArray();
    expect(data.repos).toHaveLength(2);
    expect(data.repoCount).toBe(2);
    expect(data.sessionId).toBe("e37c73e5");
    expect(data.state).toBe("awake");
    expect(data.tickCount).toBe(42);
    expect(data.tickInterval).toBe(30);
    expect(data.adaptiveInterval).toBe(24);
    expect(data.tickModel).toBe("claude-haiku-4-5-20251001");
    expect(data.escalationModel).toBe("claude-sonnet-4-6");
    expect(data.uptime).toContain("h");
    expect(data.uptimeSeconds).toBeGreaterThan(0);
    expect(data.nextTickIn).toBeGreaterThanOrEqual(0);
    expect(data.lastTickAt).toBeTruthy();
  });

  test("repos have name, path, state", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview`);
    const data = await res.json();

    expect(data.repos[0].name).toBe("vigil");
    expect(data.repos[0].path).toBe("/home/user/projects/vigil");
    expect(data.repos[0].state).toBe("active");
  });

  test("sleeping state is reflected", async () => {
    const daemon = createMockDaemon();
    daemon.tickEngine.isSleeping = true;
    // Make isSleeping a getter that returns true
    Object.defineProperty(daemon.tickEngine, "isSleeping", { value: true });
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview`);
    const data = await res.json();
    expect(data.state).toBe("sleeping");
  });
});

describe("GET /api/overview/fragment", () => {
  test("returns HTML partial with top bar", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview/fragment`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("top-bar");
    expect(html).toContain("VIGIL");
    expect(html).toContain("Tick #42");
    expect(html).toContain("Repos: 2");
    expect(html).toContain("Awake");
    expect(html).toContain("haiku-4-5");
    expect(html).toContain("e37c73e5");
  });

  test("contains no emojis", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/overview/fragment`);
    const html = await res.text();
    // Should use SVG icons, not emojis
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});

describe("SSE endpoint", () => {
  test("GET /api/sse returns event stream", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/sse`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    // Read the first chunk — should be the "connected" event
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);
    expect(text).toContain("event: connected");

    reader.cancel();
  });
});

describe("404 handling", () => {
  test("unknown API routes return 404", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/nonexistent`);
    expect(res.status).toBe(404);
  });
});
