export interface ParsedTestResult {
  name: string;
  file: string;
  passed: boolean;
  durationMs?: number;
  error?: string;
}

// ── JUnit XML Parser (primary) ──

export function parseJUnitXML(xml: string): ParsedTestResult[] {
  const results: ParsedTestResult[] = [];
  const testcaseRegex =
    /<testcase\s+name="([^"]+)"\s+classname="([^"]*)"(?:\s+time="([^"]*)")?[^>]*>([\s\S]*?)<\/testcase>/g;
  const failureRegex = /<failure[^>]*>([\s\S]*?)<\/failure>/;

  let match: RegExpExecArray | null;
  while ((match = testcaseRegex.exec(xml)) !== null) {
    const [, name, classname, time, body] = match;
    const failMatch = failureRegex.exec(body);
    results.push({
      name: classname ? `${classname} > ${name}` : name,
      file: classname || "",
      passed: !failMatch,
      durationMs: time ? Number.parseFloat(time) * 1000 : undefined,
      error: failMatch ? failMatch[1].trim() : undefined,
    });
  }
  return results;
}

// ── Console Output Parser (fallback) ──

const ANSI_REGEX = /\u001b\[[0-9;]*m/g;

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
