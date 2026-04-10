import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_GATE_CONFIG } from "../../core/config.ts";

// We need to re-import config functions fresh for each test since they use homedir()
// at call time, so spying on os.homedir works.

describe("config", () => {
  let tmpDir: string;
  let homedirSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-config-test-"));
    homedirSpy = spyOn(os, "homedir").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    homedirSpy.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns all defaults when no config file", async () => {
    const { loadConfig } = await import("../../core/config.ts");
    const config = loadConfig();
    expect(config.tickInterval).toBe(30);
    expect(config.blockingBudget).toBe(120);
    expect(config.sleepAfter).toBe(900);
    expect(config.sleepTickInterval).toBe(300);
    expect(config.dreamAfter).toBe(1800);
    expect(config.tickModel).toBe("claude-haiku-4-5-20251001");
    expect(config.escalationModel).toBe("claude-sonnet-4-6");
    expect(config.maxEventWindow).toBe(100);
  });

  it("partial config merges with defaults", async () => {
    const { getConfigDir, loadConfig } = await import("../../core/config.ts");
    const dir = getConfigDir();
    writeFileSync(join(dir, "config.json"), JSON.stringify({ tickInterval: 60 }));
    const config = loadConfig();
    expect(config.tickInterval).toBe(60);
    expect(config.blockingBudget).toBe(120); // default
  });

  it("malformed JSON falls back to defaults", async () => {
    const { getConfigDir, loadConfig } = await import("../../core/config.ts");
    const dir = getConfigDir();
    writeFileSync(join(dir, "config.json"), "{broken");
    const config = loadConfig();
    expect(config.tickInterval).toBe(30);
  });

  it("saveConfig + loadConfig round-trips", async () => {
    const { saveConfig, loadConfig } = await import("../../core/config.ts");
    const custom = {
      tickInterval: 45,
      blockingBudget: 20,
      sleepAfter: 600,
      sleepTickInterval: 120,
      dreamAfter: 180,
      tickModel: "custom-model",
      escalationModel: "custom-escalation",
      maxEventWindow: 50,
      notifyBackends: ["desktop", "file"],
      webhookUrl: "https://example.com/hook",
      desktopNotify: true,
      allowModerateActions: false,
      actions: { ...DEFAULT_GATE_CONFIG },
      briefMode: false,
      features: {},
      push: {
        enabled: false,
        minSeverity: "warning" as const,
        statuses: ["alert", "proactive"],
        maxPerHour: 10,
      },
      webhook: {
        port: 7433,
        secret: "",
        path: "/webhook/github",
        allowedEvents: ["pull_request", "pull_request_review", "push", "issues", "issue_comment"],
      },
    };
    saveConfig(custom);
    const loaded = loadConfig();
    expect(loaded).toEqual(custom);
  });

  it("getConfigDir creates directory", async () => {
    const { getConfigDir } = await import("../../core/config.ts");
    const dir = getConfigDir();
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain(".vigil");
  });

  it("getDataDir creates nested dirs", async () => {
    const { getDataDir } = await import("../../core/config.ts");
    const dir = getDataDir();
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain("data");
  });

  it("getLogsDir creates full path", async () => {
    const { getLogsDir } = await import("../../core/config.ts");
    const dir = getLogsDir();
    expect(existsSync(dir)).toBe(true);
    expect(dir).toContain("logs");
  });

  it("getApiKey reads ANTHROPIC_API_KEY env", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    try {
      const { getApiKey } = await import("../../core/config.ts");
      expect(getApiKey()).toBe("test-key-123");
    } finally {
      if (originalKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      } else {
        delete process.env.ANTHROPIC_API_KEY;
      }
    }
  });

  it("getApiKey returns undefined when unset", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { getApiKey } = await import("../../core/config.ts");
      expect(getApiKey()).toBeUndefined();
    } finally {
      if (originalKey !== undefined) {
        process.env.ANTHROPIC_API_KEY = originalKey;
      }
    }
  });
});
