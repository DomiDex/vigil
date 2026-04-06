import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NotificationRouter } from "../../notify/push.ts";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "vigil-notif-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeRouter(backends: any[] = ["file"], webhookUrl?: string) {
  return new NotificationRouter({
    backends,
    webhookUrl,
    queueDir: join(tmpDir, "notifications"),
  });
}

describe("NotificationRouter", () => {
  test("file backend appends to queue.jsonl", async () => {
    const router = makeRouter();

    await router.send("Test Title", "Test message", "info");

    const queuePath = join(tmpDir, "notifications", "queue.jsonl");
    const content = readFileSync(queuePath, "utf-8").trim();
    const entry = JSON.parse(content);

    expect(entry.title).toBe("Test Title");
    expect(entry.message).toBe("Test message");
    expect(entry.severity).toBe("info");
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  test("readQueue returns entries in reverse chronological order", async () => {
    const router = makeRouter();

    await router.send("First", "msg1", "info");
    await router.send("Second", "msg2", "warning");

    const entries = router.readQueue();
    expect(entries).toHaveLength(2);
    expect((entries[0] as any).title).toBe("Second");
    expect((entries[1] as any).title).toBe("First");
  });

  test("readQueue respects limit", async () => {
    const router = makeRouter();

    await router.send("A", "a", "info");
    await router.send("B", "b", "info");
    await router.send("C", "c", "info");

    const entries = router.readQueue(2);
    expect(entries).toHaveLength(2);
  });

  test("readQueue returns empty when no queue file", () => {
    const router = makeRouter();
    const entries = router.readQueue();
    expect(entries).toHaveLength(0);
  });

  test("webhook backend posts to URL", async () => {
    let postedBody: any = null;

    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async (_url: any, opts: any) => {
      postedBody = JSON.parse(opts.body);
      return new Response("ok", { status: 200 });
    };

    try {
      const router = makeRouter(["webhook"], "http://localhost:9999/hook");

      await router.send("Vigil Alert", "Something happened", "warning");

      expect(postedBody).not.toBeNull();
      expect(postedBody.title).toBe("Vigil Alert");
      expect(postedBody.message).toBe("Something happened");
      expect(postedBody.severity).toBe("warning");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("webhook failure does not throw", async () => {
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      throw new Error("Network error");
    };

    try {
      const router = makeRouter(["webhook"], "http://localhost:9999/hook");
      // Should not throw
      await router.send("Title", "msg", "info");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("multiple backends are all called", async () => {
    let webhookCalled = false;
    const originalFetch = globalThis.fetch;
    (globalThis as any).fetch = async () => {
      webhookCalled = true;
      return new Response("ok", { status: 200 });
    };

    try {
      const router = makeRouter(["file", "webhook"], "http://localhost:9999/hook");

      await router.send("Multi", "both backends", "info");

      // File queue should have the entry
      const entries = router.readQueue();
      expect(entries).toHaveLength(1);

      // Webhook should have been called
      expect(webhookCalled).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
