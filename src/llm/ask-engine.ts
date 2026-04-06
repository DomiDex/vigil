import type { VigilConfig } from "../core/config.ts";
import type { IndexTier } from "../memory/index-tier.ts";
import type { EventLog, VectorStore } from "../memory/store.ts";
import type { TopicTier } from "../memory/topic-tier.ts";
import { listFiles, readFileRange, searchCodebase } from "./code-tools.ts";
import { extractJSON } from "./decision-max.ts";

/** Parse a command string respecting single/double quotes */
function parseShellArgs(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
    } else if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

// ── Types ──

export interface AskContext {
  repo: string;
  repoPath: string;
  vectorStore: VectorStore;
  topicTier: TopicTier;
  indexTier: IndexTier;
  eventLog: EventLog;
}

export interface AskResult {
  answer: string;
  sources: string[];
  rounds: number;
}

interface AskToolCall {
  tool: string;
  args: Record<string, unknown>;
}

interface AskResponse {
  tool_calls?: AskToolCall[];
  reasoning?: string;
}

// ── Read-only git whitelist ──

const SAFE_GIT_SUBCOMMANDS = new Set([
  "log",
  "diff",
  "show",
  "status",
  "branch",
  "shortlog",
  "describe",
  "rev-parse",
  "ls-files",
  "ls-tree",
  "blame",
  "reflog",
]);

// ── Tool definitions for ask mode ──

const ASK_TOOL_DEFINITIONS = [
  {
    name: "search_memory",
    description: "Search past observations and memories by keyword",
    parameters: { query: "string", limit: "number (default 5)" },
  },
  {
    name: "load_topic",
    description: "Load a specific topic from tiered memory",
    parameters: { topic: "string — topic name" },
  },
  {
    name: "read_file",
    description: "Read a file from the repository",
    parameters: { path: "string — relative path from repo root" },
  },
  {
    name: "search_codebase",
    description: "Search the repository for a pattern (regex supported, uses git grep)",
    parameters: {
      pattern: "string — search pattern",
      glob: "string — optional file filter (e.g., '*.ts')",
      maxResults: "number — max matches (default 20)",
    },
  },
  {
    name: "list_files",
    description: "List files in the repository, optionally filtered by path or glob",
    parameters: {
      path: "string — directory path (e.g., 'src/core')",
      glob: "string — glob filter (e.g., '*.test.ts')",
    },
  },
  {
    name: "read_file_range",
    description: "Read specific lines from a file (more precise than read_file)",
    parameters: {
      path: "string — relative path",
      startLine: "number — first line (1-based)",
      endLine: "number — last line (inclusive)",
    },
  },
  {
    name: "run_git",
    description: "Run a read-only git command (allowed: log, diff, show, status, branch, shortlog, blame, ls-files)",
    parameters: { command: "string — full git command, e.g. 'git log --oneline -20'" },
  },
  {
    name: "answer",
    description: "Provide your final answer to the user's question. Call this when you have enough information.",
    parameters: { text: "string — your answer", sources: "string[] — what you consulted" },
  },
];

function formatAskToolsForPrompt(): string {
  const toolList = ASK_TOOL_DEFINITIONS.map(
    (t) => `- ${t.name}: ${t.description}\n  Args: ${JSON.stringify(t.parameters)}`,
  ).join("\n");

  return `Available tools (read-only):
${toolList}

Respond with ONLY a JSON object:
{
  "tool_calls": [{ "tool": "tool_name", "args": { ... } }],
  "reasoning": "brief explanation of what you're investigating"
}

IMPORTANT: When you have enough information, call "answer" with your response.`;
}

// ── AskEngine ──

export class AskEngine {
  private config: VigilConfig;
  private static readonly MAX_ROUNDS = 5;

  constructor(config: VigilConfig) {
    this.config = config;
  }

