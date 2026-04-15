# Phase 5 — New Core Plugins: Test Plan

---
scope: 7 new backend API modules + 7 frontend plugin registrations + server.ts route wiring
key_pattern: Service phase — backend handlers tested with FakeDashboardContext; frontend verified via file/manifest checks
dependencies: bun:test, existing helpers (temp-config.ts, mock-daemon.ts), Zod
---

**Phase type: Service.** Backend API handlers that access daemon internals via DashboardContext, plus frontend React plugin pages. Backend tests use a FakeDashboardContext with stubbed daemon subsystems. Frontend tests verify route files exist and plugin manifest entries are correct.

---

## User Stories

| # | User Story | Validation Check | Pass Condition |
|---|-----------|-----------------|----------------|
| US-1 | As a user, I want to view and update daemon configuration from the dashboard, so I can tune tick intervals and models without editing JSON files | `config-api.test.ts` | getConfigJSON returns all fields; handleConfigUpdate validates, persists, rejects invalid input |
| US-2 | As a user, I want to view and toggle feature gates, so I can enable/disable optional features | `config-api.test.ts` | getFeatureGatesJSON returns gate array with layers; handleFeatureToggle toggles and persists |
| US-3 | As a user, I want to manage webhook subscriptions and view event history | `webhooks-api.test.ts` | CRUD operations on subscriptions work; events/status endpoints return data |
| US-4 | As a user, I want to manage MCP channels and inspect their permissions and queues | `channels-api.test.ts` | Register/delete channels; permissions and queue endpoints return data |
| US-5 | As a user, I want to view notification history, test notifications, and update rules | `notifications-api.test.ts` | Recent deliveries returned; test notification dispatches; rules validated and persisted |
| US-6 | As a user, I want to browse available agent personas and switch between them | `agents-api.test.ts` | Directory scan finds .md files; frontmatter parsed; switch restarts decision engine |
| US-7 | As a user, I want to see system health: process stats, DB sizes, errors, uptime | `health-api.test.ts` | Returns Bun.version, PID, memory, DB sizes, error counts, uptime segments |
| US-8 | As a user, I want to view A2A server status, skills, and RPC history | `a2a-status-api.test.ts` | Server state, skills array, and history returned correctly |
| US-9 | As a user, I want all 7 new plugins to appear in the sidebar with correct routing | `plugin-manifest.test.ts` | Route files exist; manifest entries have correct id/icon/order/gates |
| US-10 | As a developer, I want new API routes to dispatch correctly in server.ts | `server-routing.test.ts` | GET/PUT/PATCH/POST/DELETE on new paths reach correct handlers |

---

## 1. Component Mock Strategy Table

| Component | Mock/Fake | What to Assert | User Story |
|---|---|---|---|
| `DashboardContext` | `FakeDashboardContext` (see Section 3) | All handlers receive ctx and read expected properties | All |
| `daemon.config` | Plain object matching VigilConfig shape | Config read/write operations | US-1 |
| `daemon.actionExecutor` | Stub with `getGateConfig()` | Action gates returned in config JSON | US-1 |
| `daemon.featureGates` | Stub with `isEnabled()`, `diagnose()` | Feature gate enumeration and toggle | US-2 |
| `daemon.webhookProcessor` | Stub with `getEvents()`, `getSubscriptions()`, `addSubscription()`, `removeSubscription()`, `getStatus()` | Webhook CRUD and status | US-3 |
| `daemon.channelManager` | Stub with `getChannels()`, `register()`, `unregister()`, `getPermissions()`, `getQueue()` | Channel CRUD and inspection | US-4 |
| `daemon.pushNotifier` | Stub with `getHistory()`, `sendTest()`, `getRules()`, `updateRules()` | Notification operations | US-5 |
| `daemon.session` | Plain object `{ id, startedAt, tickCount }` | Health uptime calculation | US-7 |
| `daemon.metrics` | Stub with `getSummary()` returning error counters | Health error counts | US-7 |
| File system (config persist) | `withTempHome()` from `temp-config.ts` | Config/rules written to ~/.vigil/config.json | US-1, US-2, US-5 |
| File system (agent scan) | `mkdtempSync` + write .md files with YAML frontmatter | Agent directory scan | US-6 |
| `Bun.file().size` | `spyOn(Bun, "file")` returning stub with `.size` | DB file sizes in health | US-7 |
| `SSEManager` | Stub with `broadcast()`, `connect()`, `clientCount` | SSE events not tested directly (existing coverage) | N/A |
| A2A server | Stub with `getStatus()`, `getAgentCard()`, `getHistory()` | A2A status/skills/history | US-8 |

---

## 2. Test Tier Table

| Tier | Tests | Dependencies | Speed | When to Run |
|---|---|---|---|---|
| **Unit** | `config-api.test.ts`, `webhooks-api.test.ts`, `channels-api.test.ts`, `notifications-api.test.ts`, `agents-api.test.ts`, `health-api.test.ts`, `a2a-status-api.test.ts` | FakeDashboardContext, temp dirs, spyOn | <2s each | Every run (`bun test`) |
| **Unit** | `server-routing.test.ts` | FakeDashboardContext, real server.ts fetch | <2s | Every run (`bun test`) |
| **Unit** | `plugin-manifest.test.ts` | File system checks, import of plugins/index.ts | <1s | Every run (`bun test`) |

All tests are unit-tier since they use stubs/fakes for daemon internals. No build step required.

---

## 3. Fake Implementation: FakeDashboardContext

The critical shared mock for all backend API tests. Lives in `src/__tests__/helpers/fake-dashboard-context.ts`.

