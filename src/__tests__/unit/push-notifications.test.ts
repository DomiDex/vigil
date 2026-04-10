import { describe, expect, it } from "bun:test";
import { NativeBackend } from "../../messaging/backends/native.ts";
import { NtfyBackend } from "../../messaging/backends/ntfy.ts";
import { type PushBackend, PushChannel, type PushNotification } from "../../messaging/channels/push.ts";
import { createMessage, type VigilMessage } from "../../messaging/schema.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMessage(overrides: Partial<VigilMessage> = {}): VigilMessage {
  return createMessage({
    source: { repo: "test-repo", branch: "main" },
    status: "alert",
    message: "Something critical happened",
    severity: "warning",
    ...overrides,
  });
}

function makeMockBackend(name = "mock", result = true): PushBackend & { calls: PushNotification[] } {
  const calls: PushNotification[] = [];
  return {
    name,
    calls,
    send: async (n: PushNotification) => {
      calls.push(n);
      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// PushChannel tests
// ---------------------------------------------------------------------------

describe("PushChannel", () => {
  it("is disabled when config.enabled is false", () => {
    const ch = new PushChannel({ enabled: false });
    ch.addBackend(makeMockBackend());
    expect(ch.isEnabled()).toBe(false);
  });

  it("is disabled when no backends are registered", () => {
    const ch = new PushChannel({ enabled: true });
    expect(ch.isEnabled()).toBe(false);
  });

  it("is enabled when config.enabled and has backends", () => {
    const ch = new PushChannel({ enabled: true });
    ch.addBackend(makeMockBackend());
    expect(ch.isEnabled()).toBe(true);
  });

  it("accepts messages matching severity and status", () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "warning",
      statuses: ["alert", "proactive"],
    });
    ch.addBackend(makeMockBackend());

    expect(ch.accepts(makeMessage({ severity: "warning", status: "alert" }))).toBe(true);
    expect(ch.accepts(makeMessage({ severity: "critical", status: "alert" }))).toBe(true);
  });

  it("rejects messages below min severity", () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "warning",
      statuses: ["alert"],
    });
    ch.addBackend(makeMockBackend());

    expect(ch.accepts(makeMessage({ severity: "info", status: "alert" }))).toBe(false);
  });

  it("rejects messages with non-matching status", () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    ch.addBackend(makeMockBackend());

    expect(ch.accepts(makeMessage({ severity: "warning", status: "normal" }))).toBe(false);
    expect(ch.accepts(makeMessage({ severity: "warning", status: "proactive" }))).toBe(false);
  });

  it("rejects during quiet hours", () => {
    // Fake "now" as 23:00
    const fakeNow = () => {
      const d = new Date();
      d.setHours(23, 0, 0, 0);
      return d;
    };

    const ch = new PushChannel(
      {
        enabled: true,
        minSeverity: "info",
        statuses: ["alert"],
        quietHours: { start: "22:00", end: "07:00" },
      },
      fakeNow,
    );
    ch.addBackend(makeMockBackend());

    expect(ch.accepts(makeMessage({ status: "alert" }))).toBe(false);
  });

  it("accepts outside quiet hours", () => {
    // Fake "now" as 12:00
    const fakeNow = () => {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      return d;
    };

    const ch = new PushChannel(
      {
        enabled: true,
        minSeverity: "info",
        statuses: ["alert"],
        quietHours: { start: "22:00", end: "07:00" },
      },
      fakeNow,
    );
    ch.addBackend(makeMockBackend());

    expect(ch.accepts(makeMessage({ status: "alert" }))).toBe(true);
  });

  it("rate limits after maxPerHour sends", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
      maxPerHour: 2,
    });
    const backend = makeMockBackend();
    ch.addBackend(backend);

    const msg = makeMessage({ status: "alert" });

    // First two should be accepted and delivered
    expect(ch.accepts(msg)).toBe(true);
    await ch.deliver(msg);
    expect(ch.accepts(msg)).toBe(true);
    await ch.deliver(msg);

    // Third should be rate limited
    expect(ch.accepts(msg)).toBe(false);
    expect(backend.calls).toHaveLength(2);
  });

  it("delivers to all backends", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    const b1 = makeMockBackend("b1");
    const b2 = makeMockBackend("b2");
    ch.addBackend(b1);
    ch.addBackend(b2);

    const result = await ch.deliver(makeMessage({ status: "alert", message: "test push" }));

    expect(result.success).toBe(true);
    expect(result.channel).toBe("push");
    expect(b1.calls).toHaveLength(1);
    expect(b2.calls).toHaveLength(1);
    expect(b1.calls[0].title).toContain("test-repo");
    expect(b1.calls[0].body).toContain("test push");
  });

  it("returns failure when all backends fail", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    ch.addBackend(makeMockBackend("fail1", false));
    ch.addBackend(makeMockBackend("fail2", false));

    const result = await ch.deliver(makeMessage({ status: "alert" }));

    expect(result.success).toBe(false);
    expect(result.error).toBe("All push backends failed");
  });

  it("succeeds if at least one backend succeeds", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    ch.addBackend(makeMockBackend("fail", false));
    ch.addBackend(makeMockBackend("ok", true));

    const result = await ch.deliver(makeMessage({ status: "alert" }));

    expect(result.success).toBe(true);
  });

  it("strips markdown from notification body", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    const backend = makeMockBackend();
    ch.addBackend(backend);

    await ch.deliver(
      makeMessage({
        status: "alert",
        message: "**Bold** and [link](http://example.com) with `code`",
      }),
    );

    expect(backend.calls[0].body).toBe("Bold and link with code");
  });

  it("maps severity to notification priority", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    const backend = makeMockBackend();
    ch.addBackend(backend);

    await ch.deliver(makeMessage({ status: "alert", severity: "info" }));
    expect(backend.calls[0].priority).toBe("default");

    await ch.deliver(makeMessage({ status: "alert", severity: "warning" }));
    expect(backend.calls[1].priority).toBe("high");

    await ch.deliver(makeMessage({ status: "alert", severity: "critical" }));
    expect(backend.calls[2].priority).toBe("urgent");
  });

  it("truncates body to 256 chars", async () => {
    const ch = new PushChannel({
      enabled: true,
      minSeverity: "info",
      statuses: ["alert"],
    });
    const backend = makeMockBackend();
    ch.addBackend(backend);

    const longMsg = "A".repeat(500);
    await ch.deliver(makeMessage({ status: "alert", message: longMsg }));

    expect(backend.calls[0].body.length).toBe(256);
  });

  it("getBackends returns registered backends", () => {
    const ch = new PushChannel({ enabled: true });
    const b1 = makeMockBackend("b1");
    const b2 = makeMockBackend("b2");
    ch.addBackend(b1);
    ch.addBackend(b2);

    const backends = ch.getBackends();
    expect(backends).toHaveLength(2);
    expect(backends[0].name).toBe("b1");
    expect(backends[1].name).toBe("b2");
  });

  it("handles quiet hours within same day", () => {
    // Fake "now" as 14:00 — inside 09:00–17:00
    const fakeNow = () => {
      const d = new Date();
      d.setHours(14, 0, 0, 0);
      return d;
    };

    const ch = new PushChannel(
      {
        enabled: true,
        minSeverity: "info",
        statuses: ["alert"],
        quietHours: { start: "09:00", end: "17:00" },
      },
      fakeNow,
    );
    ch.addBackend(makeMockBackend());

    expect(ch.accepts(makeMessage({ status: "alert" }))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NtfyBackend tests
// ---------------------------------------------------------------------------

describe("NtfyBackend", () => {
  it("sends POST to ntfy server with correct headers", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any, init?: any) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response("ok", { status: 200 });
    };

    try {
      const backend = new NtfyBackend("my-topic", "https://ntfy.example.com");
      const result = await backend.send({
        title: "Test Title",
        body: "Test body message",
        priority: "high",
        tags: ["warning", "alert"],
      });

      expect(result).toBe(true);
      expect(capturedUrl).toBe("https://ntfy.example.com/my-topic");
      expect(capturedInit?.method).toBe("POST");
      expect(capturedInit?.body).toBe("Test body message");

      const headers = capturedInit?.headers as Record<string, string>;
      expect(headers.Title).toBe("Test Title");
      expect(headers.Priority).toBe("4"); // high = 4
      expect(headers.Tags).toBe("warning,alert");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses default ntfy.sh server", async () => {
    let capturedUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      capturedUrl = String(url);
      return new Response("ok", { status: 200 });
    };

    try {
      const backend = new NtfyBackend("my-alerts");
      await backend.send({
        title: "Test",
        body: "body",
        priority: "default",
      });

      expect(capturedUrl).toBe("https://ntfy.sh/my-alerts");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns false on HTTP error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("error", { status: 500 });

    try {
      const backend = new NtfyBackend("topic");
      const result = await backend.send({
        title: "T",
        body: "B",
        priority: "default",
      });
      expect(result).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("maps priority values correctly", async () => {
    const priorities: Array<{ input: PushNotification["priority"]; expected: string }> = [
      { input: "low", expected: "2" },
      { input: "default", expected: "3" },
      { input: "high", expected: "4" },
      { input: "urgent", expected: "5" },
    ];

    for (const { input, expected } of priorities) {
      let capturedHeaders: Record<string, string> = {};
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (_url: any, init?: any) => {
        capturedHeaders = init?.headers ?? {};
        return new Response("ok", { status: 200 });
      };

      try {
        const backend = new NtfyBackend("topic");
        await backend.send({ title: "T", body: "B", priority: input });
        expect(capturedHeaders.Priority).toBe(expected);
      } finally {
        globalThis.fetch = originalFetch;
      }
    }
  });

  it("includes click URL header when provided", async () => {
    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init?: any) => {
      capturedHeaders = init?.headers ?? {};
      return new Response("ok", { status: 200 });
    };

    try {
      const backend = new NtfyBackend("topic");
      await backend.send({
        title: "T",
        body: "B",
        priority: "default",
        url: "https://github.com/org/repo/pull/1",
      });
      expect(capturedHeaders.Click).toBe("https://github.com/org/repo/pull/1");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes auth token when configured", async () => {
    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init?: any) => {
      capturedHeaders = init?.headers ?? {};
      return new Response("ok", { status: 200 });
    };

    try {
      const backend = new NtfyBackend("topic", "https://ntfy.sh", "tk_abc123");
      await backend.send({ title: "T", body: "B", priority: "default" });
      expect(capturedHeaders.Authorization).toBe("Bearer tk_abc123");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("includes actions header when actions provided", async () => {
    let capturedHeaders: Record<string, string> = {};
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (_url: any, init?: any) => {
      capturedHeaders = init?.headers ?? {};
      return new Response("ok", { status: 200 });
    };

    try {
      const backend = new NtfyBackend("topic");
      await backend.send({
        title: "T",
        body: "B",
        priority: "default",
        actions: [
          { label: "View PR", url: "https://github.com/pr/1" },
          { label: "Dismiss", url: "https://example.com/dismiss" },
        ],
      });
      expect(capturedHeaders.Actions).toContain("View PR");
      expect(capturedHeaders.Actions).toContain("Dismiss");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// NativeBackend tests
// ---------------------------------------------------------------------------

describe("NativeBackend", () => {
  it("has name 'native'", () => {
    const backend = new NativeBackend();
    expect(backend.name).toBe("native");
  });

  it("returns false on unsupported platform", async () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform");
    Object.defineProperty(process, "platform", { value: "freebsd", configurable: true });

    try {
      const backend = new NativeBackend();
      const result = await backend.send({
        title: "Test",
        body: "Body",
        priority: "default",
      });
      expect(result).toBe(false);
    } finally {
      if (originalPlatform) {
        Object.defineProperty(process, "platform", originalPlatform);
      }
    }
  });
});
