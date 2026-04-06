import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../../core/session.ts";

let tmpDir: string;
let store: SessionStore;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-session-test-"));
  dbPath = join(tmpDir, "vigil.db");
  store = new SessionStore(dbPath);
});

afterEach(() => {
  store.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("SessionStore", () => {
  describe("constructor", () => {
    test("creates sessions table", () => {
      const db = new Database(dbPath);
      const tables = db
        .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all()
        .map((r: any) => r.name);
      db.close();

      expect(tables).toContain("sessions");
    });

    test("is idempotent — creating second store on same DB does not throw", () => {
      const store2 = new SessionStore(dbPath);
      store2.close();
    });
  });

  describe("create()", () => {
    test("creates a session with active state", () => {
      const session = store.create(["/repo/a"], { tickInterval: 30 });

      expect(session.id).toBeTruthy();
      expect(session.state).toBe("active");
      expect(session.repos).toEqual(["/repo/a"]);
      expect(session.tickCount).toBe(0);
      expect(session.config).toEqual({ tickInterval: 30 });
    });

    test("persists session to database", () => {
      const session = store.create(["/repo/a"], {});

      const db = new Database(dbPath);
      const row = db.query("SELECT * FROM sessions WHERE id = ?").get(session.id) as any;
      db.close();

      expect(row).not.toBeNull();
      expect(row.state).toBe("active");
      expect(JSON.parse(row.repos)).toEqual(["/repo/a"]);
    });

    test("marks previous active sessions as crashed", () => {
      const first = store.create(["/repo/a"], {});
      const second = store.create(["/repo/a"], {});

      const db = new Database(dbPath);
      const firstRow = db.query("SELECT * FROM sessions WHERE id = ?").get(first.id) as any;
      const secondRow = db.query("SELECT * FROM sessions WHERE id = ?").get(second.id) as any;
      db.close();

      expect(firstRow.state).toBe("crashed");
      expect(firstRow.stopped_at).not.toBeNull();
      expect(secondRow.state).toBe("active");
    });

    test("multiple repos stored correctly", () => {
      const session = store.create(["/repo/a", "/repo/b", "/repo/c"], {});

      expect(session.repos).toEqual(["/repo/a", "/repo/b", "/repo/c"]);

      const db = new Database(dbPath);
      const row = db.query("SELECT * FROM sessions WHERE id = ?").get(session.id) as any;
      db.close();

      expect(JSON.parse(row.repos)).toEqual(["/repo/a", "/repo/b", "/repo/c"]);
    });
  });

  describe("updateTick()", () => {
    test("updates tick count and last_tick_at", () => {
      const session = store.create(["/repo/a"], {});

      const before = Date.now();
      store.updateTick(session.id, 42);

      const db = new Database(dbPath);
      const row = db.query("SELECT * FROM sessions WHERE id = ?").get(session.id) as any;
      db.close();

      expect(row.tick_count).toBe(42);
      expect(row.last_tick_at).toBeGreaterThanOrEqual(before);
    });
  });

  describe("stop()", () => {
    test("marks session as stopped with timestamp", () => {
      const session = store.create(["/repo/a"], {});

      const before = Date.now();
      store.stop(session.id);

      const db = new Database(dbPath);
      const row = db.query("SELECT * FROM sessions WHERE id = ?").get(session.id) as any;
      db.close();

      expect(row.state).toBe("stopped");
      expect(row.stopped_at).toBeGreaterThanOrEqual(before);
    });
  });

  describe("getLastSession()", () => {
    test("returns null when no previous sessions", () => {
      expect(store.getLastSession()).toBeNull();
    });

    test("returns null when only active sessions exist", () => {
      store.create(["/repo/a"], {});

      expect(store.getLastSession()).toBeNull();
    });

    test("returns stopped session", () => {
      const session = store.create(["/repo/a"], {});
      store.stop(session.id);

      const last = store.getLastSession();
      expect(last).not.toBeNull();
      expect(last!.id).toBe(session.id);
      expect(last!.state).toBe("stopped");
    });

    test("returns crashed session", () => {
      const first = store.create(["/repo/a"], {});
      // Creating second session marks first as crashed
      store.create(["/repo/a"], {});

      const last = store.getLastSession();
      expect(last).not.toBeNull();
      expect(last!.id).toBe(first.id);
      expect(last!.state).toBe("crashed");
    });

    test("returns most recent stopped/crashed session", () => {
      const s1 = store.create(["/repo/a"], {});
      store.updateTick(s1.id, 10);
      store.stop(s1.id);

      const s2 = store.create(["/repo/a"], {});
      store.updateTick(s2.id, 20);
      store.stop(s2.id);

      const last = store.getLastSession();
      expect(last).not.toBeNull();
      expect(last!.id).toBe(s2.id);
      expect(last!.tickCount).toBe(20);
    });
  });

  describe("getActiveSession()", () => {
    test("returns null when no active sessions", () => {
      expect(store.getActiveSession()).toBeNull();
    });

    test("returns active session", () => {
      const session = store.create(["/repo/a"], {});

      const active = store.getActiveSession();
      expect(active).not.toBeNull();
      expect(active!.id).toBe(session.id);
      expect(active!.state).toBe("active");
    });

    test("returns null after session is stopped", () => {
      const session = store.create(["/repo/a"], {});
      store.stop(session.id);

      expect(store.getActiveSession()).toBeNull();
    });
  });

  describe("session lifecycle", () => {
    test("full lifecycle: create → tick → stop → resume", () => {
      // First run
      const s1 = store.create(["/repo/a"], { tickInterval: 30 });
      store.updateTick(s1.id, 1);
      store.updateTick(s1.id, 2);
      store.updateTick(s1.id, 3);
      store.stop(s1.id);

      // Second run — recover from previous
      const last = store.getLastSession();
      expect(last).not.toBeNull();
      expect(last!.state).toBe("stopped");
      expect(last!.tickCount).toBe(3);

      // Create new session
      const s2 = store.create(["/repo/a"], { tickInterval: 30 });
      expect(s2.id).not.toBe(s1.id);
      expect(s2.tickCount).toBe(0);
    });

    test("crash recovery: active session becomes crashed on new create", () => {
      // Simulating crash — session never stopped
      const crashed = store.create(["/repo/a"], {});
      store.updateTick(crashed.id, 50);

      // New daemon starts
      const _recovered = store.create(["/repo/a"], {});

      const last = store.getLastSession();
      expect(last!.id).toBe(crashed.id);
      expect(last!.state).toBe("crashed");
      expect(last!.tickCount).toBe(50);
    });
  });
});