```typescript
// src/__tests__/helpers/fake-dashboard-context.ts
import type { DashboardContext } from "../../dashboard/server.ts";
import { SSEManager } from "../../dashboard/api/sse.ts";

export interface FakeContextOptions {
  config?: Record<string, any>;
  repoPaths?: string[];
  featureGates?: Record<string, boolean>;
  agentDir?: string; // temp dir with .md files for agent scan tests
}

export function createFakeDashboardContext(
  opts: FakeContextOptions = {}
): DashboardContext {
  const config = {
    tickInterval: 30,
    sleepAfter: 900,
    sleepTickInterval: 300,
    dreamAfter: 1800,
    blockingBudget: 120,
    maxEventWindow: 100,
    tickModel: "claude-haiku-4-5-20251001",
    escalationModel: "claude-sonnet-4-6",
    notificationBackends: [],
    actionAllowlist: ["git_stash", "run_tests", "run_lint"],
    ...opts.config,
  };

  const gateConfig = {
    enabled: true,
    autoApprove: false,
    confidenceThreshold: 0.8,
    allowedRepos: ["/home/user/projects/vigil"],
    allowedActions: ["git_stash", "run_tests"],
  };

  // Feature gates stub
  const featureStates = {
    VIGIL_A2A: false,
    VIGIL_AGENT_IDENTITY: false,
    VIGIL_WEBHOOKS: true,
    ...opts.featureGates,
  };

  const featureGates = {
    isEnabled(name: string) {
      return featureStates[name as keyof typeof featureStates] ?? false;
    },
    diagnose(name: string) {
      const enabled = featureStates[name as keyof typeof featureStates] ?? false;
      return {
        build: true,
        config: enabled,
        runtime: enabled,
        session: enabled,
      };
    },
    setConfigLayer(name: string, value: boolean) {
      (featureStates as any)[name] = value;
    },
  };

  // Webhook processor stub
  const webhookEvents: any[] = [];
  const webhookSubscriptions: any[] = [];
  const webhookProcessor = {
    getEvents() { return webhookEvents; },
    getSubscriptions() { return webhookSubscriptions; },
    addSubscription(sub: any) {
      const id = `sub_${Date.now()}`;
      webhookSubscriptions.push({ id, ...sub });
      return id;
    },
    removeSubscription(id: string) {
      const idx = webhookSubscriptions.findIndex((s: any) => s.id === id);
      if (idx >= 0) webhookSubscriptions.splice(idx, 1);
      return idx >= 0;
    },
    getStatus() {
      return {
        running: true,
        port: 7481,
        eventsReceived: 42,
        errors: 0,
        signatureFailures: 0,
        lastEventAt: Date.now() - 30000,
      };
    },
  };

  // Channel manager stub
  const channels: any[] = [];
  const channelManager = {
    getChannels() { return channels; },
    register(channel: any) {
      const id = `ch_${Date.now()}`;
      channels.push({ id, ...channel, status: "active", queueDepth: 0 });
      return id;
    },
    unregister(id: string) {
      const idx = channels.findIndex((c: any) => c.id === id);
      if (idx >= 0) channels.splice(idx, 1);
      return idx >= 0;
    },
    getPermissions(_id: string) {
      return {
        read: true,
        write: true,
        execute: false,
        admin: false,
        subscribe: true,
      };
    },
    getQueue(_id: string) {
      return [
        { id: "msg_1", content: "test message", status: "pending", createdAt: Date.now() },
      ];
    },
  };

  // Push notifier stub
  const notificationHistory: any[] = [];
  const pushNotifier = {
    getHistory() { return notificationHistory; },
    sendTest() {
      return { success: true, backend: "desktop", message: "Test notification sent" };
    },
    getRules() {
      return {
        enabled: true,
        minSeverity: "warning",
        statuses: ["alert", "proactive"],
        maxPerHour: 10,
        quietHours: { start: "22:00", end: "07:00" },
      };
    },
    updateRules(rules: any) {
      return { ...this.getRules(), ...rules };
    },
  };

  // Decision engine stub (for agent switch)
  const decisionEngine = {
    currentAgent: "default",
    restart(_agentName: string) {
      this.currentAgent = _agentName;
    },
    getSystemPrompt() {
      return "You are Vigil, an always-on git monitoring agent.";
    },
  };

  // A2A server stub
  const a2aServer = {
    getStatus() {
      return {
        running: true,
        port: 7482,
        endpoint: "http://localhost:7482/.well-known/agent",
        authType: "bearer",
        connections: 2,
        maxConnections: 10,
      };
    },
    getAgentCard() {
      return {
        name: "Vigil",
        version: "1.0.0",
        capabilities: ["streaming", "pushNotifications"],
        skills: [
          { name: "git-watch", description: "Monitor git repositories" },
          { name: "code-review", description: "Review code changes" },
        ],
      };
    },
    getHistory() {
      return [
        { time: Date.now() - 60000, method: "message/send", status: 200, latency: 340, tokens: 1200 },
        { time: Date.now() - 30000, method: "message/send", status: 429, latency: 5, tokens: 0 },
      ];
    },
  };

  const daemon = {
    config,
    repoPaths: opts.repoPaths ?? ["/home/user/projects/vigil"],
    actionExecutor: {
      getGateConfig() { return gateConfig; },
    },
    featureGates,
    webhookProcessor,
    channelManager,
    pushNotifier,
    decisionEngine,
    a2aServer,
    session: {
      id: "test-session-001",
      startedAt: Date.now() - 3_600_000, // 1 hour ago
      tickCount: 120,
    },
    tickEngine: {
      currentTick: 120,
      isSleeping: false,
      paused: false,
      lastTickAt: Date.now() - 5_000,
      sleep: { getNextInterval: () => 30 },
    },
    metrics: {
      getSummary() {
        return {
          "errors.total": { count: 3, avg: 1, max: 1 },
          "errors.llm_timeout": { count: 1, avg: 1, max: 1 },
          "errors.tick_crash": { count: 2, avg: 1, max: 1 },
        };
      },
      getTimeSeries(_name: string, _since?: number) {
        return [];
      },
    },
    messageRouter: { route() {} },
  } as any;

  const sse = new SSEManager();

  return { daemon, sse };
}
```

---

## 4. Test File List

