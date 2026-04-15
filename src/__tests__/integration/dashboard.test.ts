import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { startDashboard } from "../../dashboard/server.ts";
import { createMessage, MessageRouter, type VigilMessage } from "../../messaging/index.ts";
import { createMockDaemon } from "../helpers/mock-daemon.ts";

let server: ReturnType<typeof Bun.serve>;
let port: number;
let baseUrl: string;

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

// ── Phase 2: Timeline Feed ──────────────────────

function seedMessages(daemon: any, count = 5) {
  const decisions = ["SILENT", "OBSERVE", "NOTIFY", "ACT"];
  const messages: VigilMessage[] = [];
  for (let i = 0; i < count; i++) {
    const decision = decisions[i % decisions.length];
    const msg = createMessage({
      source: { repo: i % 2 === 0 ? "vigil" : "other-repo", branch: "main", event: "tick" },
      status: decision === "ACT" ? "alert" : decision === "NOTIFY" ? "proactive" : "normal",
      severity: decision === "ACT" ? "critical" : decision === "NOTIFY" ? "warning" : "info",
      message: `Test message ${i}: ${decision} decision content`,
      metadata: { tickNum: i + 1, decision, confidence: 0.8 + i * 0.02 },
    });
    messages.push(msg);
  }
  // Route all messages through the router to populate history
  for (const msg of messages) {
    daemon.messageRouter.route(msg);
  }
  return messages;
}

describe("GET /api/timeline", () => {
  test("returns JSON with messages array", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 3);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();
    expect(data.messages).toBeArray();
    expect(data.messages).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(data.hasMore).toBe(false);
  });

  test("messages sorted by timestamp descending", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 3);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline`);
    const data = await res.json();

    for (let i = 1; i < data.messages.length; i++) {
      const prev = new Date(data.messages[i - 1].timestamp).getTime();
      const curr = new Date(data.messages[i].timestamp).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  test("filters by decision type", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 8);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline?decision=OBSERVE`);
    const data = await res.json();

    expect(data.messages.length).toBeGreaterThan(0);
    for (const msg of data.messages) {
      expect(msg.decision).toBe("OBSERVE");
    }
  });

  test("filters by repo", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 6);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline?repo=vigil`);
    const data = await res.json();

    expect(data.messages.length).toBeGreaterThan(0);
    for (const msg of data.messages) {
      expect(msg.source.repo).toBe("vigil");
    }
  });

  test("pagination works", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 10);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline?limit=3&page=1`);
    const data = await res.json();

    expect(data.messages).toHaveLength(3);
    expect(data.total).toBe(10);
    expect(data.hasMore).toBe(true);

    const res2 = await fetch(`${baseUrl}/api/timeline?limit=3&page=4`);
    const data2 = await res2.json();
    expect(data2.messages).toHaveLength(1);
    expect(data2.hasMore).toBe(false);
  });

  test("each message has expected fields", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 1);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline`);
    const data = await res.json();
    const msg = data.messages[0];

    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeTruthy();
    expect(msg.source).toBeTruthy();
    expect(msg.decision).toBeTruthy();
    expect(msg.message).toBeTruthy();
    expect(typeof msg.confidence).toBe("number");
  });
});

describe("GET /api/timeline/fragment", () => {
  test("returns HTML with entry cards", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 3);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline/fragment`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("tl-entry");
    expect(html).toContain("tl-expand-btn");
  });

  test("filter buttons return only matching decisions", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 8);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline/fragment?decision=NOTIFY`);
    const html = await res.text();

    expect(html).toContain("tl-notify");
    expect(html).not.toContain("tl-badge-observe");
    expect(html).not.toContain("tl-badge-act");
  });

  test("empty results show empty state", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline/fragment`);
    const html = await res.text();
    expect(html).toContain("tl-empty");
  });

  test("infinite scroll sentinel appears when hasMore", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 10);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline/fragment?limit=3`);
    const html = await res.text();
    expect(html).toContain("tl-sentinel");
    expect(html).toContain('hx-trigger="revealed"');
    expect(html).toContain("page=2");
  });
});

describe("GET /api/timeline/:id/fragment", () => {
  test("expanded view shows detail panel", async () => {
    const daemon = createMockDaemon();
    const messages = seedMessages(daemon, 1);
    server = startDashboard(daemon, port);

    const id = messages[0].id;
    const res = await fetch(`${baseUrl}/api/timeline/${id}/fragment`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("tl-expanded");
    expect(html).toContain("tl-detail-panel");
    expect(html).toContain("tl-reply-form");
    expect(html).toContain("tl-collapse-btn");
  });

  test("collapsed=1 returns collapsed card", async () => {
    const daemon = createMockDaemon();
    const messages = seedMessages(daemon, 1);
    server = startDashboard(daemon, port);

    const id = messages[0].id;
    const res = await fetch(`${baseUrl}/api/timeline/${id}/fragment?collapsed=1`);
    const html = await res.text();

    expect(html).toContain("tl-expand-btn");
    expect(html).not.toContain("tl-expanded");
  });

  test("unknown ID returns 404", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline/nonexistent-id/fragment`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/timeline/:id/reply", () => {
  test("submits reply and shows confirmation", async () => {
    const daemon = createMockDaemon();
    const messages = seedMessages(daemon, 1);
    server = startDashboard(daemon, port);

    const id = messages[0].id;
    const form = new FormData();
    form.set("reply", "Looks good, keep watching.");

    const res = await fetch(`${baseUrl}/api/timeline/${id}/reply`, {
      method: "POST",
      body: form,
    });
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("tl-reply-success");
    expect(html).toContain("Reply sent");

    // Verify it was added to userReply.pendingReplies
    expect(daemon.userReply.pendingReplies).toHaveLength(1);
    expect(daemon.userReply.pendingReplies[0].userReply).toBe("Looks good, keep watching.");
  });

  test("empty reply shows error", async () => {
    const daemon = createMockDaemon();
    const messages = seedMessages(daemon, 1);
    server = startDashboard(daemon, port);

    const id = messages[0].id;
    const form = new FormData();
    form.set("reply", "   ");

    const res = await fetch(`${baseUrl}/api/timeline/${id}/reply`, {
      method: "POST",
      body: form,
    });

    const html = await res.text();
    expect(html).toContain("tl-reply-error");
  });

  test("reply to unknown message shows error", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const form = new FormData();
    form.set("reply", "test");

    const res = await fetch(`${baseUrl}/api/timeline/nonexistent/reply`, {
      method: "POST",
      body: form,
    });

    const html = await res.text();
    expect(html).toContain("tl-reply-error");
  });
});

