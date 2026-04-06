import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import type { VigilConfig } from "../../core/config.ts";
import { type AnalysisProgress, StartupAnalyzer } from "../../llm/startup-analyzer.ts";
import { restoreBunSpawn } from "../helpers/mock-claude.ts";

const testConfig: VigilConfig = {
  tickInterval: 30,
  blockingBudget: 15,
  sleepAfter: 900,
  sleepTickInterval: 300,
  dreamAfter: 300,
  tickModel: "claude-haiku-4-5-20251001",
  escalationModel: "claude-sonnet-4-6",
  maxEventWindow: 100,
  notifyBackends: ["file"],
  webhookUrl: "",
  desktopNotify: true,
  allowModerateActions: false,
};

function mockSpawnSequence(
  responses: Map<string, string>,
  defaultResponse = "",
): {
  restore: () => void;
  getCalls: () => string[][];
} {
  const originalSpawn = Bun.spawn;
  const calls: string[][] = [];

  (Bun as any).spawn = (args: string[], _opts?: any) => {
    calls.push(args);
    const stdinChunks: string[] = [];

    // Match git commands by args
    const cmd = args.join(" ");
    let response = defaultResponse;
    for (const [pattern, resp] of responses) {
      if (cmd.includes(pattern)) {
        response = resp;
        break;
      }
    }

    const blob = new Blob([response]);
    return {
      stdin: {
        write(data: string) {
          stdinChunks.push(data);
        },
        end() {
          // For claude CLI calls, check stdin for matching
          if (args.includes("claude")) {
            const fullInput = stdinChunks.join("");
            for (const [pattern, _resp] of responses) {
              if (pattern === "claude" || fullInput.includes(pattern)) {
                // Override with LLM response
              }
            }
          }
        },
      },
      stdout: blob.stream(),
      stderr: new Blob([""]).stream(),
      exited: Promise.resolve(0),
      pid: 999,
      kill() {},
    };
  };

  return {
    restore: () => {
      (Bun as any).spawn = originalSpawn;
    },
    getCalls: () => calls,
  };
}

describe("StartupAnalyzer", () => {
  let analyzer: StartupAnalyzer;
  let tmpDir: string;

  beforeEach(async () => {
    const os = await import("node:os");
    tmpDir = `${os.tmpdir()}/vigil-startup-test-${Date.now()}`;
    mkdirSync(tmpDir, { recursive: true });
    analyzer = new StartupAnalyzer(testConfig);
  });

  afterEach(() => {
    restoreBunSpawn();
  });

  it("gathers git data and calls LLM for analysis", async () => {
    const llmResponse = JSON.stringify({
      summary: "A TypeScript CLI tool built with Bun",
      patterns: ["TDD workflow", "monolith architecture"],
      techStack: ["TypeScript", "Bun", "SQLite"],
      topics: [
        {
          name: "core-engine",
          summary: "Main tick and decision engine",
          observations: ["Uses 30s tick interval"],
          lastUpdated: Date.now(),
        },
      ],
      confidence: 0.85,
    });

    const responses = new Map([
      ["git log", "abc123 feat: initial commit\ndef456 fix: typo"],
      ["git branch", "* main\n  remotes/origin/main"],
      ["git shortlog", "     5\tDeveloper <dev@test.com>"],
      ["git diff --stat", " src/index.ts | 10 ++++"],
      ["git ls-files", "src/index.ts\npackage.json\nREADME.md"],
      ["claude", llmResponse],
    ]);

    const mock = mockSpawnSequence(responses, llmResponse);

    // Create manifest files
    writeFileSync(`${tmpDir}/package.json`, '{"name": "test", "dependencies": {}}');
    writeFileSync(`${tmpDir}/README.md`, "# Test Project\nA test.");

    const result = await analyzer.analyze(tmpDir);

    expect(result.summary).toBe("A TypeScript CLI tool built with Bun");
    expect(result.patterns).toContain("TDD workflow");
    expect(result.techStack).toContain("Bun");
    expect(result.topics.length).toBe(1);
    expect(result.topics[0].name).toBe("core-engine");
    expect(result.confidence).toBe(0.85);

    mock.restore();
  });

  it("fires progress callbacks for each phase", async () => {
    const llmResponse = JSON.stringify({
      summary: "Test",
      patterns: [],
      techStack: [],
      topics: [],
      confidence: 0.5,
    });

    const mock = mockSpawnSequence(new Map(), llmResponse);
    const phases: AnalysisProgress[] = [];

    await analyzer.analyze(tmpDir, (p) => phases.push(p));

    expect(phases.length).toBe(4);
    expect(phases.map((p) => p.phase)).toEqual(["git", "files", "manifests", "analysis"]);

    mock.restore();
  });

  it("handles missing files gracefully", async () => {
    // No README, no package.json in tmpDir
    const llmResponse = JSON.stringify({
      summary: "Minimal repo",
      patterns: [],
      techStack: [],
      topics: [],
      confidence: 0.3,
    });

    const mock = mockSpawnSequence(new Map(), llmResponse);
    const result = await analyzer.analyze(tmpDir);

    expect(result.summary).toBe("Minimal repo");
    expect(result.confidence).toBe(0.3);

    mock.restore();
  });

  it("returns fallback on LLM failure", async () => {
    const originalSpawn = Bun.spawn;

    (Bun as any).spawn = (args: string[], _opts?: any) => {
      const isLLM = args.includes("claude");
      const blob = new Blob([""]);
      return {
        stdin: {
          write() {},
          end() {},
        },
        stdout: blob.stream(),
        stderr: new Blob([isLLM ? "error" : ""]).stream(),
        exited: Promise.resolve(isLLM ? 1 : 0),
        pid: 999,
        kill() {},
      };
    };

    const result = await analyzer.analyze(tmpDir);

    expect(result.summary).toBe("Startup analysis failed");
    expect(result.confidence).toBe(0);
    expect(result.topics).toEqual([]);

    (Bun as any).spawn = originalSpawn;
  });

  it("ensures topics have proper timestamps", async () => {
    const llmResponse = JSON.stringify({
      summary: "Test",
      patterns: [],
      techStack: [],
      topics: [
        { name: "auth", summary: "Auth module", observations: [] },
        { name: "api", summary: "API layer" },
      ],
      confidence: 0.7,
    });

    const mock = mockSpawnSequence(new Map(), llmResponse);
    const result = await analyzer.analyze(tmpDir);

    for (const topic of result.topics) {
      expect(topic.lastUpdated).toBeGreaterThan(0);
      expect(Array.isArray(topic.observations)).toBe(true);
    }

    mock.restore();
  });
});