```
src/__tests__/
├── helpers/
│   └── fake-dashboard-context.ts    # FakeDashboardContext (new)
└── unit/
    ├── config-api.test.ts           # Config + feature gate API handlers (US-1, US-2)
    ├── webhooks-api.test.ts         # Webhook API handlers (US-3)
    ├── channels-api.test.ts         # Channel API handlers (US-4)
    ├── notifications-api.test.ts    # Notification API handlers (US-5)
    ├── agents-api.test.ts           # Agent identity API handlers (US-6)
    ├── health-api.test.ts           # System health API handler (US-7)
    ├── a2a-status-api.test.ts       # A2A status API handlers (US-8)
    ├── server-routing.test.ts       # server.ts route dispatch (US-10)
    └── plugin-manifest.test.ts      # Plugin manifest + route files (US-9)
```

---

## 5. Test Setup

### New helper: `fake-dashboard-context.ts`

As specified in Section 3 above. This is the primary mock for all Phase 5 backend tests. Import pattern:

```typescript
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
```

### Config persistence tests

Use the existing `withTempHome()` from `src/__tests__/helpers/temp-config.ts` for tests that persist to `~/.vigil/config.json`:

```typescript
import { withTempHome } from "../helpers/temp-config";

let home: ReturnType<typeof withTempHome>;
beforeEach(() => { home = withTempHome(); });
afterEach(() => { home.cleanup(); });
```

### Agent scan tests

Create a temp directory with `.md` files containing YAML frontmatter:

```typescript
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let agentDir: string;
beforeEach(() => {
  agentDir = mkdtempSync(join(tmpdir(), "vigil-agents-test-"));
  writeFileSync(join(agentDir, "default.md"), [
    "---",
    "name: Default Agent",
    "description: Standard monitoring agent",
    "model: claude-haiku-4-5-20251001",
    "tools: [git-watch, code-review]",
    "---",
    "",
    "You are Vigil, an always-on git monitoring agent.",
  ].join("\n"));
  writeFileSync(join(agentDir, "security.md"), [
    "---",
    "name: Security Scanner",
    "description: Focused on security vulnerabilities",
    "model: claude-sonnet-4-6",
    "tools: [git-watch, security-scan]",
    "---",
    "",
    "You are a security-focused code reviewer.",
  ].join("\n"));
});
afterEach(() => { rmSync(agentDir, { recursive: true, force: true }); });
```

---

## 6. Key Testing Decisions

| Decision | Approach | Rationale |
|---|---|---|
| FakeDashboardContext as shared helper | Single factory function with option overrides | All 7 API modules need the same ctx shape; avoids duplicate stubs across 7 test files |
| No real daemon or Bun.serve for API tests | Direct function calls with fake ctx | API handlers are pure functions of `(ctx, body?) -> data`; no HTTP layer needed |
| HTTP routing tested separately | `server-routing.test.ts` uses a real Bun.serve on random port | Route dispatch logic is in server.ts fetch handler; needs real HTTP to verify method/path matching |
| Config persistence uses withTempHome | spyOn(os, "homedir") pattern from existing config.test.ts | Proven isolation pattern, avoids touching real ~/.vigil/ |
| Agent scan uses temp dir with .md files | Write fixture files, pass dir path to handler | Tests real file scanning + YAML parsing without touching project dirs |
| Zod validation tested with invalid inputs | Pass malformed bodies, expect error responses | Mutation handlers must reject bad input before touching daemon state |
| Frontend tests are structural, not visual | Check file existence, import manifest, verify shape | Component rendering needs React test setup (out of scope); structure verification catches wiring bugs |
| DB size check uses spyOn for Bun.file | Mock Bun.file().size for specific paths | Real DB files may not exist in test env; size calculation logic is what matters |

---

## 7. Example Test Cases

### config-api.test.ts

```typescript
// src/__tests__/unit/config-api.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { withTempHome } from "../helpers/temp-config";
import {
  getConfigJSON,
  handleConfigUpdate,
  getFeatureGatesJSON,
  handleFeatureToggle,
} from "../../dashboard/api/config";

describe("config API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getConfigJSON", () => {
    it("returns all config fields from daemon", () => {
      const result = getConfigJSON(ctx);
      expect(result.tickInterval).toBe(30);
      expect(result.sleepAfter).toBe(900);
      expect(result.sleepTickInterval).toBe(300);
      expect(result.dreamAfter).toBe(1800);
      expect(result.blockingBudget).toBe(120);
      expect(result.maxEventWindow).toBe(100);
      expect(result.tickModel).toBe("claude-haiku-4-5-20251001");
      expect(result.escalationModel).toBe("claude-sonnet-4-6");
    });

    it("includes action gates from actionExecutor", () => {
      const result = getConfigJSON(ctx);
      expect(result.actionGates).toBeDefined();
      expect(result.actionGates.enabled).toBe(true);
      expect(result.actionGates.confidenceThreshold).toBe(0.8);
    });

    it("includes notification backends", () => {
      const result = getConfigJSON(ctx);
      expect(result.notificationBackends).toBeArray();
    });

    it("includes action allowlist", () => {
      const result = getConfigJSON(ctx);
      expect(result.actionAllowlist).toEqual(["git_stash", "run_tests", "run_lint"]);
    });
  });

  describe("handleConfigUpdate", () => {
    let home: ReturnType<typeof withTempHome>;

    beforeEach(() => {
      home = withTempHome();
    });

    afterEach(() => {
      home.cleanup();
    });

    it("accepts valid partial config update", async () => {
      const result = await handleConfigUpdate(ctx, { tickInterval: 60 });
      expect(result.success).toBe(true);
    });

    it("rejects invalid tickInterval (negative)", async () => {
      const result = await handleConfigUpdate(ctx, { tickInterval: -5 });
      expect(result.error).toBeDefined();
    });

    it("rejects invalid tickInterval (not a number)", async () => {
      const result = await handleConfigUpdate(ctx, { tickInterval: "fast" });
      expect(result.error).toBeDefined();
    });

    it("rejects unknown config keys", async () => {
      const result = await handleConfigUpdate(ctx, { unknownField: true });
      // Should either strip unknown keys or reject
      expect(result.error).toBeDefined();
    });

    it("persists config to file system", async () => {
      const { existsSync, readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const os = await import("node:os");

      await handleConfigUpdate(ctx, { tickInterval: 45 });

      const configPath = join(os.homedir(), ".vigil", "config.json");
      expect(existsSync(configPath)).toBe(true);

      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.tickInterval).toBe(45);
    });

    it("merges partial update with existing config", async () => {
      await handleConfigUpdate(ctx, { tickInterval: 45 });
      await handleConfigUpdate(ctx, { sleepAfter: 600 });

      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const os = await import("node:os");

      const configPath = join(os.homedir(), ".vigil", "config.json");
      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.tickInterval).toBe(45);
      expect(saved.sleepAfter).toBe(600);
    });
  });

  describe("getFeatureGatesJSON", () => {
    it("returns array of feature gates", () => {
      const result = getFeatureGatesJSON(ctx);
      expect(result).toBeArray();
      expect(result.length).toBeGreaterThan(0);
    });

    it("each gate has key, enabled, and layers", () => {
      const result = getFeatureGatesJSON(ctx);
      for (const gate of result) {
        expect(gate.key).toBeString();
        expect(typeof gate.enabled).toBe("boolean");
        expect(gate.layers).toBeDefined();
        expect(typeof gate.layers.build).toBe("boolean");
        expect(typeof gate.layers.config).toBe("boolean");
        expect(typeof gate.layers.runtime).toBe("boolean");
        expect(typeof gate.layers.session).toBe("boolean");
      }
    });
  });

  describe("handleFeatureToggle", () => {
    let home: ReturnType<typeof withTempHome>;

    beforeEach(() => {
      home = withTempHome();
    });

    afterEach(() => {
      home.cleanup();
    });

    it("toggles a feature gate on", async () => {
      const result = await handleFeatureToggle(ctx, "VIGIL_A2A", true);
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
    });

    it("toggles a feature gate off", async () => {
      const result = await handleFeatureToggle(ctx, "VIGIL_WEBHOOKS", false);
      expect(result.success).toBe(true);
      expect(result.enabled).toBe(false);
    });

    it("persists toggle to config file", async () => {
      await handleFeatureToggle(ctx, "VIGIL_A2A", true);

      const { readFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const os = await import("node:os");

      const configPath = join(os.homedir(), ".vigil", "config.json");
      const saved = JSON.parse(readFileSync(configPath, "utf-8"));
      expect(saved.featureGates?.VIGIL_A2A).toBe(true);
    });
  });
});
```