describe("timeline contains no emojis", () => {
  test("entry cards use SVG icons not emojis", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 4);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/timeline/fragment`);
    const html = await res.text();
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});

// ── Phase 3: Per-Repo Sidebar ─────────────────────

describe("GET /api/repos", () => {
  test("returns list of watched repos", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toBeArray();
    expect(data).toHaveLength(2);
    expect(data[0].name).toBe("vigil");
    expect(data[0].branch).toBe("main");
    expect(data[0].head).toBe("b19bbac");
    expect(data[0].dirty).toBe(true);
    expect(data[1].name).toBe("other");
    expect(data[1].dirty).toBe(false);
  });
});

describe("GET /api/repos/fragment", () => {
  test("returns HTML nav buttons for repos", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/fragment`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("repo-nav-btn");
    expect(html).toContain("vigil");
    expect(html).toContain("other");
    expect(html).toContain("main");
  });
});

describe("GET /api/repos/:name", () => {
  test("returns full repo detail", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 4);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil`);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.name).toBe("vigil");
    expect(data.branch).toBe("main");
    expect(data.head).toBe("b19bbac");
    expect(data.dirty).toBe(true);
    expect(data.decisions).toBeTruthy();
    expect(data.decisions.total).toBeGreaterThan(0);
    expect(data.patterns).toBeArray();
    expect(data.patterns).toContain("All LLM calls route through claude -p CLI");
    expect(data.topics).toBeArray();
  });

  test("returns 404 for unknown repo", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/nonexistent`);
    expect(res.status).toBe(404);
  });
});

describe("GET /api/repos/:name/fragment", () => {
  test("returns HTML sidebar panel", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 4);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil/fragment`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("rs-panel");
    expect(html).toContain("vigil");
    expect(html).toContain("main");
    expect(html).toContain("b19bbac");
  });

  test("decision bars render proportionally", async () => {
    const daemon = createMockDaemon();
    seedMessages(daemon, 4);
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil/fragment`);
    const html = await res.text();

    expect(html).toContain("rs-bar-row");
    expect(html).toContain("rs-fill-silent");
    expect(html).toContain("rs-fill-observe");
    expect(html).toContain("rs-fill-notify");
    expect(html).toContain("rs-fill-act");
    // SILENT should have the highest percentage
    expect(html).toContain("SILENT");
  });

  test("patterns and topics sections render", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil/fragment`);
    const html = await res.text();

    expect(html).toContain("rs-section-title");
    expect(html).toContain("Patterns");
    expect(html).toContain("Topics");
    expect(html).toContain("claude -p CLI");
    expect(html).toContain("Tiered memory pipeline");
  });

  test("sidebar has 30s auto-refresh via hx-trigger", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil/fragment`);
    const html = await res.text();
    expect(html).toContain('hx-trigger="every 30s"');
  });

  test("dirty repo shows uncommitted section", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil/fragment`);
    const html = await res.text();
    expect(html).toContain("Uncommitted Work");
  });

  test("clean repo hides uncommitted section", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/other/fragment`);
    const html = await res.text();
    expect(html).not.toContain("Uncommitted Work");
  });

  test("returns 404 for unknown repo", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/nonexistent/fragment`);
    expect(res.status).toBe(404);
  });

  test("contains no emojis", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/repos/vigil/fragment`);
    const html = await res.text();
    expect(html).toContain("<svg");
    expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });
});

