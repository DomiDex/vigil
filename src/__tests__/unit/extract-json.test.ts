import { describe, expect, it } from "bun:test";
import { extractJSON } from "../../llm/decision-max.ts";

describe("extractJSON()", () => {
  it("returns clean JSON unchanged", () => {
    const input = '{"decision":"SILENT"}';
    expect(extractJSON(input)).toBe('{"decision":"SILENT"}');
  });

  it("extracts JSON from surrounding prose", () => {
    const input = 'Here:\n{"decision":"OBSERVE","content":"x"}\nDone.';
    const result = extractJSON(input);
    expect(JSON.parse(result)).toEqual({ decision: "OBSERVE", content: "x" });
  });

  it("extracts JSON from code fence", () => {
    const input = '```json\n{"decision":"ACT"}\n```';
    const result = extractJSON(input);
    expect(result).toContain('"decision":"ACT"');
  });

  it("handles nested JSON objects", () => {
    const input = '{"a":{"b":"c"}}';
    expect(extractJSON(input)).toBe('{"a":{"b":"c"}}');
  });

  it("returns original when no JSON", () => {
    const input = "No JSON here";
    expect(extractJSON(input)).toBe("No JSON here");
  });

  it("handles empty object", () => {
    const input = "Result: {}";
    expect(extractJSON(input)).toBe("{}");
  });

  it("extracts first valid JSON when multiple objects present", () => {
    const input = '{"first":1} and {"second":2}';
    const result = extractJSON(input);
    expect(result).toBe('{"first":1}');
  });

  it("falls through invalid brace to find valid JSON", () => {
    const input = 'Here is { broken then {"valid":true}';
    const result = extractJSON(input);
    expect(result).toBe('{"valid":true}');
  });

  it("returns original when no valid JSON object found", () => {
    const input = "Here is { broken";
    expect(extractJSON(input)).toBe("Here is { broken");
  });

  it("handles strings containing braces", () => {
    const input = '{"msg":"use {x} and {y}","ok":true}';
    const result = extractJSON(input);
    expect(JSON.parse(result)).toEqual({ msg: "use {x} and {y}", ok: true });
  });

  it("handles escaped quotes in strings", () => {
    const input = '{"msg":"say \\"hello\\"","ok":true}';
    const result = extractJSON(input);
    expect(JSON.parse(result).ok).toBe(true);
  });

  it("preserves JSON with newlines", () => {
    const input = '{\n  "decision": "SILENT"\n}';
    const result = extractJSON(input);
    expect(JSON.parse(result)).toEqual({ decision: "SILENT" });
  });

  it("returns empty string unchanged", () => {
    expect(extractJSON("")).toBe("");
  });
});
