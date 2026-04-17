import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventLog } from "../../memory/store.ts";

function createSeededLog() {
  const dir = mkdtempSync(join(tmpdir(), "vigil-test-log-"));
  const today = new Date().toISOString().split("T")[0];

  const entries = [
    {
      type: "specialist",
      detail: "[code-review] 2 finding(s): unused import, missing return type",
      timestamp: Date.now() - 5000,
    },
    {
      type: "specialist",
      detail: "[security] 1 finding(s): hardcoded secret in config",
      timestamp: Date.now() - 4000,
    },
    {
      type: "specialist",
      detail: "[code-review] 0 finding(s)",
      timestamp: Date.now() - 3000,
    },
    {
      type: "new_commit",
      detail: "abc123: fix login bug",
      timestamp: Date.now() - 2000,
    },
    {
      type: "observe",
      detail: "Watching for changes",
      timestamp: Date.now() - 1000,
    },
    {
      type: "specialist",
      detail: "[test-drift] 1 finding(s): 3 new functions without tests",
      timestamp: Date.now(),
    },
  ];

  const lines = `${entries.map((e) => JSON.stringify(e)).join("\n")}\n`;
  writeFileSync(join(dir, `${today}-my-app.jsonl`), lines);

  return { dir, entries };
}

let logDir: string;
let eventLog: EventLog;

beforeEach(() => {
  const result = createSeededLog();
  logDir = result.dir;
  eventLog = new EventLog(logDir);
});

afterEach(() => {
  rmSync(logDir, { recursive: true, force: true });
});

describe("Phase 5: log --specialist (all specialists)", () => {
  test("type=specialist returns only specialist entries", () => {
    const entries = eventLog.query({ type: "specialist", limit: 50 });
    expect(entries.length).toBe(4);
    for (const e of entries) {
      expect(e.type).toBe("specialist");
    }
  });

  test("non-specialist entries are excluded", () => {
    const entries = eventLog.query({ type: "specialist", limit: 50 });
    const types = entries.map((e) => e.type);
    expect(types).not.toContain("new_commit");
    expect(types).not.toContain("observe");
  });
});

describe("Phase 5: log --specialist <name> (named filter)", () => {
  test("post-filter by [code-review] returns only code-review entries", () => {
    const entries = eventLog.query({ type: "specialist", limit: 50 });
    const filtered = entries.filter((e) => (e.detail as string).includes("[code-review]"));
    expect(filtered).toHaveLength(2);
    for (const e of filtered) {
      expect(e.detail as string).toContain("[code-review]");
    }
  });

  test("post-filter by [security] returns only security entries", () => {
    const entries = eventLog.query({ type: "specialist", limit: 50 });
    const filtered = entries.filter((e) => (e.detail as string).includes("[security]"));
    expect(filtered).toHaveLength(1);
    expect(filtered[0].detail as string).toContain("hardcoded secret");
  });

  test("post-filter by [test-drift] returns only test-drift entries", () => {
    const entries = eventLog.query({ type: "specialist", limit: 50 });
    const filtered = entries.filter((e) => (e.detail as string).includes("[test-drift]"));
    expect(filtered).toHaveLength(1);
  });

  test("post-filter by unknown specialist returns empty", () => {
    const entries = eventLog.query({ type: "specialist", limit: 50 });
    const filtered = entries.filter((e) => (e.detail as string).includes("[nonexistent]"));
    expect(filtered).toHaveLength(0);
  });
});

describe("Phase 5: log --specialist combined with --repo", () => {
  test("repo filter + type=specialist narrows results", () => {
    const entries = eventLog.query({ repo: "my-app", type: "specialist", limit: 50 });
    expect(entries.length).toBe(4);
  });

  test("unknown repo returns empty", () => {
    const entries = eventLog.query({ repo: "nonexistent", type: "specialist", limit: 50 });
    expect(entries).toHaveLength(0);
  });
});

describe("Phase 5: log --specialist with --limit", () => {
  test("limit caps returned entries", () => {
    const entries = eventLog.query({ type: "specialist", limit: 2 });
    expect(entries).toHaveLength(2);
  });
});