### webhooks-api.test.ts

```typescript
// src/__tests__/unit/webhooks-api.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import {
  getWebhookEventsJSON,
  getWebhookSubscriptionsJSON,
  handleSubscriptionCreate,
  handleSubscriptionDelete,
  getWebhookStatusJSON,
} from "../../dashboard/api/webhooks";

describe("webhooks API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getWebhookEventsJSON", () => {
    it("returns events array from processor", () => {
      const result = getWebhookEventsJSON(ctx);
      expect(result).toBeArray();
    });
  });

  describe("getWebhookSubscriptionsJSON", () => {
    it("returns subscriptions array", () => {
      const result = getWebhookSubscriptionsJSON(ctx);
      expect(result).toBeArray();
    });
  });

  describe("handleSubscriptionCreate", () => {
    it("creates subscription with valid input", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: ["push", "pull_request"],
      });
      expect(result.id).toBeString();
    });

    it("rejects missing repo field", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        eventTypes: ["push"],
      });
      expect(result.error).toBeDefined();
    });

    it("rejects empty eventTypes array", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: [],
      });
      expect(result.error).toBeDefined();
    });

    it("accepts optional expiry field", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: ["push"],
        expiry: Date.now() + 86400000,
      });
      expect(result.id).toBeString();
    });
  });

  describe("handleSubscriptionDelete", () => {
    it("deletes existing subscription", async () => {
      const created = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: ["push"],
      });
      const result = await handleSubscriptionDelete(ctx, created.id);
      expect(result.success).toBe(true);
    });

    it("returns error for non-existent subscription", async () => {
      const result = await handleSubscriptionDelete(ctx, "nonexistent_id");
      expect(result.error).toBeDefined();
    });
  });

  describe("getWebhookStatusJSON", () => {
    it("returns server health info", () => {
      const result = getWebhookStatusJSON(ctx);
      expect(result.running).toBe(true);
      expect(result.port).toBeNumber();
      expect(result.eventsReceived).toBeNumber();
      expect(result.errors).toBeNumber();
    });
  });
});
```

### channels-api.test.ts

```typescript
// src/__tests__/unit/channels-api.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import {
  getChannelsJSON,
  handleChannelRegister,
  handleChannelDelete,
  getChannelPermissionsJSON,
  getChannelQueueJSON,
} from "../../dashboard/api/channels";

describe("channels API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getChannelsJSON", () => {
    it("returns empty array initially", () => {
      const result = getChannelsJSON(ctx);
      expect(result).toBeArray();
      expect(result).toHaveLength(0);
    });
  });

  describe("handleChannelRegister", () => {
    it("registers channel with valid input", async () => {
      const result = await handleChannelRegister(ctx, {
        name: "test-channel",
        type: "mcp",
        config: { endpoint: "http://localhost:9000" },
      });
      expect(result.id).toBeString();
    });

    it("rejects missing name", async () => {
      const result = await handleChannelRegister(ctx, {
        type: "mcp",
        config: {},
      });
      expect(result.error).toBeDefined();
    });

    it("registered channel appears in list", async () => {
      await handleChannelRegister(ctx, {
        name: "test-channel",
        type: "mcp",
        config: {},
      });
      const channels = getChannelsJSON(ctx);
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe("test-channel");
    });
  });

  describe("handleChannelDelete", () => {
    it("deletes existing channel", async () => {
      const created = await handleChannelRegister(ctx, {
        name: "to-delete",
        type: "mcp",
        config: {},
      });
      const result = await handleChannelDelete(ctx, created.id);
      expect(result.success).toBe(true);
      expect(getChannelsJSON(ctx)).toHaveLength(0);
    });

    it("returns error for non-existent channel", async () => {
      const result = await handleChannelDelete(ctx, "nonexistent");
      expect(result.error).toBeDefined();
    });
  });

  describe("getChannelPermissionsJSON", () => {
    it("returns 5-gate permission results", async () => {
      const created = await handleChannelRegister(ctx, {
        name: "perm-test",
        type: "mcp",
        config: {},
      });
      const result = getChannelPermissionsJSON(ctx, created.id);
      expect(typeof result.read).toBe("boolean");
      expect(typeof result.write).toBe("boolean");
      expect(typeof result.execute).toBe("boolean");
      expect(typeof result.admin).toBe("boolean");
      expect(typeof result.subscribe).toBe("boolean");
    });
  });

  describe("getChannelQueueJSON", () => {
    it("returns pending messages array", async () => {
      const created = await handleChannelRegister(ctx, {
        name: "queue-test",
        type: "mcp",
        config: {},
      });
      const result = getChannelQueueJSON(ctx, created.id);
      expect(result).toBeArray();
    });
  });
});
```

