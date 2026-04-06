import { describe, expect, spyOn, test } from "bun:test";
import { EventDeduplicator } from "../../git/watcher.ts";

describe("EventDeduplicator", () => {
  test("first event is never a duplicate", () => {
    const dedup = new EventDeduplicator();
    const event = { type: "new_commit", repo: "my-repo", detail: "New commit: abc123" };
    expect(dedup.isDuplicate(event)).toBe(false);
  });

  test("identical event within window is a duplicate", () => {
    const dedup = new EventDeduplicator(5_000);
    const event = { type: "new_commit", repo: "my-repo", detail: "New commit: abc123" };

    expect(dedup.isDuplicate(event)).toBe(false); // first time
    expect(dedup.isDuplicate(event)).toBe(true); // duplicate
  });

  test("different event types are not deduped", () => {
    const dedup = new EventDeduplicator();
    const commit = { type: "new_commit", repo: "my-repo", detail: "abc" };
    const branch = { type: "branch_switch", repo: "my-repo", detail: "abc" };

    expect(dedup.isDuplicate(commit)).toBe(false);
    expect(dedup.isDuplicate(branch)).toBe(false); // different type
  });

  test("different repos are not deduped", () => {
    const dedup = new EventDeduplicator();
    const eventA = { type: "new_commit", repo: "repo-a", detail: "abc" };
    const eventB = { type: "new_commit", repo: "repo-b", detail: "abc" };

    expect(dedup.isDuplicate(eventA)).toBe(false);
    expect(dedup.isDuplicate(eventB)).toBe(false); // different repo
  });

  test("different details are not deduped", () => {
    const dedup = new EventDeduplicator();
    const event1 = { type: "new_commit", repo: "my-repo", detail: "commit A" };
    const event2 = { type: "new_commit", repo: "my-repo", detail: "commit B" };

    expect(dedup.isDuplicate(event1)).toBe(false);
    expect(dedup.isDuplicate(event2)).toBe(false); // different detail
  });

  test("event allowed again after window expires", () => {
    const dedup = new EventDeduplicator(100); // 100ms window
    const event = { type: "new_commit", repo: "my-repo", detail: "abc" };

    const nowSpy = spyOn(Date, "now");
    const baseTime = 1000000;

    nowSpy.mockReturnValue(baseTime);
    expect(dedup.isDuplicate(event)).toBe(false); // first

    nowSpy.mockReturnValue(baseTime + 50);
    expect(dedup.isDuplicate(event)).toBe(true); // within window

    nowSpy.mockReturnValue(baseTime + 150);
    expect(dedup.isDuplicate(event)).toBe(false); // past window

    nowSpy.mockRestore();
  });

  test("cleanup triggers when seen map exceeds 1000 entries", () => {
    const dedup = new EventDeduplicator(100);

    const nowSpy = spyOn(Date, "now");
    const baseTime = 1000000;

    // Fill with 1001 old entries
    nowSpy.mockReturnValue(baseTime);
    for (let i = 0; i < 1001; i++) {
      dedup.isDuplicate({ type: "file_change", repo: "repo", detail: `file-${i}` });
    }

    // Advance time past the cleanup window (windowMs * 2 = 200ms)
    nowSpy.mockReturnValue(baseTime + 300);
    // This call triggers cleanup since size > 1000
    dedup.isDuplicate({ type: "new_commit", repo: "repo", detail: "trigger cleanup" });

    // Old entries should be cleaned up — re-submitting should NOT be duplicate
    nowSpy.mockReturnValue(baseTime + 350);
    expect(dedup.isDuplicate({ type: "file_change", repo: "repo", detail: "file-0" })).toBe(false);

    nowSpy.mockRestore();
  });

  test("GitWatcher emitDeduped filters duplicates", () => {
    // Test via the watcher's emitDeduped method
    const { GitWatcher } = require("../../git/watcher.ts");
    const watcher = new GitWatcher();

    const events: any[] = [];
    watcher.onEvent((e: any) => events.push(e));

    // Access private emitDeduped
    const event = { type: "file_change", repo: "test", timestamp: Date.now(), detail: "File changed: foo.ts" };
    (watcher as any).emitDeduped(event);
    (watcher as any).emitDeduped(event); // duplicate

    expect(events).toHaveLength(1);

    // Different detail passes through
    const event2 = { ...event, detail: "File changed: bar.ts" };
    (watcher as any).emitDeduped(event2);
    expect(events).toHaveLength(2);

    watcher.stopPolling();
  });
});
