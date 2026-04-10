import { beforeEach, describe, expect, it } from "bun:test";
import { checkChannelGates, type GateContext } from "../../channels/gate.ts";
import { ChannelHandler } from "../../channels/handler.ts";
import { ChannelPermissionManager } from "../../channels/permissions.ts";
import type { ChannelEntry } from "../../channels/schema.ts";
import { ChannelMessageSchema, ChannelPermissionSchema, wrapChannelMessage } from "../../channels/schema.ts";
import { MessageRouter } from "../../messaging/router.ts";

// --- Schema Tests ---

describe("ChannelMessageSchema", () => {
  it("validates a correct channel message", () => {
    const msg = {
      method: "notifications/vigil/channel",
      params: { content: "Hello from Slack" },
    };
    const result = ChannelMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it("validates with meta", () => {
    const msg = {
      method: "notifications/vigil/channel",
      params: {
        content: "New PR opened",
        meta: { user: "alice", thread_id: "t-123" },
      },
    };
    const result = ChannelMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.params.meta?.user).toBe("alice");
    }
  });

  it("rejects wrong method", () => {
    const msg = {
      method: "notifications/other/channel",
      params: { content: "test" },
    };
    const result = ChannelMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it("rejects missing content", () => {
    const msg = {
      method: "notifications/vigil/channel",
      params: {},
    };
    const result = ChannelMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

describe("ChannelPermissionSchema", () => {
  it("validates allow permission", () => {
    const msg = {
      method: "notifications/vigil/channel/permission",
      params: { request_id: "abc12", behavior: "allow" },
    };
    const result = ChannelPermissionSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it("validates deny permission", () => {
    const msg = {
      method: "notifications/vigil/channel/permission",
      params: { request_id: "xyz99", behavior: "deny" },
    };
    const result = ChannelPermissionSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it("rejects invalid behavior", () => {
    const msg = {
      method: "notifications/vigil/channel/permission",
      params: { request_id: "abc12", behavior: "maybe" },
    };
    const result = ChannelPermissionSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

describe("wrapChannelMessage", () => {
  it("wraps content with source tag", () => {
    const result = wrapChannelMessage("slack", "Hello world");
    expect(result).toBe('<channel source="slack">\nHello world\n</channel>');
  });

  it("includes meta as XML attributes", () => {
    const result = wrapChannelMessage("slack", "msg", { user: "alice", thread: "t1" });
    expect(result).toContain('source="slack"');
    expect(result).toContain('user="alice"');
    expect(result).toContain('thread="t1"');
  });

  it("escapes special XML characters in attributes", () => {
    const result = wrapChannelMessage('a"b', "content", { key: "<val>&" });
    expect(result).toContain("&quot;");
    expect(result).toContain("&lt;");
    expect(result).toContain("&amp;");
  });
});

// --- Gate Tests ---

describe("checkChannelGates", () => {
  const channel: ChannelEntry = {
    kind: "server",
    name: "slack-bot",
    serverUrl: "http://localhost:3001",
    capabilities: { "vigil/channel": {} },
  };

  const allOpen: GateContext = {
    featureEnabled: true,
    runtimeEnabled: true,
    isAuthenticated: true,
    orgChannelsAllowed: true,
    sessionChannels: ["slack-bot"],
    allowlist: ["slack-bot"],
    devMode: false,
  };

  it("allows when all gates pass", () => {
    const result = checkChannelGates(channel, allOpen);
    expect(result.allowed).toBe(true);
    expect(result.deniedAt).toBeUndefined();
  });

  it("blocks at build-time gate", () => {
    const result = checkChannelGates(channel, { ...allOpen, featureEnabled: false });
    expect(result.allowed).toBe(false);
    expect(result.deniedAt).toBe("build-time");
  });

  it("blocks at runtime gate", () => {
    const result = checkChannelGates(channel, { ...allOpen, runtimeEnabled: false });
    expect(result.allowed).toBe(false);
    expect(result.deniedAt).toBe("runtime");
  });

  it("blocks at auth gate", () => {
    const result = checkChannelGates(channel, { ...allOpen, isAuthenticated: false });
    expect(result.allowed).toBe(false);
    expect(result.deniedAt).toBe("auth");
  });

  it("blocks at policy gate", () => {
    const result = checkChannelGates(channel, { ...allOpen, orgChannelsAllowed: false });
    expect(result.allowed).toBe(false);
    expect(result.deniedAt).toBe("policy");
  });

  it("blocks at session gate when channel not declared", () => {
    const result = checkChannelGates(channel, { ...allOpen, sessionChannels: [] });
    expect(result.allowed).toBe(false);
    expect(result.deniedAt).toBe("session");
  });

  it("blocks at allowlist gate when not listed", () => {
    const result = checkChannelGates(channel, { ...allOpen, allowlist: [] });
    expect(result.allowed).toBe(false);
    expect(result.deniedAt).toBe("allowlist");
  });

  it("bypasses allowlist in dev mode", () => {
    const result = checkChannelGates(channel, { ...allOpen, allowlist: [], devMode: true });
    expect(result.allowed).toBe(true);
  });

  it("bypasses allowlist for dev channels", () => {
    const devChannel: ChannelEntry = { ...channel, dev: true };
    const result = checkChannelGates(devChannel, { ...allOpen, allowlist: [] });
    expect(result.allowed).toBe(true);
  });

  it("returns first failing gate (order matters)", () => {
    const result = checkChannelGates(channel, {
      featureEnabled: false,
      runtimeEnabled: false,
      isAuthenticated: false,
      orgChannelsAllowed: false,
      sessionChannels: [],
      allowlist: [],
      devMode: false,
    });
    expect(result.deniedAt).toBe("build-time");
  });
});

// --- Handler Tests ---

describe("ChannelHandler", () => {
  let router: MessageRouter;
  let handler: ChannelHandler;
  const allOpen: GateContext = {
    featureEnabled: true,
    runtimeEnabled: true,
    isAuthenticated: true,
    orgChannelsAllowed: true,
    sessionChannels: ["test-server"],
    allowlist: ["test-server"],
    devMode: false,
  };

  const testChannel: ChannelEntry = {
    kind: "server",
    name: "test-server",
    serverUrl: "http://localhost:3001",
    capabilities: { "vigil/channel": {} },
  };

  beforeEach(() => {
    router = new MessageRouter();
    handler = new ChannelHandler(router, () => allOpen);
  });

  it("registers a channel when gates pass", () => {
    const events: string[] = [];
    handler.on("channel_registered", ({ channel }: { channel: string }) => events.push(channel));
    handler.registerChannel(testChannel);
    expect(events).toEqual(["test-server"]);
    expect(handler.isRegistered("test-server")).toBe(true);
  });

  it("rejects a channel when gates fail", () => {
    const blocked = new ChannelHandler(router, () => ({ ...allOpen, featureEnabled: false }));
    const events: Array<{ channel: string; gate: string }> = [];
    blocked.on("channel_rejected", (e: { channel: string; gate: string }) => events.push(e));
    blocked.registerChannel(testChannel);
    expect(events[0].gate).toBe("build-time");
    expect(blocked.isRegistered("test-server")).toBe(false);
  });

  it("handles a valid notification", async () => {
    handler.registerChannel(testChannel);
    const events: string[] = [];
    handler.on("notification_queued", () => events.push("queued"));

    await handler.handleNotification("test-server", {
      method: "notifications/vigil/channel",
      params: { content: "Hello from test" },
    });

    expect(events).toEqual(["queued"]);
    expect(handler.hasQueuedMessages()).toBe(true);
  });

  it("rejects notification from unregistered server", async () => {
    const events: Array<{ server: string; reason: string }> = [];
    handler.on("notification_rejected", (e: { server: string; reason: string }) => events.push(e));

    await handler.handleNotification("unknown", {
      method: "notifications/vigil/channel",
      params: { content: "Hello" },
    });

    expect(events[0].reason).toContain("not registered");
    expect(handler.hasQueuedMessages()).toBe(false);
  });

  it("rejects notification with invalid schema", async () => {
    handler.registerChannel(testChannel);
    const events: Array<{ server: string; reason: string }> = [];
    handler.on("notification_rejected", (e: { server: string; reason: string }) => events.push(e));

    await handler.handleNotification("test-server", {
      method: "notifications/vigil/channel",
      params: {}, // missing content
    });

    expect(events[0].reason).toContain("Invalid schema");
  });

  it("drains queue and returns messages", async () => {
    handler.registerChannel(testChannel);

    await handler.handleNotification("test-server", {
      method: "notifications/vigil/channel",
      params: { content: "msg1" },
    });
    await handler.handleNotification("test-server", {
      method: "notifications/vigil/channel",
      params: { content: "msg2" },
    });

    expect(handler.hasQueuedMessages()).toBe(true);
    const messages = handler.drainQueue();
    expect(messages).toHaveLength(2);
    expect(handler.hasQueuedMessages()).toBe(false);
  });

  it("unregisters a channel", () => {
    handler.registerChannel(testChannel);
    expect(handler.isRegistered("test-server")).toBe(true);
    handler.unregisterChannel("test-server");
    expect(handler.isRegistered("test-server")).toBe(false);
  });

  it("lists registered channels", () => {
    handler.registerChannel(testChannel);
    expect(handler.getRegisteredChannels()).toEqual(["test-server"]);
  });
});

// --- Permission Manager Tests ---

describe("ChannelPermissionManager", () => {
  it("creates pending requests", () => {
    const mgr = new ChannelPermissionManager();
    mgr.requestPermission("slack", "send_message", "Send a message");
    expect(mgr.getPendingCount()).toBe(1);
  });

  it("returns false for unknown request ID", () => {
    const mgr = new ChannelPermissionManager();
    const handled = mgr.handlePermissionResponse("nonexistent", "allow");
    expect(handled).toBe(false);
  });

  it("expires after TTL", async () => {
    // Use a very short TTL for testing
    const mgr = new ChannelPermissionManager(50);
    const promise = mgr.requestPermission("slack", "send_message", "test");

    // Wait for expiry
    const result = await promise;
    expect(result).toBe(false);
    expect(mgr.getPendingCount()).toBe(0);
  });

  it("tracks pending state", () => {
    const mgr = new ChannelPermissionManager(60_000);
    expect(mgr.getPendingCount()).toBe(0);
    mgr.requestPermission("slack", "tool1", "desc");
    expect(mgr.getPendingCount()).toBe(1);
    mgr.requestPermission("slack", "tool2", "desc");
    expect(mgr.getPendingCount()).toBe(2);
  });
});
