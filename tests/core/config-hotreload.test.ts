import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { writeFileSync } from "fs";

import { loadConfig, watchConfig, stopWatchingConfig, saveConfig, getConfigDir } from "../../src/core/config.ts";

describe("Config hot-reload", () => {
  let originalContent: string;
  const configPath = join(getConfigDir(), "config.json");

  beforeEach(() => {
    // Snapshot the current file content to restore later
    try {
      originalContent = Bun.file(configPath).toString();
    } catch {
      originalContent = "";
    }
    // Ensure a clean known state
    saveConfig(loadConfig());
  });

  afterEach(() => {
    stopWatchingConfig();
    // Restore original content
    if (originalContent) {
      writeFileSync(configPath, originalContent);
    }
  });

  test("loadConfig merges defaults with saved config", () => {
    const config = loadConfig();
    // These defaults should always be present
    expect(config.tickModel).toBe("claude-haiku-4-5-20251001");
    expect(config.escalationModel).toBe("claude-sonnet-4-6");
    expect(typeof config.tickInterval).toBe("number");
  });

  test("watchConfig fires handler on file change", async () => {
    let reloadedConfig: any = null;
    watchConfig((newConfig) => {
      reloadedConfig = newConfig;
    });

    // Write a clearly different value
    const modified = { tickInterval: 999, sleepAfter: 1234 };
    writeFileSync(configPath, JSON.stringify(modified, null, 2));

    // Wait for debounce (300ms) + buffer
    await Bun.sleep(600);

    expect(reloadedConfig).not.toBeNull();
    expect(reloadedConfig.tickInterval).toBe(999);
  });

  test("stopWatchingConfig is idempotent", () => {
    watchConfig(() => {});
    stopWatchingConfig();
    stopWatchingConfig(); // should not throw
  });
});
