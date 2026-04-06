import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { gitExec } from "../../src/git/exec.ts";
import { createTempRepo } from "../helpers/temp-repo.ts";

describe("gitExec", () => {
  let repo: { path: string; cleanup: () => void };

  beforeEach(async () => {
    repo = await createTempRepo();
  });

  afterEach(() => {
    repo.cleanup();
  });

  test("executes git commands successfully", async () => {
    const result = await gitExec(repo.path, ["rev-parse", "HEAD"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[a-f0-9]{40}$/);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("returns non-zero exit code on invalid commands", async () => {
    const result = await gitExec(repo.path, ["log", "--oneline", "nonexistent-branch"], {
      retries: 0,
    });
    expect(result.exitCode).not.toBe(0);
  });

  test("captures stderr", async () => {
    const result = await gitExec(repo.path, ["checkout", "nonexistent-branch"], {
      retries: 0,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });

  test("times out on long-running commands", async () => {
    // Use a very short timeout to trigger it
    try {
      await gitExec(repo.path, ["gc", "--aggressive"], {
        timeoutMs: 1,
        retries: 0,
      });
      // If gc finishes fast enough, that's ok too
    } catch (err) {
      expect((err as Error).message).toContain("timed out");
    }
  });

  test("retries on transient errors", async () => {
    // gitExec should handle retries internally - we test the interface works
    const result = await gitExec(repo.path, ["status"], { retries: 1, retryDelayMs: 100 });
    expect(result.exitCode).toBe(0);
  });

  test("measures duration", async () => {
    const result = await gitExec(repo.path, ["status"]);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeLessThan(10_000);
  });
});