// ── Phase 4: Metrics Panel ─────────────────────

describe("GET /api/metrics", () => {
  test("returns valid JSON with all required sections", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");

    const data = await res.json();

    // Decisions section
    expect(data.decisions).toBeTruthy();
    expect(data.decisions.totals).toBeTruthy();
    expect(data.decisions.totals.SILENT).toBe(80);
    expect(data.decisions.totals.OBSERVE).toBe(14);
    expect(data.decisions.totals.NOTIFY).toBe(5);
    expect(data.decisions.totals.ACT).toBe(1);
    expect(data.decisions.series).toBeArray();

    // Latency section
    expect(data.latency).toBeTruthy();
    expect(data.latency.avg).toBe(1340);
    expect(data.latency.max).toBe(3200);
    expect(data.latency.p95).toBeGreaterThan(0);
    expect(data.latency.count).toBe(27);
    expect(data.latency.series).toBeArray();

    // Tokens section
    expect(data.tokens).toBeTruthy();
    expect(data.tokens.total).toBeGreaterThan(0);
    expect(data.tokens.costEstimate).toMatch(/^\$/);
    expect(data.tokens.perTick).toBeTruthy();

    // Tick timing section
    expect(data.tickTiming).toBeTruthy();
    expect(data.tickTiming.configured).toBe(30);
    expect(data.tickTiming.adaptiveCurrent).toBe(24);
    expect(data.tickTiming.series).toBeArray();

    // Ticks section
    expect(data.ticks).toBeTruthy();
    expect(data.ticks.total).toBe(142);
    expect(data.ticks.sleeping).toBe(30);
    expect(data.ticks.proactive).toBe(12);
    expect(data.ticks.current).toBe(42);

    // State section
    expect(data.state).toBeTruthy();
    expect(data.state.isSleeping).toBe(false);
    expect(data.state.model).toBe("claude-haiku-4-5-20251001");
  });

  test("cost estimate calculates correctly for haiku model", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/metrics`);
    const data = await res.json();

    // 27 calls * 100 tokens/call = 2700 tokens
    // Haiku: $0.25/MTok → 2700/1M * 0.25 = $0.000675
    expect(data.tokens.costEstimate).toBe("$0.0007");
  });

  test("latency series is ordered and capped", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/metrics`);
    const data = await res.json();

    expect(data.latency.series.length).toBeLessThanOrEqual(50);
    for (const pt of data.latency.series) {
      expect(pt.tick).toBeGreaterThan(0);
      expect(pt.ms).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("GET /api/metrics/fragment", () => {
  test("returns HTML with chart canvases and stats", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/metrics/fragment`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();

    // Chart canvases present
    expect(html).toContain('id="chart-decisions"');
    expect(html).toContain('id="chart-latency"');
    expect(html).toContain('id="chart-tick-interval"');
    expect(html).toContain('id="chart-tokens"');

    // Quick stats card
    expect(html).toContain("Quick Stats");
    expect(html).toContain("Total Ticks");
    expect(html).toContain("142");
    expect(html).toContain("LLM Calls");
    expect(html).toContain("27");

    // Decision totals
    expect(html).toContain("Decision Totals");
    expect(html).toContain("SILENT");
    expect(html).toContain("80");
    expect(html).toContain("OBSERVE");
    expect(html).toContain("14");
  });

  test("contains no emojis", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/metrics/fragment`);
    const html = await res.text();
    expect(html).not.toMatch(/[\u{1F300}-\u{1F9FF}]/u);
  });

  test("latency stats are formatted correctly", async () => {
    const daemon = createMockDaemon();
    server = startDashboard(daemon, port);

    const res = await fetch(`${baseUrl}/api/metrics/fragment`);
    const html = await res.text();
    expect(html).toContain("Avg Latency");
    expect(html).toContain("P95 Latency");
    expect(html).toContain("Max Latency");
    // Values should be formatted as seconds (1340ms = 1.34s)
    expect(html).toContain("1.34s");
    expect(html).toContain("3.20s");
  });
});
