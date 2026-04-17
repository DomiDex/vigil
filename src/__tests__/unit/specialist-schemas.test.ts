import { describe, expect, test } from "bun:test";
import { FindingSchema, SpecialistResponseSchema } from "../../specialists/schemas.ts";

describe("FindingSchema", () => {
  test("parses valid finding", () => {
    const result = FindingSchema.parse({
      severity: "critical",
      title: "Hardcoded API key",
      detail: "Found exposed key in config.ts",
      file: "config.ts",
      line: 42,
      suggestion: "Use environment variables",
    });
    expect(result.severity).toBe("critical");
    expect(result.title).toBe("Hardcoded API key");
  });

  test("parses finding with optional fields null", () => {
    const result = FindingSchema.parse({
      severity: "info",
      title: "Minor style issue",
      detail: "Consider using const",
      file: null,
      line: null,
      suggestion: null,
    });
    expect(result.file).toBeNull();
    expect(result.line).toBeNull();
  });

  test("parses finding with optional fields omitted", () => {
    const result = FindingSchema.parse({
      severity: "warning",
      title: "Missing test",
      detail: "No tests for new function",
    });
    expect(result.file).toBeUndefined();
  });

  test("rejects invalid severity", () => {
    expect(() =>
      FindingSchema.parse({
        severity: "extreme",
        title: "Test",
        detail: "Detail",
      }),
    ).toThrow();
  });

  test("rejects missing required fields", () => {
    expect(() =>
      FindingSchema.parse({
        severity: "info",
      }),
    ).toThrow();
  });
});

describe("SpecialistResponseSchema", () => {
  test("parses valid response with findings", () => {
    const result = SpecialistResponseSchema.parse({
      findings: [{ severity: "warning", title: "Issue", detail: "Details" }],
      confidence: 0.85,
    });
    expect(result.findings).toHaveLength(1);
    expect(result.confidence).toBe(0.85);
  });

  test("parses empty findings array", () => {
    const result = SpecialistResponseSchema.parse({
      findings: [],
      confidence: 1.0,
      skippedReason: "No relevant changes",
    });
    expect(result.findings).toHaveLength(0);
    expect(result.skippedReason).toBe("No relevant changes");
  });

  test("rejects confidence out of range", () => {
    expect(() =>
      SpecialistResponseSchema.parse({
        findings: [],
        confidence: 1.5,
      }),
    ).toThrow();

    expect(() =>
      SpecialistResponseSchema.parse({
        findings: [],
        confidence: -0.1,
      }),
    ).toThrow();
  });

  test("rejects non-array findings", () => {
    expect(() =>
      SpecialistResponseSchema.parse({
        findings: "not an array",
        confidence: 0.5,
      }),
    ).toThrow();
  });
});
