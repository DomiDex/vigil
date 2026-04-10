import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type DeliveryChannel, MessageRouter, type VigilMessage } from "../../messaging/index.ts";
import { WebhookProcessor } from "../../webhooks/processor.ts";
import { type WebhookEvent, WebhookServer } from "../../webhooks/server.ts";
import { SubscriptionManager } from "../../webhooks/subscriptions.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCollector(): { channel: DeliveryChannel; messages: VigilMessage[] } {
  const messages: VigilMessage[] = [];
  return {
    messages,
    channel: {
      name: "collector",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async (msg) => {
        messages.push(msg);
        return { channel: "collector", success: true };
      },
    },
  };
}

function makePREvent(repo: string, prNumber: number, action: string): WebhookEvent {
  return {
    type: "pull_request",
    action,
    payload: {
      action,
      repository: { full_name: repo },
      pull_request: {
        number: prNumber,
        title: "Fix the bug",
        html_url: `https://github.com/${repo}/pull/${prNumber}`,
        user: { login: "testuser" },
        head: { ref: "fix-branch" },
        merged: action === "closed",
      },
    },
    receivedAt: Date.now(),
  };
}

function makePushEvent(repo: string, branch: string, commitMessages: string[]): WebhookEvent {
  return {
    type: "push",
    action: "",
    payload: {
      repository: { full_name: repo },
      ref: `refs/heads/${branch}`,
      commits: commitMessages.map((msg) => ({ message: msg })),
    },
    receivedAt: Date.now(),
  };
}

function makeReviewEvent(repo: string, prNumber: number, state: string): WebhookEvent {
  return {
    type: "pull_request_review",
    action: "submitted",
    payload: {
      repository: { full_name: repo },
      pull_request: { number: prNumber },
      review: {
        state,
        user: { login: "reviewer" },
      },
    },
    receivedAt: Date.now(),
  };
}

