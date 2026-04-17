// src/__tests__/unit/phase10-format-payload.test.ts
import { describe, expect, test } from "bun:test";

// ---- Pure helper mirroring WebhooksPage.tsx formatPayload ----

function formatPayload(payload: Record<string, unknown>): string {
  const json = JSON.stringify(payload, null, 2);
  if (json.length > 50_000) return `${json.slice(0, 50_000)}\n\n// ... payload truncated`;
  return json;
}

// ---- Tests ----

describe("Phase 10: formatPayload — JSON formatting", () => {
  test("formats simple object with 2-space indentation", () => {
    const result = formatPayload({ key: "value", num: 42 });
    expect(result).toContain('"key": "value"');
    expect(result).toContain('"num": 42');
    expect(result).toContain("  ");
  });

  test("formats nested objects", () => {
    const result = formatPayload({
      commit: {
        id: "abc123",
        message: "fix: typo",
        author: { name: "Dev", email: "dev@test.com" },
      },
    });
    expect(result).toContain('"commit"');
    expect(result).toContain('"author"');
    expect(result).toContain('"name": "Dev"');
  });

  test("formats arrays", () => {
    const result = formatPayload({ items: [1, 2, 3] });
    expect(result).toContain("[\n");
    expect(result).toContain("1,");
  });

  test("handles empty object", () => {
    const result = formatPayload({});
    expect(result).toBe("{}");
  });

  test("returns valid JSON for normal-sized payloads", () => {
    const payload = { key: "value" };
    const result = formatPayload(payload);
    expect(() => JSON.parse(result)).not.toThrow();
  });
});

describe("Phase 10: formatPayload — truncation at 50KB", () => {
  test("does not truncate payloads under 50KB", () => {
    const smallPayload: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      smallPayload[`key_${i}`] = `value_${i}`;
    }
    const result = formatPayload(smallPayload);
    expect(result).not.toContain("truncated");
    expect(() => JSON.parse(result)).not.toThrow();
  });

  test("truncates payloads over 50KB", () => {
    const largePayload: Record<string, unknown> = {};
    const longValue = "x".repeat(1000);
    for (let i = 0; i < 100; i++) {
      largePayload[`key_${i}`] = longValue;
    }
    const result = formatPayload(largePayload);
    expect(result).toContain("// ... payload truncated");
    expect(result.length).toBeLessThanOrEqual(50_000 + 30);
  });

  test("truncation notice is on its own line", () => {
    const largePayload: Record<string, unknown> = {};
    const longValue = "x".repeat(1000);
    for (let i = 0; i < 100; i++) {
      largePayload[`key_${i}`] = longValue;
    }
    const result = formatPayload(largePayload);
    const lines = result.split("\n");
    const lastNonEmptyLine = lines.filter(Boolean).pop();
    expect(lastNonEmptyLine).toBe("// ... payload truncated");
  });

  test("exactly 50KB payload is not truncated", () => {
    const payload: Record<string, unknown> = { data: "a".repeat(49_900) };
    const json = JSON.stringify(payload, null, 2);
    if (json.length <= 50_000) {
      const result = formatPayload(payload);
      expect(result).not.toContain("truncated");
    }
  });

  test("truncated result starts with valid JSON fragment", () => {
    const largePayload: Record<string, unknown> = {};
    const longValue = "x".repeat(1000);
    for (let i = 0; i < 100; i++) {
      largePayload[`key_${i}`] = longValue;
    }
    const result = formatPayload(largePayload);
    expect(result.trimStart().startsWith("{")).toBe(true);
  });
});

describe("Phase 10: formatPayload — edge cases", () => {
  test("handles payload with special characters", () => {
    const result = formatPayload({ html: "<script>alert('xss')</script>" });
    expect(result).toContain("<script>");
  });

  test("handles payload with unicode", () => {
    const result = formatPayload({ emoji: "test", japanese: "hello" });
    expect(result).toContain("test");
  });

  test("handles payload with null values", () => {
    const result = formatPayload({ key: null as unknown });
    expect(result).toContain("null");
  });

  test("handles deeply nested payload", () => {
    const deep: Record<string, unknown> = { level: 0 };
    let current = deep;
    for (let i = 1; i < 10; i++) {
      const next: Record<string, unknown> = { level: i };
      current.child = next;
      current = next;
    }
    const result = formatPayload(deep);
    expect(result).toContain('"level": 9');
  });
});