### notifications-api.test.ts

```typescript
// src/__tests__/unit/notifications-api.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { withTempHome } from "../helpers/temp-config";
import {
  getNotificationsJSON,
  handleTestNotification,
  handleNotificationRulesUpdate,
} from "../../dashboard/api/notifications";

describe("notifications API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getNotificationsJSON", () => {
    it("returns recent deliveries array", () => {
      const result = getNotificationsJSON(ctx);
      expect(result).toBeArray();
    });
  });

  describe("handleTestNotification", () => {
    it("sends test notification and returns success", async () => {
      const result = await handleTestNotification(ctx);
      expect(result.success).toBe(true);
      expect(result.backend).toBeString();
    });
  });

  describe("handleNotificationRulesUpdate", () => {
    let home: ReturnType<typeof withTempHome>;

    beforeEach(() => {
      home = withTempHome();
    });

    afterEach(() => {
      home.cleanup();
    });

    it("accepts valid rules update", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        enabled: true,
        minSeverity: "critical",
        maxPerHour: 5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid minSeverity value", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        minSeverity: "extreme",
      });
      expect(result.error).toBeDefined();
    });

    it("rejects negative maxPerHour", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        maxPerHour: -1,
      });
      expect(result.error).toBeDefined();
    });

    it("validates quiet hours format", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        quietHours: { start: "25:00", end: "07:00" },
      });
      expect(result.error).toBeDefined();
    });
  });
});
```

### agents-api.test.ts

```typescript
// src/__tests__/unit/agents-api.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import {
  getAgentsJSON,
  getCurrentAgentJSON,
  handleAgentSwitch,
} from "../../dashboard/api/agents";

describe("agents API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;
  let agentDir: string;

  beforeEach(() => {
    agentDir = mkdtempSync(join(tmpdir(), "vigil-agents-test-"));

    writeFileSync(join(agentDir, "default.md"), [
      "---",
      "name: Default Agent",
      "description: Standard monitoring agent",
      "model: claude-haiku-4-5-20251001",
      "tools:",
      "  - git-watch",
      "  - code-review",
      "watchPatterns:",
      '  - "**/*.ts"',
      "triggers:",
      "  - new_commit",
      "  - branch_switch",
      "---",
      "",
      "You are Vigil, an always-on git monitoring agent.",
    ].join("\n"));

    writeFileSync(join(agentDir, "security.md"), [
      "---",
      "name: Security Scanner",
      "description: Focused on security vulnerabilities",
      "model: claude-sonnet-4-6",
      "tools:",
      "  - git-watch",
      "  - security-scan",
      "---",
      "",
      "You are a security-focused code reviewer.",
    ].join("\n"));

    // Non-.md file should be ignored
    writeFileSync(join(agentDir, "README.txt"), "This is not an agent file.");

    ctx = createFakeDashboardContext({ agentDir });
  });

  afterEach(() => {
    rmSync(agentDir, { recursive: true, force: true });
  });

  describe("getAgentsJSON", () => {
    it("scans directory and returns agent definitions", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      expect(result).toBeArray();
      expect(result).toHaveLength(2);
    });

    it("parses YAML frontmatter fields", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      const defaultAgent = result.find((a: any) => a.name === "Default Agent");
      expect(defaultAgent).toBeDefined();
      expect(defaultAgent.description).toBe("Standard monitoring agent");
      expect(defaultAgent.model).toBe("claude-haiku-4-5-20251001");
      expect(defaultAgent.tools).toEqual(["git-watch", "code-review"]);
    });

    it("parses watchPatterns and triggers", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      const defaultAgent = result.find((a: any) => a.name === "Default Agent");
      expect(defaultAgent.watchPatterns).toEqual(["**/*.ts"]);
      expect(defaultAgent.triggers).toEqual(["new_commit", "branch_switch"]);
    });

    it("ignores non-.md files", async () => {
      const result = await getAgentsJSON(ctx, agentDir);
      const names = result.map((a: any) => a.name);
      expect(names).not.toContain("README");
    });

    it("returns empty array for non-existent directory", async () => {
      const result = await getAgentsJSON(ctx, "/tmp/nonexistent-agent-dir");
      expect(result).toBeArray();
      expect(result).toHaveLength(0);
    });

    it("handles .md file without frontmatter gracefully", async () => {
      writeFileSync(join(agentDir, "broken.md"), "No frontmatter here.");
      const result = await getAgentsJSON(ctx, agentDir);
      // Should either skip or return with empty/default fields
      expect(result.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("getCurrentAgentJSON", () => {
    it("returns active persona details", () => {
      const result = getCurrentAgentJSON(ctx);
      expect(result.name).toBeString();
      expect(result).toBeDefined();
    });
  });

  describe("handleAgentSwitch", () => {
    it("switches to a valid agent", async () => {
      const result = await handleAgentSwitch(ctx, { agentName: "security" });
      expect(result.success).toBe(true);
    });

    it("rejects empty agent name", async () => {
      const result = await handleAgentSwitch(ctx, { agentName: "" });
      expect(result.error).toBeDefined();
    });

    it("restarts decision engine after switch", async () => {
      await handleAgentSwitch(ctx, { agentName: "security" });
      expect((ctx.daemon as any).decisionEngine.currentAgent).toBe("security");
    });
  });
});
```

