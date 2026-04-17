export interface ParsedTestResult {
  name: string;
  file: string;
  passed: boolean;
  durationMs?: number;
  error?: string;
}

// ── JUnit XML Parser (primary) ──

// Matches both self-closing <testcase ... /> and <testcase ...>...</testcase>.
// Group 1 = attributes blob, group 3 = body (empty for self-closing).
const TESTCASE_REGEX = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
const ATTR_REGEX = /(\w+)="([^"]*)"/g;
const FAILURE_REGEX = /<(?:failure|error)\b[^>]*>([\s\S]*?)<\/(?:failure|error)>/;

function parseAttrs(attrStr: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of attrStr.matchAll(ATTR_REGEX)) attrs[m[1]] = m[2];
  return attrs;
}

export function parseJUnitXML(xml: string): ParsedTestResult[] {
  const results: ParsedTestResult[] = [];
  for (const match of xml.matchAll(TESTCASE_REGEX)) {
    const attrs = parseAttrs(match[1]);
    const name = attrs.name;
    if (!name) continue;

    const classname = attrs.classname ?? "";
    const body = match[3] ?? "";
    const failMatch = body ? FAILURE_REGEX.exec(body) : null;

    results.push({
      name: classname ? `${classname} > ${name}` : name,
      file: attrs.file || classname,
      passed: !failMatch,
      durationMs: attrs.time ? Number.parseFloat(attrs.time) * 1000 : undefined,
      error: failMatch ? failMatch[1].trim() : undefined,
    });
  }
  return results;
}

// ── Console Output Parser (fallback) ──

// Biome flags \u001b literally in a regex (noControlCharactersInRegex). Build at runtime instead.
const ANSI_REGEX = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, "g");

export function parseBunTestOutput(output: string): ParsedTestResult[] {
  const results: ParsedTestResult[] = [];
  const lines = output.split("\n");
  let currentFile = "";

  for (const raw of lines) {
    const line = raw.replace(ANSI_REGEX, "").trim();

    const fileMatch = line.match(/^([\w/.-]+\.test\.ts):$/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      continue;
    }

    const passMatch = line.match(/^(?:\u2713|\(pass\))\s+(.+?)(?:\s+\[([0-9.]+)ms\])?$/);
    if (passMatch) {
      results.push({
        name: passMatch[1],
        file: currentFile,
        passed: true,
        durationMs: passMatch[2] ? Number.parseFloat(passMatch[2]) : undefined,
      });
      continue;
    }

    const failMatch = line.match(/^(?:\u2717|\(fail\))\s+(.+?)(?:\s+\[([0-9.]+)ms\])?$/);
    if (failMatch) {
      results.push({
        name: failMatch[1],
        file: currentFile,
        passed: false,
        durationMs: failMatch[2] ? Number.parseFloat(failMatch[2]) : undefined,
      });
    }
  }

  return results;
}

// ── Parser Registry ──

type Parser = (input: string) => ParsedTestResult[];

export function getParser(input: string): Parser {
  const trimmed = input.trim();
  if (trimmed.startsWith("<?xml") || trimmed.startsWith("<testsuites")) {
    return parseJUnitXML;
  }
  return parseBunTestOutput;
}
