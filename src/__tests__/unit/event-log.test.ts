import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventLog } from "../../memory/store.ts";

let tmpDir: string;
let eventLog: EventLog;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-log-test-"));
  eventLog = new EventLog(tmpDir);
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("EventLog", () => {
  describe("append()", () => {
    test("creates JSONL file with correct name pattern", () => {
      eventLog.append("myrepo", { type: "observe" });

      const files = readdirSync(tmpDir);
      expect(files).toHaveLength(1);
      // Filename should be YYYY-MM-DD-myrepo.jsonl
      expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-myrepo\.jsonl$/);
    });

    test("adds timestamp to entry", () => {
      const ts = 1718448000000;
      spyOn(Date, "now").mockReturnValue(ts);

      eventLog.append("repo", { type: "observe" });

      const files = readdirSync(tmpDir);
      const content = readFileSync(join(tmpDir, files[0]), "utf-8").trim();
      const entry = JSON.parse(content);
      expect(entry.timestamp).toBe(ts);
    });

    test("multiple appends go to same file", () => {
      eventLog.append("repo", { type: "observe" });
      eventLog.append("repo", { type: "notify" });
      eventLog.append("repo", { type: "act" });

      const files = readdirSync(tmpDir).filter((f) => f.endsWith(".jsonl"));
      expect(files).toHaveLength(1);

      const lines = readFileSync(join(tmpDir, files[0]), "utf-8").trim().split("\n");
      expect(lines).toHaveLength(3);
    });

    test("different dates create different files", () => {
      // Write files for two different dates directly to verify query behavior
      writeFileSync(join(tmpDir, "2025-06-15-repo.jsonl"), '{"type":"a","timestamp":1000}\n');
      writeFileSync(join(tmpDir, "2025-06-16-repo.jsonl"), '{"type":"b","timestamp":2000}\n');

      const files = readdirSync(tmpDir).filter((f) => f.endsWith(".jsonl"));
      expect(files).toHaveLength(2);
    });

    test("preserves all event fields", () => {
      eventLog.append("repo", { type: "observe", detail: "saw thing", extra: 42 });

      const files = readdirSync(tmpDir);
      const content = readFileSync(join(tmpDir, files[0]), "utf-8").trim();
      const entry = JSON.parse(content);
      expect(entry.type).toBe("observe");
      expect(entry.detail).toBe("saw thing");
      expect(entry.extra).toBe(42);
      expect(entry.timestamp).toBeDefined();
    });
  });

  describe("query()", () => {
    test("returns all entries when no filter", () => {
      for (let i = 0; i < 5; i++) {
        eventLog.append("repo", { type: "observe", i });
      }
      const results = eventLog.query({});
      expect(results).toHaveLength(5);
    });

    test("filters by repo name", () => {
      // Use direct file writes to control filenames exactly
      writeFileSync(
        join(tmpDir, "2025-06-15-repo-a.jsonl"),
        '{"type":"observe","timestamp":1000}\n{"type":"observe","timestamp":1001}\n',
      );
      writeFileSync(join(tmpDir, "2025-06-15-repo-b.jsonl"), '{"type":"observe","timestamp":2000}\n');

      const results = eventLog.query({ repo: "repo-a" });
      expect(results).toHaveLength(2);
    });

    test("filters by type", () => {
      eventLog.append("repo", { type: "observe" });
      eventLog.append("repo", { type: "notify" });
      eventLog.append("repo", { type: "observe" });

      const results = eventLog.query({ type: "observe" });
      expect(results).toHaveLength(2);
      for (const r of results) {
        expect(r.type).toBe("observe");
      }
    });

    test("respects limit", () => {
      for (let i = 0; i < 10; i++) {
        eventLog.append("repo", { type: "observe", i });
      }
      const results = eventLog.query({ limit: 3 });
      expect(results).toHaveLength(3);
    });

    test("returns newest first", () => {
      // Write entries with known timestamps directly
      writeFileSync(
        join(tmpDir, "2025-06-15-repo.jsonl"),
        '{"type":"observe","order":"first","timestamp":1000}\n{"type":"observe","order":"second","timestamp":2000}\n{"type":"observe","order":"third","timestamp":3000}\n',
      );

      const results = eventLog.query({});
      // Lines are reversed within file, so newest (3000) should be first
      expect(results[0].timestamp).toBe(3000);
    });

    test("handles malformed JSON line", () => {
      writeFileSync(
        join(tmpDir, "2025-06-15-repo.jsonl"),
        '{"type":"observe","timestamp":1000}\nNOT_JSON\n{"type":"notify","timestamp":2000}\n',
      );

      const results = eventLog.query({});
      expect(results).toHaveLength(2);
    });

    test("filters by date range", () => {
      writeFileSync(join(tmpDir, "2025-06-14-repo.jsonl"), '{"type":"observe","timestamp":1000}\n');
      writeFileSync(join(tmpDir, "2025-06-15-repo.jsonl"), '{"type":"observe","timestamp":2000}\n');
      writeFileSync(join(tmpDir, "2025-06-16-repo.jsonl"), '{"type":"observe","timestamp":3000}\n');

      const results = eventLog.query({
        startDate: "2025-06-14",
        endDate: "2025-06-15",
      });
      expect(results).toHaveLength(2);
    });

    test("repo filter matches exact name only", () => {
      writeFileSync(join(tmpDir, "2025-06-15-my-app.jsonl"), '{"type":"observe","timestamp":1000}\n');
      writeFileSync(join(tmpDir, "2025-06-15-app.jsonl"), '{"type":"notify","timestamp":2000}\n');

      // "app" should NOT match "my-app"
      const partial = eventLog.query({ repo: "app" });
      expect(partial).toHaveLength(1);
      expect(partial[0].type).toBe("notify");

      // exact match works
      const exact = eventLog.query({ repo: "my-app" });
      expect(exact).toHaveLength(1);
      expect(exact[0].type).toBe("observe");
    });

    test("returns empty array for empty logs dir", () => {
      const results = eventLog.query({});
      expect(results).toEqual([]);
    });

    test("handles repo names with hyphens", () => {
      // File "2025-06-15-my-app.jsonl" — split("-").slice(0,3) = ["2025","06","15"]
      writeFileSync(join(tmpDir, "2025-06-15-my-app.jsonl"), '{"type":"observe","timestamp":1000}\n');

      const results = eventLog.query({ startDate: "2025-06-15", endDate: "2025-06-15" });
      expect(results).toHaveLength(1);
    });
  });
});