  async investigate(question: string, context: string, askCtx: AskContext): Promise<AskResult> {
    // Build initial context with memory injection
    const indexPrompt = askCtx.indexTier.formatForPrompt(askCtx.repo);
    const recentMemories = askCtx.vectorStore.getByRepo(askCtx.repo, 10);
    const memorySummary = recentMemories.map((m) => `- [${m.type}] ${m.content}`).join("\n") || "(none)";
    const topics = askCtx.topicTier.listTopics(askCtx.repo);
    const topicList = topics.length > 0 ? `Available topics: ${topics.join(", ")}` : "(no topics)";

    const systemPrompt = `You are Vigil, an always-on git monitoring agent. Answer the user's question using all available context and tools.

You have access to repository memory, topics, files, and git commands. Investigate thoroughly before answering.

${formatAskToolsForPrompt()}`;

    let currentPrompt = `Memory index:
${indexPrompt}

Recent observations:
${memorySummary}

${topicList}

Repository context:
${context}

User question: ${question}

Investigate using the tools above, then call "answer" when ready.`;

    const sources: string[] = [];
    let rounds = 0;

    for (rounds = 0; rounds < AskEngine.MAX_ROUNDS; rounds++) {
      const raw = await this.callClaude(currentPrompt, systemPrompt);

      let parsed: AskResponse;
      try {
        const json = extractJSON(raw);
        parsed = JSON.parse(json);
      } catch {
        // If LLM returns plain text, treat it as a direct answer
        return { answer: raw.trim(), sources, rounds: rounds + 1 };
      }

      const toolCalls = parsed.tool_calls ?? [];
      if (toolCalls.length === 0) {
        // No tools called — force a final answer on next round
        if (parsed.reasoning) {
          return { answer: parsed.reasoning, sources, rounds: rounds + 1 };
        }
        break;
      }

      // Check for terminal "answer" tool
      const answerCall = toolCalls.find((tc) => tc.tool === "answer");
      if (answerCall) {
        const answerSources = (answerCall.args.sources as string[]) ?? [];
        sources.push(...answerSources);
        return {
          answer: (answerCall.args.text as string) || parsed.reasoning || "",
          sources,
          rounds: rounds + 1,
        };
      }

      // Execute tools and collect results
      const results: { tool: string; result: unknown; error?: string }[] = [];
      for (const call of toolCalls) {
        if (typeof call.tool !== "string" || typeof call.args !== "object" || call.args === null) {
          results.push({ tool: String(call.tool ?? "unknown"), result: null, error: "Malformed tool call — skipped" });
          continue;
        }
        const result = await this.executeTool(call, askCtx);
        results.push(result);
        if (!result.error) {
          sources.push(`${call.tool}:${JSON.stringify(call.args)}`);
        }
      }

      // Sanitize results before feeding back to LLM
      const sanitized = results.map((r) => ({
        tool: String(r.tool),
        result: r.result !== undefined ? r.result : null,
        ...(r.error ? { error: String(r.error) } : {}),
      }));

      // Feed results back
      currentPrompt = `Tool results:\n${JSON.stringify(sanitized, null, 2)}\n\nContinue investigating or call "answer" when you have enough information.`;
    }

    // Max rounds reached — force final answer
    const finalRaw = await this.callClaude(
      `You've completed your investigation. Based on everything you found, answer the original question now.\n\nOriginal question: ${question}\n\nRespond with ONLY a JSON object:\n{ "tool_calls": [{ "tool": "answer", "args": { "text": "your answer", "sources": [] } }] }`,
      systemPrompt,
    );

    try {
      const json = extractJSON(finalRaw);
      const parsed = JSON.parse(json);
      const answerCall = parsed.tool_calls?.find((tc: any) => tc.tool === "answer");
      if (answerCall) {
        return {
          answer: answerCall.args.text || "",
          sources,
          rounds: rounds + 1,
        };
      }
    } catch {
      // Fall through
    }

    return { answer: finalRaw.trim(), sources, rounds: rounds + 1 };
  }

  private async executeTool(
    call: AskToolCall,
    ctx: AskContext,
  ): Promise<{ tool: string; result: unknown; error?: string }> {
    try {
      switch (call.tool) {
        case "search_memory": {
          const results = ctx.vectorStore.hybridSearch(call.args.query as string, (call.args.limit as number) ?? 5);
          return { tool: "search_memory", result: results.map((r) => r.content) };
        }

        case "load_topic": {
          const topic = ctx.topicTier.getTopic(ctx.repo, call.args.topic as string);
          if (!topic) {
            return {
              tool: "load_topic",
              result: null,
              error: `Topic "${call.args.topic}" not found`,
            };
          }
          return { tool: "load_topic", result: topic };
        }

        case "read_file": {
          const filePath = call.args.path as string;
          // Prevent path traversal
          if (filePath.includes("..")) {
            return { tool: "read_file", result: null, error: "Path traversal not allowed" };
          }
          const fullPath = `${ctx.repoPath}/${filePath}`;
          try {
            const content = await Bun.file(fullPath).text();
            // Truncate large files
            const maxChars = 4000;
            return {
              tool: "read_file",
              result: content.length > maxChars ? `${content.slice(0, maxChars)}\n...(truncated)` : content,
            };
          } catch {
            return { tool: "read_file", result: null, error: `File not found: ${filePath}` };
          }
        }

        case "search_codebase": {
          return searchCodebase(
            ctx.repoPath,
            call.args.pattern as string,
            call.args.glob as string | undefined,
            call.args.maxResults as number | undefined,
          );
        }

        case "list_files": {
          return listFiles(ctx.repoPath, call.args.path as string | undefined, call.args.glob as string | undefined);
        }

        case "read_file_range": {
          return readFileRange(
            ctx.repoPath,
            call.args.path as string,
            call.args.startLine as number | undefined,
            call.args.endLine as number | undefined,
          );
        }

        case "run_git": {
          const cmdStr = call.args.command as string;
          const parts = parseShellArgs(cmdStr);
          if (parts[0] !== "git") {
            return { tool: "run_git", result: null, error: "Only git commands allowed" };
          }
          const subcommand = parts[1];
          if (!subcommand || !SAFE_GIT_SUBCOMMANDS.has(subcommand)) {
            return {
              tool: "run_git",
              result: null,
              error: `Git subcommand "${subcommand}" not allowed. Allowed: ${[...SAFE_GIT_SUBCOMMANDS].join(", ")}`,
            };
          }
          const proc = Bun.spawn(parts, {
            cwd: ctx.repoPath,
            stdout: "pipe",
            stderr: "pipe",
          });
          const stdout = await new Response(proc.stdout).text();
          const exitCode = await proc.exited;
          if (exitCode !== 0) {
            const stderr = await new Response(proc.stderr).text();
            return { tool: "run_git", result: null, error: stderr.trim() };
          }
          // Truncate large output
          const maxChars = 4000;
          return {
            tool: "run_git",
            result: stdout.length > maxChars ? `${stdout.slice(0, maxChars)}\n...(truncated)` : stdout.trim(),
          };
        }

        default:
          return { tool: call.tool, result: null, error: `Unknown tool: ${call.tool}` };
      }
    } catch (err) {
      return { tool: call.tool, result: null, error: String(err) };
    }
  }

  private async callClaude(prompt: string, systemPrompt: string): Promise<string> {
    const env = { ...process.env };
    delete env.ANTHROPIC_API_KEY;

    const args = ["claude", "-p", "--output-format", "text", "--model", this.config.escalationModel];
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
