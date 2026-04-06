import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../../core/instance-lock.ts";

describe("InstanceLock", () => {
  let tmpDir: string;
  let lockPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "vigil-lock-test-"));
    spyOn(os, "homedir").mockReturnValue(tmpDir);
    lockPath = join(tmpDir, ".vigil", "vigil.lock");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("acquireLock", () => {
    it("acquires lock on first call", () => {
      const result = acquireLock("session-1", ["/repo/a"]);
      expect(result).toBe(true);
      expect(existsSync(lockPath)).toBe(true);
    });

    it("writes correct lock data", () => {
      acquireLock("session-1", ["/repo/a", "/repo/b"]);
      const data = JSON.parse(readFileSync(lockPath, "utf-8"));
      expect(data.sessionId).toBe("session-1");
      expect(data.repos).toEqual(["/repo/a", "/repo/b"]);
      expect(data.pid).toBe(process.pid);
      expect(typeof data.startedAt).toBe("number");
    });

    it("blocks overlapping repos from same process", () => {
      acquireLock("session-1", ["/repo/a", "/repo/b"]);
      // Same PID will be alive, so overlap check triggers
      const result = acquireLock("session-2", ["/repo/b", "/repo/c"]);
      expect(result).toBe(false);
    });

    it("allows non-overlapping repos", () => {
      acquireLock("session-1", ["/repo/a"]);
      const result = acquireLock("session-2", ["/repo/c"]);
      expect(result).toBe(true);
    });

    it("overwrites stale lock from dead process", () => {
      // Write a lock with a PID that doesn't exist
      const vigilDir = join(tmpDir, ".vigil");
      const { mkdirSync } = require("node:fs");
      mkdirSync(vigilDir, { recursive: true });
      writeFileSync(
        lockPath,
        JSON.stringify({
          pid: 999999999, // unlikely to be a real process
          sessionId: "dead-session",
          startedAt: Date.now() - 100000,
          repos: ["/repo/a"],
        }),
      );

      const result = acquireLock("session-new", ["/repo/a"]);
      expect(result).toBe(true);
      const data = JSON.parse(readFileSync(lockPath, "utf-8"));
      expect(data.sessionId).toBe("session-new");
    });

    it("overwrites corrupt lock file", () => {
      const vigilDir = join(tmpDir, ".vigil");
      const { mkdirSync } = require("node:fs");
      mkdirSync(vigilDir, { recursive: true });
      writeFileSync(lockPath, "not valid json{{{");

      const result = acquireLock("session-1", ["/repo/a"]);
      expect(result).toBe(true);
    });
  });

  describe("releaseLock", () => {
    it("releases lock for matching session", () => {
      acquireLock("session-1", ["/repo/a"]);
      releaseLock("session-1");
      expect(existsSync(lockPath)).toBe(false);
    });

    it("does not release lock from wrong session", () => {
      acquireLock("session-1", ["/repo/a"]);
      releaseLock("session-2");
      expect(existsSync(lockPath)).toBe(true);
    });

    it("is a no-op when no lock exists", () => {
      // Should not throw
      releaseLock("session-1");
    });

    it("handles corrupt lock file gracefully", () => {
      const vigilDir = join(tmpDir, ".vigil");
      const { mkdirSync } = require("node:fs");
      mkdirSync(vigilDir, { recursive: true });
      writeFileSync(lockPath, "corrupt");
      // Should not throw
      releaseLock("session-1");
    });
  });
});
