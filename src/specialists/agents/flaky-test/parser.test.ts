import { describe, expect, test } from "bun:test";
import { getParser, parseBunTestOutput, parseJUnitXML } from "./parser.ts";

// ── JUnit XML fixtures ──

const JUNIT_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="src/core/config.test.ts" tests="3" failures="1" time="0.045">
    <testcase name="loads default config" classname="src/core/config.test.ts" time="0.012">
    </testcase>
    <testcase name="saves config to disk" classname="src/core/config.test.ts" time="0.008">
    </testcase>
    <testcase name="validates tick interval" classname="src/core/config.test.ts" time="0.025">
      <failure type="AssertionError">Expected 30 to be 60</failure>
    </testcase>
  </testsuite>
</testsuites>`;

const JUNIT_EMPTY = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites><testsuite name="empty" tests="0" failures="0"></testsuite></testsuites>`;

// Real Bun output: self-closing <testcase /> for passing tests, separate file= attr
const JUNIT_BUN_REAL = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="bun test" tests="3" failures="1" time="0.05">
  <testsuite name="src/foo.test.ts" file="src/foo.test.ts" tests="3" failures="1">
    <testsuite name="fooBlock" file="src/foo.test.ts" line="9" tests="3" failures="1">
      <testcase name="passes fast" classname="fooBlock" time="0.0001" file="src/foo.test.ts" line="10" assertions="1" />
      <testcase name="passes slow" classname="fooBlock" time="0.0012" file="src/foo.test.ts" line="20" assertions="1" />
      <testcase name="fails hard" classname="fooBlock" time="0.0005" file="src/foo.test.ts" line="30" assertions="1">
        <failure type="AssertionError">Expected true to be false</failure>
      </testcase>
    </testsuite>
  </testsuite>
</testsuites>`;

// ── Console output fixtures ──

const CONSOLE_SAMPLE = `src/core/config.test.ts:
\u2713 loads default config [0.12ms]
\u2713 saves config to disk [0.08ms]
\u2717 validates tick interval [0.25ms]

src/memory/store.test.ts:
\u2713 stores and retrieves memory [1.45ms]
(pass) rounds trip through FTS [0.92ms]
(fail) handles concurrent writes`;

const CONSOLE_EMPTY = "";

describe("parseJUnitXML", () => {
  test("parses valid JUnit XML", () => {
    const results = parseJUnitXML(JUNIT_SAMPLE);
    expect(results.length).toBe(3);

    expect(results[0].name).toBe("src/core/config.test.ts > loads default config");
    expect(results[0].passed).toBe(true);
    expect(results[0].durationMs).toBeCloseTo(12, 0);

    expect(results[2].name).toBe("src/core/config.test.ts > validates tick interval");
    expect(results[2].passed).toBe(false);
    expect(results[2].error).toContain("Expected 30 to be 60");
  });

  test("returns empty array for empty test suite", () => {
    const results = parseJUnitXML(JUNIT_EMPTY);
    expect(results).toEqual([]);
  });

  test("returns empty array for invalid XML", () => {
    const results = parseJUnitXML("not xml at all");
    expect(results).toEqual([]);
  });

  test("parses real Bun JUnit output with self-closing testcase tags", () => {
    const results = parseJUnitXML(JUNIT_BUN_REAL);
    expect(results.length).toBe(3);

    // Self-closing passes must be captured
    expect(results[0].name).toBe("fooBlock > passes fast");
    expect(results[0].passed).toBe(true);
    expect(results[0].durationMs).toBeCloseTo(0.1, 2);

    expect(results[1].name).toBe("fooBlock > passes slow");
    expect(results[1].passed).toBe(true);

    // Failing testcase with <failure> child
    expect(results[2].name).toBe("fooBlock > fails hard");
    expect(results[2].passed).toBe(false);
    expect(results[2].error).toContain("Expected true to be false");

    // file= attribute must win over classname
    for (const r of results) {
      expect(r.file).toBe("src/foo.test.ts");
    }
  });
});

describe("parseBunTestOutput", () => {
  test("parses console output with pass/fail markers", () => {
    const results = parseBunTestOutput(CONSOLE_SAMPLE);
    expect(results.length).toBe(6);

    expect(results[0].name).toBe("loads default config");
    expect(results[0].file).toBe("src/core/config.test.ts");
    expect(results[0].passed).toBe(true);
    expect(results[0].durationMs).toBeCloseTo(0.12, 2);

    expect(results[2].name).toBe("validates tick interval");
    expect(results[2].passed).toBe(false);

    // (pass) and (fail) variants
    expect(results[4].name).toBe("rounds trip through FTS");
    expect(results[4].passed).toBe(true);

    expect(results[5].name).toBe("handles concurrent writes");
    expect(results[5].passed).toBe(false);
  });

  test("returns empty array for empty output", () => {
    const results = parseBunTestOutput(CONSOLE_EMPTY);
    expect(results).toEqual([]);
  });

  test("handles ANSI color codes", () => {
    const colored = "\u001b[32m\u2713\u001b[0m \u001b[90mtest name\u001b[0m \u001b[90m[0.5ms]\u001b[0m";
    const results = parseBunTestOutput(colored);
    expect(results.length).toBe(1);
    expect(results[0].passed).toBe(true);
  });
});

describe("getParser", () => {
  test("returns JUnit parser for XML input", () => {
    const parser = getParser('<?xml version="1.0"?>');
    expect(parser).toBe(parseJUnitXML);
  });

  test("returns JUnit parser for testsuites input", () => {
    const parser = getParser("<testsuites>");
    expect(parser).toBe(parseJUnitXML);
  });

  test("returns console parser for non-XML input", () => {
    const parser = getParser("src/foo.test.ts:\n\u2713 test [0.1ms]");
    expect(parser).toBe(parseBunTestOutput);
  });
});
