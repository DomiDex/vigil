import { describe, test, expect } from "bun:test";
import { cn } from "../../../dashboard-v2/src/lib/cn";

describe("cn() utility", () => {
  test("merges class strings", () => {
    expect(cn("p-4", "m-2")).toBe("p-4 m-2");
  });

  test("resolves Tailwind conflicts (last wins)", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  test("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "visible")).toBe("base visible");
  });

  test("handles undefined and null inputs", () => {
    expect(cn("a", undefined, null, "b")).toBe("a b");
  });

  test("handles empty string", () => {
    expect(cn("")).toBe("");
  });

  test("merges complex Tailwind conflicts", () => {
    const result = cn("text-red-500 hover:text-blue-500", "text-green-300");
    expect(result).toContain("text-green-300");
    expect(result).not.toContain("text-red-500");
    // hover variant should be preserved (different modifier)
    expect(result).toContain("hover:text-blue-500");
  });
});