function makeCommentEvent(repo: string, issueNumber: number, body: string): WebhookEvent {
  return {
    type: "issue_comment",
    action: "created",
    payload: {
      repository: { full_name: repo },
      issue: { number: issueNumber },
      comment: {
        body,
        user: { login: "commenter" },
      },
    },
    receivedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// SubscriptionManager tests
// ---------------------------------------------------------------------------

describe("webhooks/subscriptions", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-subs-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("subscribe creates and persists a subscription", () => {
    const mgr = new SubscriptionManager(tmpDir);
    const sub = mgr.subscribe("owner/repo", 42, ["opened", "closed"]);

    expect(sub.id).toBeDefined();
    expect(sub.repo).toBe("owner/repo");
    expect(sub.prNumber).toBe(42);
    expect(sub.events).toEqual(["opened", "closed"]);
    expect(sub.active).toBe(true);
    expect(mgr.size()).toBe(1);

    // Verify file was written
    const raw = readFileSync(join(tmpDir, "pr_subscriptions.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data).toHaveLength(1);
    expect(data[0].repo).toBe("owner/repo");
  });

  it("load restores subscriptions from file", () => {
    const mgr1 = new SubscriptionManager(tmpDir);
    mgr1.subscribe("owner/repo", 1, ["opened"]);
    mgr1.subscribe("owner/repo", 2, ["closed"]);

    const mgr2 = new SubscriptionManager(tmpDir);
    mgr2.load();
    expect(mgr2.size()).toBe(2);
  });

  it("load handles missing file gracefully", () => {
    const mgr = new SubscriptionManager(tmpDir);
    mgr.load(); // No file exists
    expect(mgr.size()).toBe(0);
  });

  it("unsubscribe removes and persists", () => {
    const mgr = new SubscriptionManager(tmpDir);
    const sub = mgr.subscribe("owner/repo", 1, ["opened"]);
    expect(mgr.size()).toBe(1);

    const removed = mgr.unsubscribe(sub.id);
    expect(removed).toBe(true);
    expect(mgr.size()).toBe(0);

    // Verify file was updated
    const raw = readFileSync(join(tmpDir, "pr_subscriptions.json"), "utf-8");
    expect(JSON.parse(raw)).toEqual([]);
  });

  it("unsubscribe returns false for unknown id", () => {
    const mgr = new SubscriptionManager(tmpDir);
    expect(mgr.unsubscribe("nonexistent")).toBe(false);
  });

  it("match finds active subscriptions", () => {
    const mgr = new SubscriptionManager(tmpDir);
    mgr.subscribe("owner/repo", 42, ["opened", "closed"]);
    mgr.subscribe("owner/repo", 42, ["review_submitted"]);
    mgr.subscribe("other/repo", 42, ["opened"]);

    const matches = mgr.match("owner/repo", 42, "opened");
    expect(matches).toHaveLength(1);
    expect(matches[0].events).toContain("opened");

    expect(mgr.match("owner/repo", 42, "closed")).toHaveLength(1);
    expect(mgr.match("owner/repo", 42, "review_submitted")).toHaveLength(1);
    expect(mgr.match("owner/repo", 42, "unknown_event")).toHaveLength(0);
    expect(mgr.match("owner/repo", 99, "opened")).toHaveLength(0);
  });

  it("list filters by repo", () => {
    const mgr = new SubscriptionManager(tmpDir);
    mgr.subscribe("owner/repo-a", 1, ["opened"]);
    mgr.subscribe("owner/repo-b", 2, ["opened"]);

    expect(mgr.list({ repo: "owner/repo-a" })).toHaveLength(1);
    expect(mgr.list()).toHaveLength(2);
  });

  it("get retrieves by id", () => {
    const mgr = new SubscriptionManager(tmpDir);
    const sub = mgr.subscribe("owner/repo", 1, ["opened"]);
    expect(mgr.get(sub.id)).toEqual(sub);
    expect(mgr.get("nonexistent")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WebhookServer tests
// ---------------------------------------------------------------------------

describe("webhooks/server", () => {
  let server: WebhookServer;
  let port: number;

  beforeEach(() => {
    // Use a random high port to avoid conflicts
    port = 10000 + Math.floor(Math.random() * 50000);
  });

  afterEach(() => {
    server?.stop();
  });

  it("starts and stops", async () => {
    server = new WebhookServer({ port });
    let started = false;
    server.on("webhook_server_started", () => {
      started = true;
    });
    await server.start();
    expect(started).toBe(true);
    expect(server.getPort()).toBe(port);
    server.stop();
  });

  it("returns 404 for non-POST requests", async () => {
    server = new WebhookServer({ port });
    await server.start();

    const res = await fetch(`http://localhost:${port}/webhook/github`);
    expect(res.status).toBe(404);
  });

  it("returns 404 for wrong path", async () => {
    server = new WebhookServer({ port });
    await server.start();

    const res = await fetch(`http://localhost:${port}/wrong`, { method: "POST" });
    expect(res.status).toBe(404);
  });

  it("accepts valid webhook event", async () => {
    server = new WebhookServer({ port });
    const events: WebhookEvent[] = [];
    server.on("webhook_event", (e) => events.push(e));
    await server.start();

    const payload = { action: "opened", pull_request: { number: 1 } };
    const res = await fetch(`http://localhost:${port}/webhook/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "pull_request",
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("pull_request");
    expect(events[0].action).toBe("opened");
  });

  it("ignores unsupported event types", async () => {
    server = new WebhookServer({ port });
    const events: WebhookEvent[] = [];
    server.on("webhook_event", (e) => events.push(e));
    await server.start();

    const res = await fetch(`http://localhost:${port}/webhook/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "fork",
      },
      body: JSON.stringify({ action: "created" }),
    });

    expect(res.status).toBe(200);
    expect(events).toHaveLength(0);
  });

  it("returns 400 for invalid JSON", async () => {
    server = new WebhookServer({ port });
    await server.start();

    const res = await fetch(`http://localhost:${port}/webhook/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "push",
      },
      body: "not json",
    });

    expect(res.status).toBe(400);
  });

  it("verifies HMAC signature when secret is set", async () => {
    const secret = "test-secret";
    server = new WebhookServer({ port, secret });
    await server.start();

    const payload = JSON.stringify({ action: "opened" });

    // Request without signature → 401
    const res1 = await fetch(`http://localhost:${port}/webhook/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "pull_request",
      },
      body: payload,
    });
    expect(res1.status).toBe(401);

    // Request with valid signature → 200
    const { createHmac } = await import("node:crypto");
    const sig = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
    const res2 = await fetch(`http://localhost:${port}/webhook/github`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-event": "pull_request",
        "x-hub-signature-256": sig,
      },
      body: payload,
    });
    expect(res2.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// WebhookProcessor tests
// ---------------------------------------------------------------------------

describe("webhooks/processor", () => {
  let tmpDir: string;
  let subs: SubscriptionManager;
  let router: MessageRouter;
  let collector: ReturnType<typeof makeCollector>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-proc-test-"));
    subs = new SubscriptionManager(tmpDir);
    router = new MessageRouter();
    collector = makeCollector();
    router.registerChannel(collector.channel);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("processes PR event with matching subscription", async () => {
    subs.subscribe("owner/repo", 42, ["opened"]);
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makePREvent("owner/repo", 42, "opened"));

    expect(collector.messages).toHaveLength(1);
    const msg = collector.messages[0];
    expect(msg.message).toContain("PR #42");
    expect(msg.message).toContain("opened");
    expect(msg.message).toContain("Fix the bug");
    expect(msg.status).toBe("proactive");
    expect(msg.source.repo).toBe("owner/repo");
    expect(msg.source.event).toBe("pr:opened");
  });

  it("skips PR event without matching subscription", async () => {
    subs.subscribe("owner/repo", 99, ["opened"]);
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makePREvent("owner/repo", 42, "opened"));
    expect(collector.messages).toHaveLength(0);
  });

  it("sets warning severity on merged PR", async () => {
    subs.subscribe("owner/repo", 42, ["closed"]);
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makePREvent("owner/repo", 42, "closed"));

    expect(collector.messages).toHaveLength(1);
    expect(collector.messages[0].severity).toBe("warning");
  });

  it("processes push events (no subscription required)", async () => {
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makePushEvent("owner/repo", "main", ["fix: typo", "feat: new thing"]));

    expect(collector.messages).toHaveLength(1);
    const msg = collector.messages[0];
    expect(msg.message).toContain("Push to main");
    expect(msg.message).toContain("2 commit(s)");
    expect(msg.message).toContain("feat: new thing");
    expect(msg.status).toBe("normal");
    expect(msg.source.branch).toBe("main");
  });

  it("skips push events with no commits", async () => {
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makePushEvent("owner/repo", "main", []));
    expect(collector.messages).toHaveLength(0);
  });

  it("processes review events with matching subscription", async () => {
    subs.subscribe("owner/repo", 42, ["review_submitted"]);
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makeReviewEvent("owner/repo", 42, "approved"));

    expect(collector.messages).toHaveLength(1);
    const msg = collector.messages[0];
    expect(msg.message).toContain("Review on PR #42");
    expect(msg.message).toContain("approved");
    expect(msg.message).toContain("@reviewer");
    expect(msg.severity).toBe("info");
  });

  it("sets warning severity on changes_requested review", async () => {
    subs.subscribe("owner/repo", 42, ["review_submitted"]);
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makeReviewEvent("owner/repo", 42, "changes_requested"));

    expect(collector.messages[0].severity).toBe("warning");
  });

  it("processes comment events with matching subscription", async () => {
    subs.subscribe("owner/repo", 42, ["commented"]);
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makeCommentEvent("owner/repo", 42, "Looks good to me!"));

    expect(collector.messages).toHaveLength(1);
    const msg = collector.messages[0];
    expect(msg.message).toContain("Comment on #42");
    expect(msg.message).toContain("@commenter");
    expect(msg.message).toContain("Looks good to me!");
  });

  it("ignores comments without matching subscription", async () => {
    const processor = new WebhookProcessor(subs, router);

    await processor.process(makeCommentEvent("owner/repo", 42, "hello"));
    expect(collector.messages).toHaveLength(0);
  });

  it("ignores unknown event types", async () => {
    const processor = new WebhookProcessor(subs, router);

    await processor.process({
      type: "fork",
      action: "created",
      payload: {},
      receivedAt: Date.now(),
    });
    expect(collector.messages).toHaveLength(0);
  });
});
