import { describe, test, expect } from "bun:test";

/**
 * Tests for DiffViewer line classification logic.
 *
 * The DiffViewer component classifies each line:
 *   - Lines starting with "+" (not "+++") -> addition (green)
 *   - Lines starting with "-" (not "---") -> deletion (red)
 *   - Lines starting with "@@"           -> hunk header (blue)
 *   - Lines starting with "diff --git"   -> file header
 *   - Everything else                    -> context (neutral)
 */

type LineType = "addition" | "deletion" | "hunk" | "header" | "context";

function classifyLine(line: string): LineType {
  if (line.startsWith("diff --git")) return "header";
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+") && !line.startsWith("+++")) return "addition";
  if (line.startsWith("-") && !line.startsWith("---")) return "deletion";
  return "context";
}

function classifyLines(
  diff: string,
): Array<{ line: string; type: LineType }> {
  return diff.split("\n").map((line) => ({
    line,
    type: classifyLine(line),
  }));
}

interface TruncationResult {
  displayText: string;
  isTruncated: boolean;
  originalSize: number;
}

function applyTruncation(
  text: string,
  maxBytes: number,
): TruncationResult {
  const size = new TextEncoder().encode(text).length;
  if (size <= maxBytes) {
    return { displayText: text, isTruncated: false, originalSize: size };
  }
  return {
    displayText: text.slice(0, maxBytes),
    isTruncated: true,
    originalSize: size,
  };
}

describe("DiffViewer line classification", () => {
  test("classifies addition lines (+ prefix)", () => {
    expect(classifyLine("+added line")).toBe("addition");
    expect(classifyLine("+")).toBe("addition");
    expect(classifyLine("+  indented")).toBe("addition");
  });

  test("classifies deletion lines (- prefix)", () => {
    expect(classifyLine("-removed line")).toBe("deletion");
    expect(classifyLine("-")).toBe("deletion");
    expect(classifyLine("-  indented")).toBe("deletion");
  });

  test("does not classify +++ as addition", () => {
    expect(classifyLine("+++ b/file.txt")).toBe("context");
  });

  test("does not classify --- as deletion", () => {
    expect(classifyLine("--- a/file.txt")).toBe("context");
  });

  test("classifies hunk headers (@@ prefix)", () => {
    expect(classifyLine("@@ -1,3 +1,4 @@")).toBe("hunk");
    expect(classifyLine("@@ -10,7 +10,9 @@ function foo() {")).toBe("hunk");
  });

  test("classifies file headers (diff --git prefix)", () => {
    expect(classifyLine("diff --git a/file.txt b/file.txt")).toBe("header");
  });

  test("classifies context lines (no prefix)", () => {
    expect(classifyLine(" unchanged line")).toBe("context");
    expect(classifyLine("index 1234567..abcdefg 100644")).toBe("context");
    expect(classifyLine("")).toBe("context");
  });
});

describe("DiffViewer bulk classification", () => {
  test("classifies a complete diff block", () => {
    const diff = `diff --git a/src/app.ts b/src/app.ts
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,4 @@
 import { foo } from "./foo";
+import { bar } from "./bar";

-const x = 1;
+const x = 2;`;

    const classified = classifyLines(diff);

    expect(classified[0].type).toBe("header");     // diff --git
    expect(classified[1].type).toBe("context");     // --- a/src/app.ts
    expect(classified[2].type).toBe("context");     // +++ b/src/app.ts
    expect(classified[3].type).toBe("hunk");        // @@ -1,3 +1,4 @@
    expect(classified[4].type).toBe("context");     // " import { foo ..."
    expect(classified[5].type).toBe("addition");    // +import { bar ...
    expect(classified[6].type).toBe("context");     // " "
    expect(classified[7].type).toBe("deletion");    // -const x = 1;
    expect(classified[8].type).toBe("addition");    // +const x = 2;
  });

  test("counts additions and deletions from classified lines", () => {
    const diff = `+line1
+line2
-removed1
 context
+line3`;

    const classified = classifyLines(diff);
    const additions = classified.filter((c) => c.type === "addition").length;
    const deletions = classified.filter((c) => c.type === "deletion").length;

    expect(additions).toBe(3);
    expect(deletions).toBe(1);
  });
});

describe("DiffViewer truncation logic", () => {
  test("does not truncate small content", () => {
    const result = applyTruncation("small diff", 500_000);
    expect(result.isTruncated).toBe(false);
    expect(result.displayText).toBe("small diff");
  });

  test("truncates content exceeding max bytes", () => {
    const bigText = "x".repeat(600_000);
    const result = applyTruncation(bigText, 500_000);
    expect(result.isTruncated).toBe(true);
    expect(result.displayText.length).toBe(500_000);
    expect(result.originalSize).toBe(600_000);
  });

  test("exact boundary is not truncated", () => {
    const exact = "x".repeat(500_000);
    const result = applyTruncation(exact, 500_000);
    expect(result.isTruncated).toBe(false);
  });

  test("empty content is not truncated", () => {
    const result = applyTruncation("", 500_000);
    expect(result.isTruncated).toBe(false);
    expect(result.originalSize).toBe(0);
  });
});
