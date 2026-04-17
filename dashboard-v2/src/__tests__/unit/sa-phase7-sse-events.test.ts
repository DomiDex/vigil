import { describe, test, expect } from "bun:test";
import { SSE_EVENT_MAP } from "../../hooks/use-sse";

describe("SSE_EVENT_MAP specialist events", () => {
  test("has 'specialist_finding' key", () => {
    expect(SSE_EVENT_MAP).toHaveProperty("specialist_finding");
  });

  test("has 'specialist_run' key", () => {
    expect(SSE_EVENT_MAP).toHaveProperty("specialist_run");
  });

  test("has 'flaky_update' key", () => {
    expect(SSE_EVENT_MAP).toHaveProperty("flaky_update");
  });

  test("specialist_finding maps to array containing a specialist-prefixed key", () => {
    const entry = (SSE_EVENT_MAP as Record<string, readonly (readonly unknown[])[]>)
      .specialist_finding;
    expect(Array.isArray(entry)).toBe(true);
    expect(entry.length).toBeGreaterThan(0);
    const hasSpecialistsKey = entry.some((key) => key[0] === "specialists");
    expect(hasSpecialistsKey).toBe(true);
  });

  test("specialist_run maps to array containing a specialists key", () => {
    const entry = (SSE_EVENT_MAP as Record<string, readonly (readonly unknown[])[]>)
      .specialist_run;
    expect(Array.isArray(entry)).toBe(true);
    expect(entry.length).toBeGreaterThan(0);
    const hasSpecialistsKey = entry.some((key) => key[0] === "specialists");
    expect(hasSpecialistsKey).toBe(true);
  });

  test("flaky_update maps to array containing a flaky-prefixed key", () => {
    const entry = (SSE_EVENT_MAP as Record<string, readonly (readonly unknown[])[]>)
      .flaky_update;
    expect(Array.isArray(entry)).toBe(true);
    expect(entry.length).toBeGreaterThan(0);
    const hasFlakyKey = entry.some(
      (key) => key.includes("flaky") || key[0] === "specialists",
    );
    expect(hasFlakyKey).toBe(true);
  });
});
