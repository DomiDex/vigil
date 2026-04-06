import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PROJECT_ROOT = join(import.meta.dir, "../../..");

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "vigil-e2e-"));
  mkdirSync(join(tmpHome, ".vigil"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
});

async function runCLI(...args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", ...args], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, HOME: tmpHome, USERPROFILE: tmpHome },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

// ── version and help ──

describe("version and help", () => {
  test(
    "--version prints version",
    async () => {
      const { stdout, exitCode } = await runCLI("--version");
      expect(stdout.trim()).toContain("0.1.0");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );

  test(
    "--help shows usage",
    async () => {
      const { stdout, exitCode } = await runCLI("--help");
      expect(stdout).toContain("watch");
      expect(stdout).toContain("status");
      expect(stdout).toContain("log");
      expect(stdout).toContain("ask");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );
});

// ── status / config ──

describe("status / config", () => {
  test(
    "status shows all config keys",
    async () => {
      const { stdout, exitCode } = await runCLI("status");
      expect(stdout).toContain("tickInterval");
      expect(stdout).toContain("sleepAfter");
      expect(stdout).toContain("tickModel");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );

  test(
    "config with no args shows all",
    async () => {
      const { stdout, exitCode } = await runCLI("config");
      expect(stdout).toContain("tickInterval");
      expect(stdout).toContain("sleepAfter");
      expect(stdout).toContain("tickModel");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );

  test(
    "config <key> shows single value",
    async () => {
      const { stdout, exitCode } = await runCLI("config", "tickInterval");
      expect(stdout).toContain("tickInterval");
      // Fresh config dir — should show default (30)
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );

  test(
    "config <key> <value> sets and persists",
    async () => {
      const set = await runCLI("config", "tickInterval", "60");
      expect(set.stdout).toContain("✓");
      expect(set.exitCode).toBe(0);

      // Verify it persisted
      const get = await runCLI("config", "tickInterval");
      expect(get.stdout).toContain("60");
    },
    { timeout: 10000 },
  );

  test(
    "config unknown key shows error",
    async () => {
      const { stderr } = await runCLI("config", "badKey");
      expect(stderr).toContain("Unknown config key");
    },
    { timeout: 10000 },
  );
});

// ── log ──

describe("log", () => {
  test(
    "log with no entries shows message",
    async () => {
      const { stdout, exitCode } = await runCLI("log");
      expect(stdout).toContain("No log entries found");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );
});

// ── memory and dream ──

describe("memory and dream", () => {
  test(
    "memory with no profile shows message",
    async () => {
      const { stdout, exitCode } = await runCLI("memory");
      expect(stdout).toContain("No memory profile found");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );

  test(
    "dream with no memories shows message",
    async () => {
      const { stdout, exitCode } = await runCLI("dream");
      expect(stdout).toContain("No memories to consolidate");
      expect(exitCode).toBe(0);
    },
    { timeout: 10000 },
  );
});
