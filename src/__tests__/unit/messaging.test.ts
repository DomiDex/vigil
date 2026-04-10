import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ToolContext, ToolExecutor } from "../../llm/tools.ts";
import { ConsoleChannel } from "../../messaging/channels/console.ts";
import { JsonlChannel } from "../../messaging/channels/jsonl.ts";
import { DisplayFilter } from "../../messaging/displayFilter.ts";
import { type DeliveryChannel, MessageRouter } from "../../messaging/router.ts";
import { createMessage, MessageStatus, type VigilMessage, VigilMessageSchema } from "../../messaging/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<VigilMessage> = {}): VigilMessage {
  return createMessage({
    source: { repo: "test-repo", branch: "main" },
    status: "normal",
    message: "Something happened",
    ...overrides,
  });
}

function makeMockChannel(
  name: string,
  opts: { enabled?: boolean; accepts?: boolean; fail?: boolean } = {},
): DeliveryChannel {
  const { enabled = true, accepts = true, fail = false } = opts;
  return {
    name,
    isEnabled: () => enabled,
    accepts: () => accepts,
    deliver: async (_msg) => {
      if (fail) throw new Error("delivery failed");
      return { channel: name, success: true };
    },
  };
}

// ---------------------------------------------------------------------------
// Schema tests
// ---------------------------------------------------------------------------

