/**
 * File-based instance lock to prevent duplicate Vigil daemons on the same repos.
 *
 * Pattern from Kairos cronTasksLock.ts — PID-based liveness detection.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { getConfigDir } from "./config.ts";

interface LockData {
  pid: number;
  sessionId: string;
  startedAt: number;
  repos: string[];
}

function getLockPath(): string {
  return join(getConfigDir(), "vigil.lock");
}

/**
 * Acquire instance lock. Returns true if lock acquired.
 * Detects stale locks from dead processes and allows
 * parallel watching of non-overlapping repos.
 */
export function acquireLock(sessionId: string, repos: string[]): boolean {
  const lockPath = getLockPath();

  if (existsSync(lockPath)) {
    try {
      const existing: LockData = JSON.parse(readFileSync(lockPath, "utf-8"));

      // Check if owning process is still alive
      try {
        process.kill(existing.pid, 0); // Signal 0 = check existence
        // Process exists — check repo overlap
        const overlap = repos.filter((r) => existing.repos.includes(r));
        if (overlap.length > 0) {
          console.error(
            `Another Vigil instance (PID ${existing.pid}) is watching: ${overlap.join(", ")}`
          );
          return false;
        }
        // No overlap — allow parallel watching of different repos
      } catch {
        // Process is dead — stale lock, safe to overwrite
        console.warn("Removing stale lock from dead process");
      }
    } catch {
      // Corrupt lock file — overwrite
    }
  }

  const lock: LockData = {
    pid: process.pid,
    sessionId,
    startedAt: Date.now(),
    repos,
  };

  writeFileSync(lockPath, JSON.stringify(lock, null, 2));
  return true;
}

export function releaseLock(sessionId: string): void {
  const lockPath = getLockPath();
  if (!existsSync(lockPath)) return;
  try {
    const existing: LockData = JSON.parse(readFileSync(lockPath, "utf-8"));
    if (existing.sessionId === sessionId) {
      unlinkSync(lockPath);
    }
  } catch {
    // Best effort
  }
}
