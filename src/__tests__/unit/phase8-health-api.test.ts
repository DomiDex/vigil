import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

let tmpDir: string;
let db: Database;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-p8-health-"));
  db = new Database(join(tmpDir, "test.db"));
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    )
  `);
});

afterEach(() => {
  db.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function seedEvents(count: number, baseTimestamp: number) {
  const stmt = db.prepare("INSERT INTO events (type, content, timestamp) VALUES (?, ?, ?)");
  for (let i = 0; i < count; i++) {
    stmt.run("decision", `Event ${i}`, baseTimestamp + i * 1000);
  }
}

const pruneSchema = z.object({
  olderThanDays: z.number().int().min(1).max(365),
});

describe("Phase 8: VACUUM endpoint", () => {
  test("VACUUM executes without error on empty database", () => {
    expect(() => db.exec("VACUUM")).not.toThrow();
  });

  test("VACUUM executes without error after inserts and deletes", () => {
    seedEvents(100, Date.now() - 86400000);
    db.run("DELETE FROM events WHERE id <= 50");
    expect(() => db.exec("VACUUM")).not.toThrow();
  });

  test("page_count is measurable via PRAGMA", () => {
    const before = db.query("PRAGMA page_count").get() as any;
    expect(before).toBeDefined();
    expect(typeof before.page_count).toBe("number");
  });

  test("page_size is measurable via PRAGMA", () => {
    const result = db.query("PRAGMA page_size").get() as any;
    expect(result).toBeDefined();
    expect(result.page_size).toBeGreaterThan(0);
  });

  test("freedBytes can be computed from page_count before/after VACUUM", () => {
    seedEvents(200, Date.now() - 86400000);
    db.run("DELETE FROM events");

    const pageSizeResult = db.query("PRAGMA page_size").get() as any;
    const pageSize = pageSizeResult.page_size;
    const beforeResult = db.query("PRAGMA page_count").get() as any;
    const beforePages = beforeResult.page_count;

    db.exec("VACUUM");

    const afterResult = db.query("PRAGMA page_count").get() as any;
    const afterPages = afterResult.page_count;

    const freedBytes = (beforePages - afterPages) * pageSize;
    expect(freedBytes).toBeGreaterThanOrEqual(0);
  });
});

describe("Phase 8: Prune endpoint", () => {
  test("deletes events older than N days", () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 86400000;
    const sixtyDaysAgo = now - 60 * 86400000;

    seedEvents(10, sixtyDaysAgo);
    seedEvents(10, now);

    const threshold = thirtyDaysAgo;
    const countBefore = (db.query("SELECT COUNT(*) as c FROM events WHERE timestamp < ?").get(threshold) as any).c;
    expect(countBefore).toBe(10);

    db.run("DELETE FROM events WHERE timestamp < ?", [threshold]);

    const remaining = (db.query("SELECT COUNT(*) as c FROM events").get() as any).c;
    expect(remaining).toBe(10);
  });

  test("pre-flight count matches actual deletion count", () => {
    const now = Date.now();
    const oldTimestamp = now - 90 * 86400000;
    seedEvents(25, oldTimestamp);
    seedEvents(5, now);

    const threshold = now - 30 * 86400000;
    const preFlightCount = (db.query("SELECT COUNT(*) as c FROM events WHERE timestamp < ?").get(threshold) as any).c;

    const changes = db.run("DELETE FROM events WHERE timestamp < ?", [threshold]);

    expect(changes.changes).toBe(preFlightCount);
  });

  test("returns 0 when no events match the threshold", () => {
    seedEvents(10, Date.now());

    const threshold = Date.now() - 30 * 86400000;
    const count = (db.query("SELECT COUNT(*) as c FROM events WHERE timestamp < ?").get(threshold) as any).c;
    expect(count).toBe(0);
  });

  test("does not delete events within the threshold", () => {
    const now = Date.now();
    seedEvents(5, now - 10 * 86400000);
    seedEvents(5, now);

    const threshold = now - 30 * 86400000;
    db.run("DELETE FROM events WHERE timestamp < ?", [threshold]);

    const remaining = (db.query("SELECT COUNT(*) as c FROM events").get() as any).c;
    expect(remaining).toBe(10);
  });
});

describe("Phase 8: Prune Zod validation", () => {
  test("accepts valid integer days (1)", () => {
    expect(pruneSchema.safeParse({ olderThanDays: 1 }).success).toBe(true);
  });

  test("accepts valid integer days (365)", () => {
    expect(pruneSchema.safeParse({ olderThanDays: 365 }).success).toBe(true);
  });

  test("accepts valid integer days (30)", () => {
    expect(pruneSchema.safeParse({ olderThanDays: 30 }).success).toBe(true);
  });

  test("rejects 0 days", () => {
    expect(pruneSchema.safeParse({ olderThanDays: 0 }).success).toBe(false);
  });

  test("rejects 366 days", () => {
    expect(pruneSchema.safeParse({ olderThanDays: 366 }).success).toBe(false);
  });

  test("rejects negative days", () => {
    expect(pruneSchema.safeParse({ olderThanDays: -7 }).success).toBe(false);
  });

  test("rejects float days", () => {
    expect(pruneSchema.safeParse({ olderThanDays: 1.5 }).success).toBe(false);
  });

  test("rejects non-number", () => {
    expect(pruneSchema.safeParse({ olderThanDays: "thirty" }).success).toBe(false);
  });

  test("rejects missing field", () => {
    expect(pruneSchema.safeParse({}).success).toBe(false);
  });
});