describe("messaging/schema", () => {
  it("createMessage fills defaults", () => {
    const msg = createMessage({
      source: { repo: "my-repo" },
      status: "normal",
      message: "test message",
    });

    expect(msg.id).toBeDefined();
    expect(msg.timestamp).toBeDefined();
    expect(msg.severity).toBe("info");
    expect(msg.attachments).toEqual([]);
    expect(msg.metadata).toEqual({});
    expect(msg.source.repo).toBe("my-repo");
    expect(msg.status).toBe("normal");
    expect(msg.message).toBe("test message");
  });

  it("createMessage preserves overrides", () => {
    const msg = createMessage({
      source: { repo: "r", branch: "dev", event: "push", agent: "vigil" },
      status: "alert",
      message: "alert!",
      severity: "critical",
      metadata: { key: "value" },
    });

    expect(msg.severity).toBe("critical");
    expect(msg.status).toBe("alert");
    expect(msg.source.branch).toBe("dev");
    expect(msg.source.agent).toBe("vigil");
    expect(msg.metadata).toEqual({ key: "value" });
  });

  it("schema validates message status enum", () => {
    expect(() =>
      VigilMessageSchema.parse({
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        source: { repo: "r" },
        status: "invalid_status",
        message: "test",
      }),
    ).toThrow();
  });

  it("schema validates uuid format", () => {
    expect(() =>
      VigilMessageSchema.parse({
        id: "not-a-uuid",
        timestamp: new Date().toISOString(),
        source: { repo: "r" },
        status: "normal",
        message: "test",
      }),
    ).toThrow();
  });

  it("MessageStatus enum has expected values", () => {
    expect(MessageStatus.options).toEqual(["normal", "proactive", "scheduled", "alert"]);
  });

  it("createMessage with attachments", () => {
    const msg = createMessage({
      source: { repo: "r" },
      status: "normal",
      message: "with files",
      attachments: [{ path: "/tmp/diff.patch", size: 1024, isImage: false }],
    });

    expect(msg.attachments).toHaveLength(1);
    expect(msg.attachments[0].path).toBe("/tmp/diff.patch");
    expect(msg.attachments[0].size).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// Router tests
// ---------------------------------------------------------------------------

describe("messaging/router", () => {
  it("routes to accepting channels", async () => {
    const router = new MessageRouter();
    const ch1 = makeMockChannel("ch1");
    const ch2 = makeMockChannel("ch2");
    router.registerChannel(ch1);
    router.registerChannel(ch2);

    const msg = makeMessage();
    const results = await router.route(msg);

    expect(results).toHaveLength(2);
    expect(results[0].channel).toBe("ch1");
    expect(results[0].success).toBe(true);
    expect(results[1].channel).toBe("ch2");
  });

  it("skips disabled channels", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("enabled"));
    router.registerChannel(makeMockChannel("disabled", { enabled: false }));

    const results = await router.route(makeMessage());
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("enabled");
  });

  it("skips channels that don't accept", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("accepts"));
    router.registerChannel(makeMockChannel("rejects", { accepts: false }));

    const results = await router.route(makeMessage());
    expect(results).toHaveLength(1);
    expect(results[0].channel).toBe("accepts");
  });

  it("emits undelivered when no channels accept", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("off", { enabled: false }));

    let undelivered: VigilMessage | null = null;
    router.on("undelivered", (msg) => {
      undelivered = msg;
    });

    const msg = makeMessage();
    const results = await router.route(msg);

    expect(results).toHaveLength(0);
    expect(undelivered).not.toBeNull();
    expect(undelivered!.id).toBe(msg.id);
  });

  it("emits delivered event with results", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("ch1"));

    let deliveredPayload: any = null;
    router.on("delivered", (payload) => {
      deliveredPayload = payload;
    });

    await router.route(makeMessage());

    expect(deliveredPayload).not.toBeNull();
    expect(deliveredPayload.results).toHaveLength(1);
    expect(deliveredPayload.results[0].success).toBe(true);
  });

  it("handles channel delivery failure gracefully", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("failing", { fail: true }));

    const results = await router.route(makeMessage());
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe("delivery failed");
  });

  it("maintains history ring buffer", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("ch"));

    for (let i = 0; i < 5; i++) {
      await router.route(makeMessage({ message: `msg-${i}` }));
    }

    const history = router.getHistory();
    expect(history).toHaveLength(5);
    expect(history[0].message).toBe("msg-0");
    expect(history[4].message).toBe("msg-4");
  });

  it("getHistory filters by status", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("ch"));

    await router.route(makeMessage({ status: "normal" }));
    await router.route(makeMessage({ status: "alert" }));
    await router.route(makeMessage({ status: "normal" }));

    const alerts = router.getHistory({ status: "alert" });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].status).toBe("alert");
  });

  it("getHistory respects limit", async () => {
    const router = new MessageRouter();
    router.registerChannel(makeMockChannel("ch"));

    for (let i = 0; i < 10; i++) {
      await router.route(makeMessage({ message: `msg-${i}` }));
    }

    const last3 = router.getHistory({ limit: 3 });
    expect(last3).toHaveLength(3);
    expect(last3[0].message).toBe("msg-7");
  });

  it("getChannelCount returns registered count", () => {
    const router = new MessageRouter();
    expect(router.getChannelCount()).toBe(0);
    router.registerChannel(makeMockChannel("a"));
    router.registerChannel(makeMockChannel("b"));
    expect(router.getChannelCount()).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// ConsoleChannel tests
// ---------------------------------------------------------------------------

describe("messaging/channels/console", () => {
  let consoleSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    consoleSpy = spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it("is always enabled and accepts all", () => {
    const ch = new ConsoleChannel();
    expect(ch.isEnabled()).toBe(true);
    expect(ch.accepts(makeMessage())).toBe(true);
    expect(ch.name).toBe("console");
  });

  it("delivers message to console.log", async () => {
    const ch = new ConsoleChannel();
    const result = await ch.deliver(makeMessage());

    expect(result.success).toBe(true);
    expect(result.channel).toBe("console");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("includes source repo and branch", async () => {
    const ch = new ConsoleChannel();
    await ch.deliver(makeMessage({ source: { repo: "my-repo", branch: "feat" } }));

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("my-repo");
    expect(output).toContain("feat");
  });

  it("shows status tag for non-normal messages", async () => {
    const ch = new ConsoleChannel();
    await ch.deliver(makeMessage({ status: "proactive" }));

    const output = consoleSpy.mock.calls[0][0] as string;
    expect(output).toContain("proactive");
  });

  it("shows attachment count", async () => {
    const ch = new ConsoleChannel();
    await ch.deliver(
      makeMessage({
        attachments: [
          { path: "/tmp/a.txt", size: 100, isImage: false },
          { path: "/tmp/b.png", size: 200, isImage: true },
        ],
      }),
    );

    // Second console.log call has attachments
    expect(consoleSpy.mock.calls.length).toBe(2);
    const attachOutput = consoleSpy.mock.calls[1][0] as string;
    expect(attachOutput).toContain("2 attachment(s)");
  });

  it("rejects messages that fail the display filter (brief mode)", () => {
    const filter = new DisplayFilter({ showStatuses: ["alert"] });
    const ch = new ConsoleChannel(filter);

    // normal status should be rejected by the filter
    expect(ch.accepts(makeMessage({ status: "normal", message: "brief-a" }))).toBe(false);
    // alert status should pass
    expect(ch.accepts(makeMessage({ status: "alert", message: "brief-b" }))).toBe(true);
  });

  it("accepts all messages without a filter", () => {
    const ch = new ConsoleChannel();
    expect(ch.accepts(makeMessage({ status: "normal", message: "no-filter-a" }))).toBe(true);
    expect(ch.accepts(makeMessage({ status: "alert", message: "no-filter-b" }))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JsonlChannel tests
// ---------------------------------------------------------------------------

describe("messaging/channels/jsonl", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-jsonl-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates parent directory on construction", () => {
    const subDir = join(tmpDir, "nested", "dir");
    new JsonlChannel(join(subDir, "messages.jsonl"));
    expect(existsSync(subDir)).toBe(true);
  });

  it("is always enabled and accepts all", () => {
    const ch = new JsonlChannel(join(tmpDir, "test.jsonl"));
    expect(ch.isEnabled()).toBe(true);
    expect(ch.accepts(makeMessage())).toBe(true);
    expect(ch.name).toBe("jsonl");
  });

  it("appends messages as JSONL", async () => {
    const filePath = join(tmpDir, "messages.jsonl");
    const ch = new JsonlChannel(filePath);

    const msg1 = makeMessage({ message: "first" });
    const msg2 = makeMessage({ message: "second" });

    await ch.deliver(msg1);
    await ch.deliver(msg2);

    const content = readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);

    const parsed1 = JSON.parse(lines[0]);
    const parsed2 = JSON.parse(lines[1]);
    expect(parsed1.message).toBe("first");
    expect(parsed2.message).toBe("second");
    expect(parsed1.id).toBe(msg1.id);
  });

  it("returns success result", async () => {
    const ch = new JsonlChannel(join(tmpDir, "test.jsonl"));
    const result = await ch.deliver(makeMessage());

    expect(result.success).toBe(true);
    expect(result.channel).toBe("jsonl");
  });
});

// ---------------------------------------------------------------------------
// DisplayFilter tests
// ---------------------------------------------------------------------------

describe("messaging/displayFilter", () => {
  it("filters by status (default: proactive, alert, scheduled)", () => {
    const filter = new DisplayFilter();

    expect(filter.shouldDisplay(makeMessage({ status: "normal", message: "msg-a" }))).toBe(false);
    expect(filter.shouldDisplay(makeMessage({ status: "proactive", message: "msg-b" }))).toBe(true);
    expect(filter.shouldDisplay(makeMessage({ status: "alert", message: "msg-c" }))).toBe(true);
    expect(filter.shouldDisplay(makeMessage({ status: "scheduled", message: "msg-d" }))).toBe(true);
  });

  it("filters by minimum severity", () => {
    const filter = new DisplayFilter({ minSeverity: "warning" });

    expect(filter.shouldDisplay(makeMessage({ status: "alert", severity: "info", message: "sev-a" }))).toBe(false);
    expect(filter.shouldDisplay(makeMessage({ status: "alert", severity: "warning", message: "sev-b" }))).toBe(true);
    expect(filter.shouldDisplay(makeMessage({ status: "alert", severity: "critical", message: "sev-c" }))).toBe(true);
  });

  it("deduplicates within time window", () => {
    const filter = new DisplayFilter({
      showStatuses: ["alert"],
      dedupeWindowMs: 60_000,
    });

    const msg1 = makeMessage({
      status: "alert",
      source: { repo: "r", event: "push" },
      message: "same message",
    });
    const msg2 = makeMessage({
      status: "alert",
      source: { repo: "r", event: "push" },
      message: "same message",
    });

    expect(filter.shouldDisplay(msg1)).toBe(true);
    expect(filter.shouldDisplay(msg2)).toBe(false); // duplicate
  });

  it("allows different messages from same source", () => {
    const filter = new DisplayFilter({
      showStatuses: ["alert"],
    });

    const msg1 = makeMessage({
      status: "alert",
      source: { repo: "r" },
      message: "first issue",
    });
    const msg2 = makeMessage({
      status: "alert",
      source: { repo: "r" },
      message: "second issue",
    });

    expect(filter.shouldDisplay(msg1)).toBe(true);
    expect(filter.shouldDisplay(msg2)).toBe(true);
  });

  it("custom showStatuses config", () => {
    const filter = new DisplayFilter({
      showStatuses: ["normal", "alert"],
    });

    expect(filter.shouldDisplay(makeMessage({ status: "normal", message: "cust-a" }))).toBe(true);
    expect(filter.shouldDisplay(makeMessage({ status: "proactive", message: "cust-b" }))).toBe(false);
    expect(filter.shouldDisplay(makeMessage({ status: "alert", message: "cust-c" }))).toBe(true);
  });

  it("dedup window expires (time-based)", () => {
    const filter = new DisplayFilter({
      showStatuses: ["alert"],
      dedupeWindowMs: 100,
    });

    const msg = makeMessage({
      status: "alert",
      source: { repo: "r", event: "push" },
      message: "test",
    });

    expect(filter.shouldDisplay(msg)).toBe(true);

    // Manually expire the hash by manipulating internals
    const hashes = (filter as any).recentHashes as Map<string, number>;
    for (const [key] of hashes) {
      hashes.set(key, Date.now() - 200);
    }

    expect(filter.shouldDisplay(msg)).toBe(true); // re-allowed after window
  });
});

// ---------------------------------------------------------------------------
// send_user_message tool tests (Phase 9 — LLM tool integration)
// ---------------------------------------------------------------------------

function makeToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    repo: "test-repo",
    tickNum: 1,
    vectorStore: { store: () => {}, hybridSearch: () => [] } as any,
    topicTier: { addObservation: () => {}, getTopic: () => null } as any,
    sleepController: { requestSleep: () => {}, subscribe: () => {}, getSubscriptions: () => [] } as any,
    eventLog: { append: () => {} } as any,
    ...overrides,
  };
}

describe("send_user_message tool", () => {
  it("returns error when messageRouter is not available", async () => {
    const executor = new ToolExecutor(makeToolContext());
    const result = await executor.execute({
      tool: "send_user_message",
      args: { message: "hello", status: "normal" },
    });

    expect(result.tool).toBe("send_user_message");
    expect(result.error).toBe("MessageRouter not available");
  });

  it("routes a message through MessageRouter", async () => {
    const router = new MessageRouter();
    const delivered: VigilMessage[] = [];
    router.registerChannel({
      name: "test",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async (msg) => {
        delivered.push(msg);
        return { channel: "test", success: true };
      },
    });

    const executor = new ToolExecutor(makeToolContext({ messageRouter: router }));
    const result = await executor.execute({
      tool: "send_user_message",
      args: { message: "Test insight", status: "proactive", severity: "warning" },
    });

    expect(result.error).toBeUndefined();
    expect(result.result).toContain("1 channel(s)");
    expect(delivered).toHaveLength(1);
    expect(delivered[0].message).toBe("Test insight");
    expect(delivered[0].status).toBe("proactive");
    expect(delivered[0].severity).toBe("warning");
    expect(delivered[0].source.repo).toBe("test-repo");
    expect(delivered[0].source.event).toBe("send_user_message");
  });

  it("defaults severity to info when not provided", async () => {
    const router = new MessageRouter();
    const delivered: VigilMessage[] = [];
    router.registerChannel({
      name: "test",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async (msg) => {
        delivered.push(msg);
        return { channel: "test", success: true };
      },
    });

    const executor = new ToolExecutor(makeToolContext({ messageRouter: router }));
    await executor.execute({
      tool: "send_user_message",
      args: { message: "Default severity", status: "normal" },
    });

    expect(delivered[0].severity).toBe("info");
  });

  it("resolves attachment metadata from filesystem", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "vigil-tool-test-"));
    const testFile = join(tmpDir, "test.ts");
    writeFileSync(testFile, "export const x = 42;\n");

    const router = new MessageRouter();
    const delivered: VigilMessage[] = [];
    router.registerChannel({
      name: "test",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async (msg) => {
        delivered.push(msg);
        return { channel: "test", success: true };
      },
    });

    const executor = new ToolExecutor(makeToolContext({ messageRouter: router, repoPath: tmpDir }));
    await executor.execute({
      tool: "send_user_message",
      args: {
        message: "Check this file",
        status: "normal",
        attachments: [{ path: "test.ts" }],
      },
    });

    expect(delivered[0].attachments).toHaveLength(1);
    expect(delivered[0].attachments[0].path).toBe("test.ts");
    expect(delivered[0].attachments[0].size).toBeGreaterThan(0);
    expect(delivered[0].attachments[0].isImage).toBe(false);
    expect(delivered[0].attachments[0].mimeType).toBe("text/typescript");

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("handles non-existent attachment gracefully", async () => {
    const router = new MessageRouter();
    const delivered: VigilMessage[] = [];
    router.registerChannel({
      name: "test",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async (msg) => {
        delivered.push(msg);
        return { channel: "test", success: true };
      },
    });

    const executor = new ToolExecutor(makeToolContext({ messageRouter: router }));
    await executor.execute({
      tool: "send_user_message",
      args: {
        message: "Missing file",
        status: "alert",
        attachments: [{ path: "nonexistent.ts" }],
      },
    });

    expect(delivered[0].attachments).toHaveLength(1);
    expect(delivered[0].attachments[0].size).toBe(0);
  });

  it("also appends to eventLog for backwards compat", async () => {
    const router = new MessageRouter();
    router.registerChannel({
      name: "test",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async () => ({ channel: "test", success: true }),
    });

    const appendCalls: any[] = [];
    const executor = new ToolExecutor(
      makeToolContext({
        messageRouter: router,
        eventLog: { append: (...args: any[]) => appendCalls.push(args) } as any,
      }),
    );
    await executor.execute({
      tool: "send_user_message",
      args: { message: "Logged too", status: "alert", severity: "critical" },
    });

    expect(appendCalls).toHaveLength(1);
    expect(appendCalls[0][0]).toBe("test-repo");
    expect(appendCalls[0][1].detail).toBe("Logged too");
    expect(appendCalls[0][1].type).toBe("notify"); // alert → notify type
  });

  it("includes tickNum in message metadata", async () => {
    const router = new MessageRouter();
    const delivered: VigilMessage[] = [];
    router.registerChannel({
      name: "test",
      isEnabled: () => true,
      accepts: () => true,
      deliver: async (msg) => {
        delivered.push(msg);
        return { channel: "test", success: true };
      },
    });

    const executor = new ToolExecutor(makeToolContext({ messageRouter: router, tickNum: 42 }));
    await executor.execute({
      tool: "send_user_message",
      args: { message: "Tick check", status: "normal" },
    });

    expect(delivered[0].metadata.tickNum).toBe(42);
  });
});
