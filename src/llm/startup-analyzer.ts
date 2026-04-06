import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VigilConfig } from "../core/config.ts";
import type { Topic } from "../memory/topic-tier.ts";
import { extractJSON } from "./decision-max.ts";

// ── Types ──

export interface StartupAnalysisResult {
  summary: string;
  patterns: string[];
  techStack: string[];
  topics: Topic[];
  confidence: number;
}

export interface AnalysisProgress {
  phase: string;
  detail: string;
}

// ── Manifest detection ──

const MANIFESTS = [
  "package.json",
  "Cargo.toml",
  "pyproject.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "Gemfile",
  "composer.json",
  "deno.json",
  "bun.lock",
];

// ── StartupAnalyzer ──

export class StartupAnalyzer {
  private config: VigilConfig;

  constructor(config: VigilConfig) {
    this.config = config;
  }

  async analyze(
    repoPath: string,
    onProgress?: (progress: AnalysisProgress) => void,
  ): Promise<StartupAnalysisResult> {
    const data: Record<string, string> = {};

    // Phase 1: Git history
    onProgress?.({ phase: "git", detail: "Reading commit history..." });
    data.gitLog = await this.runGit(repoPath, ["git", "log", "--oneline", "-50"]);
    data.branches = await this.runGit(repoPath, ["git", "branch", "-a"]);
    data.contributors = await this.runGit(repoPath, [
      "git",
      "shortlog",
      "-sn",
      "--no-merges",
      "-20",
    ]);
    data.recentVelocity = await this.runGit(repoPath, ["git", "diff", "--stat", "HEAD~10..HEAD"]);

    // Phase 2: File structure
    onProgress?.({ phase: "files", detail: "Scanning file structure..." });
    data.fileTree = await this.getFileTree(repoPath);

    // Phase 3: Project manifests
    onProgress?.({ phase: "manifests", detail: "Reading project files..." });
    data.manifests = await this.readManifests(repoPath);
    data.readme = await this.readFile(repoPath, "README.md", 2000);

    // Phase 4: LLM analysis
    onProgress?.({ phase: "analysis", detail: "Analyzing with LLM..." });
    const result = await this.analyzeWithLLM(data);

    return result;
  }

  private async runGit(repoPath: string, args: string[]): Promise<string> {
    try {
      const proc = Bun.spawn(args, {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;
      return stdout.trim();
    } catch {
      return "";
    }
  }

  private async getFileTree(repoPath: string): Promise<string> {
    try {
      // Use git ls-files for tracked files, limited depth approximation
      const proc = Bun.spawn(["git", "ls-files"], {
        cwd: repoPath,
        stdout: "pipe",
        stderr: "pipe",
      });
      const stdout = await new Response(proc.stdout).text();
      await proc.exited;

      const files = stdout.trim().split("\n").filter(Boolean);
      // Limit to 200 lines and show structure
      const limited = files.slice(0, 200);
      if (files.length > 200) {
        limited.push(`... and ${files.length - 200} more files`);
      }
      return limited.join("\n");
    } catch {
      return "";
    }
  }

  private async readManifests(repoPath: string): Promise<string> {
    const found: string[] = [];
    for (const manifest of MANIFESTS) {
      const content = await this.readFile(repoPath, manifest, 3000);
      if (content) {
        found.push(`=== ${manifest} ===\n${content}`);
      }
    }
    return found.join("\n\n") || "(no manifest files found)";
  }

  private async readFile(
    repoPath: string,
    relativePath: string,
    maxChars: number,
  ): Promise<string> {
    const fullPath = join(repoPath, relativePath);
    if (!existsSync(fullPath)) return "";
    try {
      const content = await Bun.file(fullPath).text();
      return content.length > maxChars ? `${content.slice(0, maxChars)}\n...(truncated)` : content;
    } catch {
      return "";
    }
  }

  private async analyzeWithLLM(data: Record<string, string>): Promise<StartupAnalysisResult> {
    const systemPrompt = `You are Vigil performing a deep initial analysis of a repository. Study everything provided and build a comprehensive understanding.

Respond with ONLY a JSON object:
{
  "summary": "3-5 sentence comprehensive repo profile",
  "patterns": ["pattern1", "pattern2", ...],
  "techStack": ["tech1", "tech2", ...],
  "topics": [
    { "name": "topic-name", "summary": "1-2 sentence summary", "observations": ["initial observation"], "lastUpdated": ${Date.now()} }
  ],
  "confidence": 0.0-1.0
}

For topics, identify 3-7 key areas of the project (e.g., "authentication", "database", "ci-cd", "testing", "api-design").
Each topic should capture a distinct area of knowledge about this repo.`;

    const prompt = `## Git History (last 50 commits)
${data.gitLog || "(empty)"}

## Branches
${data.branches || "(none)"}

## Top Contributors
${data.contributors || "(unknown)"}

## Recent Change Velocity (last 10 commits)
${data.recentVelocity || "(no data)"}

## File Structure
${data.fileTree || "(empty)"}

## Project Manifests
${data.manifests}

## README
${data.readme || "(no README)"}

Analyze this repository comprehensively.`;

    try {
      const raw = await this.callClaude(prompt, systemPrompt);
      const json = extractJSON(raw);
      const result = JSON.parse(json) as StartupAnalysisResult;

      // Ensure topics have proper timestamps
      for (const topic of result.topics ?? []) {
        topic.lastUpdated = topic.lastUpdated || Date.now();
        topic.observations = topic.observations || [];
      }

      return {
        summary: result.summary || "Analysis completed",
        patterns: result.patterns || [],
        techStack: result.techStack || [],
        topics: result.topics || [],
        confidence: result.confidence ?? 0.5,
      };
    } catch {
      return {
        summary: "Startup analysis failed",
        patterns: [],
        techStack: [],
        topics: [],
        confidence: 0,
      };
    }
  }

  private async callClaude(prompt: string, systemPrompt: string): Promise<string> {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const args = [
      "claude",
      "-p",
      "--output-format",
      "text",
      "--model",
      this.config.escalationModel,
    ];
    const fullPrompt = `<system>${systemPrompt}</system>\n\n${prompt}`;

    const proc = Bun.spawn(args, {
      env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    proc.stdin.write(fullPrompt);
    proc.stdin.end();

    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      throw new Error(`Claude CLI failed (exit ${exitCode}): ${stderr}`);
    }

    return stdout.trim();
  }
}
