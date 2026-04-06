import { describe, test, expect } from "bun:test";
import * as z from "zod";

// Re-create the schemas here to test validation logic independently
// (mirrors the schemas in decision-max.ts)
const DecisionSchema = z.object({
  decision: z.enum(["SILENT", "OBSERVE", "NOTIFY", "ACT"]),
  reasoning: z.string(),
  content: z.string().optional(),
  action: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const ConsolidationSchema = z.object({
  summary: z.string(),
  patterns: z.array(z.string()),
  insights: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

function extractJSON(text: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  return text;
}

describe("Decision validation", () => {
  test("parses valid SILENT decision", () => {
    const input = { decision: "SILENT", reasoning: "Nothing happening" };
    const result = DecisionSchema.parse(input);
    expect(result.decision).toBe("SILENT");
    expect(result.reasoning).toBe("Nothing happening");
  });

  test("parses valid OBSERVE decision with content", () => {
    const input = {
      decision: "OBSERVE",
      reasoning: "New branch detected",
      content: "Branch feature/auth created",
      confidence: 0.8,
    };
    const result = DecisionSchema.parse(input);
    expect(result.decision).toBe("OBSERVE");
    expect(result.content).toBe("Branch feature/auth created");
    expect(result.confidence).toBe(0.8);
  });

  test("parses valid ACT decision with action", () => {
    const input = {
      decision: "ACT",
      reasoning: "Stale branch detected",
      action: "Suggest deleting branch old-feature",
    };
    const result = DecisionSchema.parse(input);
    expect(result.action).toBe("Suggest deleting branch old-feature");
  });

  test("rejects invalid decision type", () => {
    const input = { decision: "PANIC", reasoning: "oh no" };
    expect(() => DecisionSchema.parse(input)).toThrow();
  });

  test("rejects missing reasoning", () => {
    const input = { decision: "SILENT" };
    expect(() => DecisionSchema.parse(input)).toThrow();
  });

  test("rejects confidence out of range", () => {
    const input = { decision: "SILENT", reasoning: "test", confidence: 1.5 };
    expect(() => DecisionSchema.parse(input)).toThrow();
  });

  test("rejects negative confidence", () => {
    const input = { decision: "SILENT", reasoning: "test", confidence: -0.1 };
    expect(() => DecisionSchema.parse(input)).toThrow();
  });

  test("allows optional fields to be absent", () => {
    const input = { decision: "SILENT", reasoning: "all good" };
    const result = DecisionSchema.parse(input);
    expect(result.content).toBeUndefined();
    expect(result.action).toBeUndefined();
    expect(result.confidence).toBeUndefined();
  });
});

describe("Consolidation validation", () => {
  test("parses valid consolidation result", () => {
    const input = {
      summary: "Active development on auth module",
      patterns: ["frequent commits to src/auth", "tests added last"],
      insights: ["Auth refactor in progress"],
      confidence: 0.9,
    };
    const result = ConsolidationSchema.parse(input);
    expect(result.patterns).toHaveLength(2);
    expect(result.insights).toHaveLength(1);
  });

  test("rejects missing patterns array", () => {
    const input = {
      summary: "test",
      insights: [],
      confidence: 0.5,
    };
    expect(() => ConsolidationSchema.parse(input)).toThrow();
  });

  test("rejects confidence > 1", () => {
    const input = {
      summary: "test",
      patterns: [],
      insights: [],
      confidence: 2.0,
    };
    expect(() => ConsolidationSchema.parse(input)).toThrow();
  });
});

describe("extractJSON", () => {
  test("extracts JSON from plain text", () => {
    const raw = `Here is the result: {"decision": "SILENT", "reasoning": "ok"}`;
    const json = extractJSON(raw);
    expect(JSON.parse(json)).toEqual({ decision: "SILENT", reasoning: "ok" });
  });

  test("extracts JSON from markdown code block", () => {
    const raw = "```json\n{\"decision\": \"OBSERVE\", \"reasoning\": \"branch\"}\n```";
    const json = extractJSON(raw);
    expect(JSON.parse(json)).toEqual({ decision: "OBSERVE", reasoning: "branch" });
  });

  test("handles raw JSON without wrapper", () => {
    const raw = '{"decision": "NOTIFY", "reasoning": "drift"}';
    const json = extractJSON(raw);
    expect(JSON.parse(json)).toEqual({ decision: "NOTIFY", reasoning: "drift" });
  });

  test("returns raw text when no JSON found", () => {
    const raw = "no json here";
    const json = extractJSON(raw);
    expect(json).toBe("no json here");
  });
});