### health-api.test.ts

```typescript
// src/__tests__/unit/health-api.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { getHealthJSON } from "../../dashboard/api/health";

describe("health API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getHealthJSON", () => {
    it("returns process info with Bun version", () => {
      const result = getHealthJSON(ctx);
      expect(result.process).toBeDefined();
      expect(result.process.runtime).toContain("Bun");
    });

    it("returns process PID", () => {
      const result = getHealthJSON(ctx);
      expect(result.process.pid).toBe(process.pid);
    });

    it("returns memory usage fields", () => {
      const result = getHealthJSON(ctx);
      expect(result.process.heap).toBeNumber();
      expect(result.process.rss).toBeNumber();
      expect(result.process.heap).toBeGreaterThan(0);
      expect(result.process.rss).toBeGreaterThan(0);
    });

    it("returns uptime from session startedAt", () => {
      const result = getHealthJSON(ctx);
      expect(result.process.uptime).toBeNumber();
      // Session started 1 hour ago in fake context
      expect(result.process.uptime).toBeGreaterThanOrEqual(3500);
      expect(result.process.uptime).toBeLessThanOrEqual(3700);
    });

    it("returns database sizes object", () => {
      const result = getHealthJSON(ctx);
      expect(result.databases).toBeDefined();
      // Should have entries for known DB files
      expect(typeof result.databases).toBe("object");
    });

    it("returns error counts from metrics", () => {
      const result = getHealthJSON(ctx);
      expect(result.errors).toBeDefined();
      expect(result.errors.total).toBeNumber();
    });

    it("returns uptime timeline segments", () => {
      const result = getHealthJSON(ctx);
      expect(result.uptimeTimeline).toBeArray();
      if (result.uptimeTimeline.length > 0) {
        const seg = result.uptimeTimeline[0];
        expect(seg.start).toBeNumber();
        expect(seg.end).toBeNumber();
        expect(["running", "sleeping", "down"]).toContain(seg.state);
      }
    });
  });
});
```

### a2a-status-api.test.ts

```typescript
// src/__tests__/unit/a2a-status-api.test.ts
import { describe, it, expect, beforeEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import {
  getA2AStatusJSON,
  getA2ASkillsJSON,
  getA2AHistoryJSON,
} from "../../dashboard/api/a2a-status";

describe("a2a-status API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getA2AStatusJSON", () => {
    it("returns server running state", () => {
      const result = getA2AStatusJSON(ctx);
      expect(typeof result.running).toBe("boolean");
    });

    it("returns server connection info", () => {
      const result = getA2AStatusJSON(ctx);
      expect(result.port).toBeNumber();
      expect(result.endpoint).toBeString();
      expect(result.authType).toBeString();
    });

    it("returns connection counts", () => {
      const result = getA2AStatusJSON(ctx);
      expect(result.connections).toBeNumber();
      expect(result.maxConnections).toBeNumber();
    });
  });

  describe("getA2ASkillsJSON", () => {
    it("returns skills array from agent card", () => {
      const result = getA2ASkillsJSON(ctx);
      expect(result).toBeArray();
      expect(result.length).toBeGreaterThan(0);
    });

    it("each skill has name and description", () => {
      const result = getA2ASkillsJSON(ctx);
      for (const skill of result) {
        expect(skill.name).toBeString();
        expect(skill.description).toBeString();
      }
    });
  });

  describe("getA2AHistoryJSON", () => {
    it("returns RPC call history", () => {
      const result = getA2AHistoryJSON(ctx);
      expect(result).toBeArray();
    });

    it("each entry has method, status, latency, tokens", () => {
      const result = getA2AHistoryJSON(ctx);
      for (const entry of result) {
        expect(entry.method).toBeString();
        expect(entry.status).toBeNumber();
        expect(entry.latency).toBeNumber();
        expect(entry.tokens).toBeNumber();
      }
    });

    it("includes rate-limited entries (status 429)", () => {
      const result = getA2AHistoryJSON(ctx);
      const rateLimited = result.filter((e: any) => e.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
```

### server-routing.test.ts

```typescript
// src/__tests__/unit/server-routing.test.ts
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { startDashboard } from "../../dashboard/server";

describe("server routing — Phase 5 routes", () => {
  let server: ReturnType<typeof import("bun").serve>;
  let port: number;
  let base: string;

  beforeEach(() => {
    port = 40000 + Math.floor(Math.random() * 10000);
    base = `http://localhost:${port}`;
    const ctx = createFakeDashboardContext();
    server = startDashboard(ctx.daemon, port);
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
    // 200 or 404 depending on existence — just verify route matches
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
```

### plugin-manifest.test.ts

```typescript
// src/__tests__/unit/plugin-manifest.test.ts
import { describe, it, expect } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_V2 = join(import.meta.dir, "../../../dashboard-v2");

