import { describe, test, expect, afterEach } from "bun:test";
import { acquireLock, releaseLock } from "../../src/core/instance-lock.ts";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir } from "../../src/core/config.ts";

const LOCK_FILE = join(getConfigDir(), "vigil.lock");

function cleanupLock() {
  if (existsSync(LOCK_FILE)) unlinkSync(LOCK_FILE);
}

describe("InstanceLock", () => {
  afterEach(cleanupLock);

  test("acquires lock on first call", () => {
    const result = acquireLock("session-1", ["/repo/a"]);
    expect(result).toBe(true);
    expect(existsSync(LOCK_FILE)).toBe(true);
    releaseLock("session-1");
  });

  test("blocks overlapping repos from same process", () => {
    acquireLock("session-1", ["/repo/a", "/repo/b"]);
    // Same process, so PID check passes — overlap should block
    const result = acquireLock("session-2", ["/repo/b", "/repo/c"]);
    expect(result).toBe(false);
    releaseLock("session-1");
  });

  test("allows non-overlapping repos", () => {
    acquireLock("session-1", ["/repo/a"]);
    const result = acquireLock("session-2", ["/repo/c"]);
    // Since same PID, overlap check is what matters — no overlap here
    expect(result).toBe(true);
    releaseLock("session-1");
  });

  test("releases lock on correct session", () => {
    acquireLock("session-1", ["/repo/a"]);
    releaseLock("session-1");
    expect(existsSync(LOCK_FILE)).toBe(false);
  });

  test("does not release lock from wrong session", () => {
    acquireLock("session-1", ["/repo/a"]);
    releaseLock("session-2"); // Wrong session
    expect(existsSync(LOCK_FILE)).toBe(true);
    releaseLock("session-1"); // Actual cleanup
  });

  test("overwrites stale lock from dead PID", () => {
    // Write a lock with a PID that doesn't exist
    const { writeFileSync } = require("fs");
    writeFileSync(
      LOCK_FILE,
      JSON.stringify({ pid: 999999, sessionId: "dead", startedAt: 0, repos: ["/repo/a"] })
    );

    const result = acquireLock("session-new", ["/repo/a"]);
    expect(result).toBe(true);
    releaseLock("session-new");
  });
});