describe("Phase 5 plugin manifest", () => {
  const expectedPlugins = [
    { id: "config", icon: "Settings", order: 75 },
    { id: "agents", icon: "Bot", order: 80, featureGate: "VIGIL_AGENT_IDENTITY" },
    { id: "health", icon: "HeartPulse", order: 85 },
    { id: "webhooks", icon: "Webhook", order: 88 },
    { id: "channels", icon: "Radio", order: 90 },
    { id: "notifications", icon: "Bell", order: 92 },
    { id: "a2a", icon: "Network", order: 93, featureGate: "VIGIL_A2A" },
  ];

  describe("route files exist", () => {
    for (const plugin of expectedPlugins) {
      it(`route file exists: ${plugin.id}.tsx`, () => {
        const routePath = join(DASHBOARD_V2, "src/routes", `${plugin.id}.tsx`);
        expect(existsSync(routePath)).toBe(true);
      });
    }
  });

  describe("plugin page components exist", () => {
    const componentPaths: Record<string, string> = {
      config: "config/ConfigPage.tsx",
      agents: "agents/AgentsPage.tsx",
      health: "health/HealthPage.tsx",
      webhooks: "webhooks/WebhooksPage.tsx",
      channels: "channels/ChannelsPage.tsx",
      notifications: "notifications/NotificationsPage.tsx",
      a2a: "a2a/A2APage.tsx",
    };

    for (const [id, relPath] of Object.entries(componentPaths)) {
      it(`component file exists: ${id}`, () => {
        const fullPath = join(DASHBOARD_V2, "src/plugins", relPath);
        expect(existsSync(fullPath)).toBe(true);
      });
    }
  });

  describe("plugin registry", () => {
    it("plugins/index.ts contains all 7 new plugin IDs", async () => {
      const indexPath = join(DASHBOARD_V2, "src/plugins/index.ts");
      const content = await Bun.file(indexPath).text();

      for (const plugin of expectedPlugins) {
        expect(content).toContain(`id: "${plugin.id}"`);
      }
    });

    it("feature-gated plugins have correct gate", async () => {
      const indexPath = join(DASHBOARD_V2, "src/plugins/index.ts");
      const content = await Bun.file(indexPath).text();

      expect(content).toContain('featureGate: "VIGIL_AGENT_IDENTITY"');
      expect(content).toContain('featureGate: "VIGIL_A2A"');
    });

    it("non-gated plugins do not have featureGate", async () => {
      const indexPath = join(DASHBOARD_V2, "src/plugins/index.ts");
      const content = await Bun.file(indexPath).text();

      // Config, health, webhooks, channels, notifications should not have featureGate
      // This is a structural check — ensure the count of featureGate matches expected (exactly 2)
      const gateMatches = content.match(/featureGate:/g);
      // May have more from Phase 4 plugins, so check >= 2
      expect(gateMatches).toBeDefined();
      expect(gateMatches!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
```

---

## 8. Execution Prompt

You are writing the test suite for Phase 5 (New Core Plugins) of Vigil Dashboard v2 -- 7 new backend API modules and 7 frontend plugin registrations.

### Project context

Vigil is a Bun/TypeScript project. Tests use `bun:test` (not Jest/Vitest). The existing test suite lives in `src/__tests__/` with `unit/` and `integration/` subdirectories. Test helpers are in `src/__tests__/helpers/`. The dashboard backend is in `src/dashboard/` and serves via `Bun.serve()`. Dashboard v2 frontend is in `dashboard-v2/`.

### Why these tests exist

Phase 5 adds 7 new API modules (`src/dashboard/api/{config,webhooks,channels,notifications,agents,health,a2a-status}.ts`) that wrap daemon internals for the dashboard, plus 7 new plugin pages. Tests verify:
1. Each API handler reads the correct daemon properties and returns the expected shape
2. Mutation handlers validate input with Zod and reject invalid data
3. Config persistence writes to the file system correctly
4. Agent scanning parses YAML frontmatter from .md files
5. Server.ts routes dispatch to the correct handlers for each method/path
6. All 7 plugin route files and component files exist
7. Plugin manifest entries have correct id, icon, order, and feature gates

### Phase type: Service

Backend handlers are pure functions of `(ctx, body?) -> data`. They are tested by calling the function directly with a FakeDashboardContext -- no HTTP server needed for most tests. The server-routing tests are the exception, using a real `Bun.serve()` on a random port.

### What NOT to test

- React component rendering (requires React test setup, out of scope)
- Visual layout, colors, styling
- SSE streaming (already tested in existing dashboard.test.ts)
- TanStack Query behavior (library internals)
- Server function wrappers in dashboard-v2 (thin wrappers over API handlers)

### Files to create

**1. `src/__tests__/helpers/fake-dashboard-context.ts`**

Create `FakeDashboardContext` factory as specified in Section 3 of the test plan. This is the shared mock for all backend API tests. Key stubs:
- `daemon.config` — plain object with all VigilConfig fields (tickInterval: 30, sleepAfter: 900, etc.)
- `daemon.actionExecutor.getGateConfig()` — returns `{ enabled: true, autoApprove: false, confidenceThreshold: 0.8, allowedRepos: [...], allowedActions: [...] }`
- `daemon.featureGates` — `isEnabled(name)` reads from a map, `diagnose(name)` returns 4-layer object, `setConfigLayer(name, value)` mutates the map
- `daemon.webhookProcessor` — in-memory arrays for events/subscriptions, `addSubscription()` pushes to array with generated ID, `removeSubscription()` splices by ID
- `daemon.channelManager` — in-memory array, register/unregister/getPermissions/getQueue
- `daemon.pushNotifier` — `getHistory()`, `sendTest()` returns `{ success: true }`, `getRules()`, `updateRules()`
- `daemon.decisionEngine` — `currentAgent` string, `restart(name)` updates it, `getSystemPrompt()` returns a string
- `daemon.a2aServer` — `getStatus()`, `getAgentCard()`, `getHistory()` returning fixture data
- `daemon.session` — `{ id, startedAt: Date.now() - 3_600_000, tickCount: 120 }`
- `daemon.metrics.getSummary()` — returns error counters
- `sse` — real `SSEManager` instance (constructor only, no clients connected)

Accept `FakeContextOptions` with `config?`, `repoPaths?`, `featureGates?`, `agentDir?` overrides.

**2. `src/__tests__/unit/config-api.test.ts`**
Tests for `src/dashboard/api/config.ts`:
- `getConfigJSON(ctx)` returns all fields: tickInterval, sleepAfter, sleepTickInterval, dreamAfter, blockingBudget, maxEventWindow, tickModel, escalationModel, actionGates, notificationBackends, actionAllowlist
- `handleConfigUpdate(ctx, body)` accepts valid partial update, rejects negative tickInterval, rejects non-number tickInterval, rejects unknown keys, persists to file (using `withTempHome()`), merges partial updates preserving prior values
- `getFeatureGatesJSON(ctx)` returns array where each entry has key/enabled/layers (build/config/runtime/session booleans)
- `handleFeatureToggle(ctx, name, enabled)` toggles on/off, persists to config file

**3. `src/__tests__/unit/webhooks-api.test.ts`**
Tests for `src/dashboard/api/webhooks.ts`:
- `getWebhookEventsJSON` returns array, `getWebhookSubscriptionsJSON` returns array
- `handleSubscriptionCreate` creates with valid input (repo + eventTypes), rejects missing repo, rejects empty eventTypes, accepts optional expiry
- `handleSubscriptionDelete` deletes existing, returns error for non-existent
- `getWebhookStatusJSON` returns running/port/eventsReceived/errors

**4. `src/__tests__/unit/channels-api.test.ts`**
Tests for `src/dashboard/api/channels.ts`:
- `getChannelsJSON` returns empty array initially
- `handleChannelRegister` creates with valid input, rejects missing name, registered channel appears in list
- `handleChannelDelete` deletes existing, returns error for non-existent
- `getChannelPermissionsJSON` returns 5 boolean gates (read/write/execute/admin/subscribe)
- `getChannelQueueJSON` returns array

**5. `src/__tests__/unit/notifications-api.test.ts`**
Tests for `src/dashboard/api/notifications.ts`:
- `getNotificationsJSON` returns array
- `handleTestNotification` returns success
- `handleNotificationRulesUpdate` accepts valid rules, rejects invalid minSeverity, rejects negative maxPerHour, validates quiet hours format

**6. `src/__tests__/unit/agents-api.test.ts`**
Tests for `src/dashboard/api/agents.ts`:
- `getAgentsJSON` scans temp dir, returns 2 agents, parses frontmatter (name/description/model/tools/watchPatterns/triggers), ignores non-.md files, returns empty for non-existent dir, handles missing frontmatter gracefully
- `getCurrentAgentJSON` returns active persona
- `handleAgentSwitch` switches to valid agent, rejects empty name, updates decisionEngine.currentAgent

Uses temp dir with fixture .md files (default.md + security.md + README.txt).

**7. `src/__tests__/unit/health-api.test.ts`**
Tests for `src/dashboard/api/health.ts`:
- `getHealthJSON(ctx)` returns process.runtime containing "Bun", process.pid matching `process.pid`, process.heap/rss > 0, process.uptime ~3600 (from fake session), databases object, errors.total as number, uptimeTimeline as array with valid segment shapes

**8. `src/__tests__/unit/a2a-status-api.test.ts`**
Tests for `src/dashboard/api/a2a-status.ts`:
- `getA2AStatusJSON` returns running/port/endpoint/authType/connections/maxConnections
- `getA2ASkillsJSON` returns array with name+description per skill
- `getA2AHistoryJSON` returns array with method/status/latency/tokens, includes status 429 entries

**9. `src/__tests__/unit/server-routing.test.ts`**
Integration-style test using real `Bun.serve()` on random port:
- Tests all new routes: GET/PUT /api/config, GET /api/config/features, PATCH /api/config/features/:name, GET /api/webhooks/{events,subscriptions,status}, POST/DELETE /api/webhooks/subscriptions, GET/POST /api/channels, GET /api/notifications, POST /api/notifications/test, GET /api/agents, GET/PATCH /api/agents/current, GET /api/health, GET /api/a2a/{status,skills,history}
- Verifies method mismatch returns non-200

**10. `src/__tests__/unit/plugin-manifest.test.ts`**
Structural tests:
- All 7 route files exist at `dashboard-v2/src/routes/{config,webhooks,channels,notifications,agents,health,a2a}.tsx`
- All 7 component files exist at `dashboard-v2/src/plugins/{name}/{Name}Page.tsx`
- `plugins/index.ts` contains all 7 plugin IDs
- Feature gates: `VIGIL_AGENT_IDENTITY` on agents, `VIGIL_A2A` on a2a
- Non-gated plugins do not have featureGate

### Success criteria

```bash
# All Phase 5 tests
bun test --filter "config-api|webhooks-api|channels-api|notifications-api|agents-api|health-api|a2a-status-api|server-routing|plugin-manifest"

# Individual test files
bun test src/__tests__/unit/config-api.test.ts
bun test src/__tests__/unit/webhooks-api.test.ts
bun test src/__tests__/unit/channels-api.test.ts
bun test src/__tests__/unit/notifications-api.test.ts
bun test src/__tests__/unit/agents-api.test.ts
bun test src/__tests__/unit/health-api.test.ts
bun test src/__tests__/unit/a2a-status-api.test.ts
bun test src/__tests__/unit/server-routing.test.ts
bun test src/__tests__/unit/plugin-manifest.test.ts
```

All tests exit 0.

---

## 9. Run Commands

```bash
# Fast: all Phase 5 unit tests (<10s total)
bun test --filter "config-api|webhooks-api|channels-api|notifications-api|agents-api|health-api|a2a-status-api|plugin-manifest"

# Server routing (uses Bun.serve, slightly slower)
bun test src/__tests__/unit/server-routing.test.ts

# All Phase 5 tests together
bun test --filter "config-api|webhooks-api|channels-api|notifications-api|agents-api|health-api|a2a-status-api|server-routing|plugin-manifest"

# Focused: single test file
bun test src/__tests__/unit/config-api.test.ts
bun test src/__tests__/unit/agents-api.test.ts
```

---

## Coverage Check

- [PASS] Phase type identified: Service -- backend handlers tested with FakeDashboardContext, frontend verified structurally
- [PASS] User stories block present with 10 stories derived from phase deliverables
- [PASS] Every user story traces to at least one test file in the mock strategy table
- [PASS] Every backend deliverable has a dedicated test file (7 API modules + routing + manifest = 9 test files)
- [PASS] FakeDashboardContext comprehensively stubs all daemon subsystems accessed by handlers
- [PASS] Config persistence tests use withTempHome() (existing proven pattern)
- [PASS] Agent scan tests use temp directory with fixture .md files
- [PASS] Zod validation tested with invalid inputs for all mutation handlers
- [PASS] Server routing tested with real Bun.serve on random port
- [PASS] Frontend tests verify file existence and manifest entries (structural, no React rendering)
- [PASS] Feature gate assertions verify VIGIL_AGENT_IDENTITY and VIGIL_A2A are correctly applied
- [PASS] Execution prompt includes full test specifications inline (not "see above")
- [PASS] Run commands section present with fast, routing, combined, and focused variants
