import { ActionExecutor } from "../action/executor.ts";
import type { Coordinator } from "../core/coordinator.ts";
import type { Scheduler } from "../core/scheduler.ts";
import type { EventSubscription, GitEventType, SleepController, WakeTrigger } from "../core/sleep-controller.ts";
import type { TaskManager } from "../core/task-manager.ts";
import type { CrossRepoAnalyzer } from "../memory/cross-repo.ts";
import type { EventLog, VectorStore } from "../memory/store.ts";
import type { TopicTier } from "../memory/topic-tier.ts";
import { listFiles, readFileRange, searchCodebase, summarizeStructure } from "./code-tools.ts";

// ── Types ──

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface ToolResult {
  tool: string;
  result: unknown;
  error?: string;
}

export interface ToolContext {
  repo: string;
  tickNum: number;
  vectorStore: VectorStore;
  topicTier: TopicTier;
  sleepController: SleepController;
  eventLog: EventLog;
  scheduler?: Scheduler;
  coordinator?: Coordinator;
  actionExecutor?: ActionExecutor;
  taskManager?: TaskManager;
  crossRepoAnalyzer?: CrossRepoAnalyzer;
  repoPath?: string;
}

// ── Tool Definitions ──

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "observe",
    description:
      "Store an observation in memory for future reference. Optionally assign it to a topic for incremental learning.",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string", description: "The observation text" },
        confidence: {
          type: "number",
          description: "0.0-1.0 confidence level",
        },
        topic: {
          type: "string",
          description:
            "Optional topic name to associate with (e.g., 'testing', 'architecture', 'deployment'). Creates topic if new.",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "notify",
    description: "Send a notification to the developer",
    parameters: {
      type: "object",
      properties: {
        message: { type: "string", description: "Notification message" },
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
          description: "Notification severity",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "sleep",
    description: "Request entering low-power sleep mode to save tokens during idle periods",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["duration", "condition"],
          description: "Sleep mode type",
        },
        durationMinutes: {
          type: "number",
          description: "Minutes to sleep (for duration type)",
        },
        wakeOn: {
          type: "array",
          items: { type: "string", enum: ["git_event", "time", "user_input"] },
          description: "Events that should wake the agent (for condition type)",
        },
        reason: { type: "string", description: "Why you are requesting sleep" },
      },
      required: ["type", "reason"],
    },
  },
  {
    name: "search_memory",
    description: "Search past observations and memories by keyword",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: {
          type: "number",
          description: "Max results to return (default 5)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "load_topic",
    description: "Load a specific topic from tiered memory",
    parameters: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic name to load" },
      },
      required: ["topic"],
    },
  },
  {
    name: "spawn_worker",
    description:
      "Spawn a scoped sub-agent for deep analysis (uses haiku by default, max 2 concurrent)",
    parameters: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Task prompt for the worker agent",
        },
        model: {
          type: "string",
          description: "Model to use (default: claude-haiku-4-5-20251001)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "schedule",
    description: "Create a recurring scheduled task (e.g., check for stale branches every Monday)",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Human-readable schedule name" },
        cron: {
          type: "string",
          description: "Cron expression (e.g., '0 9 * * MON')",
        },
        action: {
          type: "string",
          description: "What to do when the schedule fires",
        },
      },
      required: ["name", "cron", "action"],
    },
  },
  {
    name: "read_file",
    description:
      "Read a file from the repository to review its contents. Use this to inspect code changes, understand implementation, or review for quality issues.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from repo root (e.g., 'src/index.ts')",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "review",
    description:
      "Produce a code review or analysis report. Use this after reading files and inspecting changes to deliver actionable feedback to the developer.",
    parameters: {
      type: "object",
      properties: {
        report: {
          type: "string",
          description:
            "The full review: code quality issues, bugs, suggestions, architectural concerns. Be specific with file:line references.",
        },
        severity: {
          type: "string",
          enum: ["info", "warning", "critical"],
          description: "Overall severity of findings",
        },
      },
      required: ["report"],
    },
  },
  {
    name: "execute_action",
    description:
      "Execute a git command or system action. Safe read-only commands run immediately; dangerous ones require user approval.",
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The command to execute (e.g., 'git log --oneline -10', 'git stash')",
        },
        reason: {
          type: "string",
          description: "Why this action is needed",
        },
      },
      required: ["command", "reason"],
    },
  },
  {
    name: "search_codebase",
    description:
      "Search the repository codebase for a pattern (uses git grep). Returns matching lines with file paths and line numbers.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Search pattern (regex supported)" },
        glob: {
          type: "string",
          description: "Optional file glob filter (e.g., '*.ts', 'src/**/*.js')",
        },
        maxResults: {
          type: "number",
          description: "Max matches to return (default 20, max 20)",
        },
      },
      required: ["pattern"],
    },
  },
  {
    name: "list_files",
    description:
      "List files in the repository, optionally filtered by path prefix or glob pattern.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Directory path to list (e.g., 'src/core')",
        },
        glob: {
          type: "string",
          description: "Glob pattern to filter results (e.g., '*.test.ts')",
        },
      },
    },
  },
  {
    name: "read_file_range",
    description:
      "Read specific lines from a file. More precise than read_file — use for targeted inspection of large files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Relative path from repo root (e.g., 'src/index.ts')",
        },
        startLine: {
          type: "number",
          description: "First line to read (1-based, default 1)",
        },
        endLine: {
          type: "number",
          description: "Last line to read (inclusive, default end of file)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "summarize_structure",
    description:
      "Show the repository directory tree with file counts. Gives you a map of the codebase.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Optional subdirectory to focus on (e.g., 'src')",
        },
      },
    },
  },
  {
    name: "create_task",
    description:
      "Create a persistent task to track multi-step work across ticks and restarts. Use for investigations, monitoring goals, or multi-day workflows.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short task title" },
        description: { type: "string", description: "Detailed task description" },
        wait_condition: {
          type: "object",
          description:
            'Optional condition to wait for before activating. Example: {"type":"event","eventType":"new_commit"} or {"type":"task","taskId":"..."}',
          properties: {
            type: { type: "string", enum: ["event", "task", "schedule"] },
            eventType: { type: "string" },
            filter: { type: "string" },
            taskId: { type: "string" },
            cron: { type: "string" },
          },
        },
        parent_id: { type: "string", description: "Parent task ID for subtask relationships" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_tasks",
    description: "List persistent tasks, optionally filtered by status or repo.",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "active", "waiting", "completed", "failed", "cancelled"],
          description: "Filter by status",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
    },
  },
  {
    name: "cross_repo_search",
    description:
      "Search memories across all monitored repositories. Use to find patterns, shared concerns, or correlations between repos.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        repos: {
          type: "array",
          items: { type: "string" },
          description: "Optional list of repo names to search (searches all if omitted)",
        },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "declare_relation",
    description:
      "Declare a relationship between the current repo and another repo (e.g., dependency, shared pattern).",
    parameters: {
      type: "object",
      properties: {
        other_repo: { type: "string", description: "Name of the related repository" },
        relation_type: {
          type: "string",
          enum: ["dependency", "shared_pattern", "related_concern", "monorepo_sibling"],
          description: "Type of relationship",
        },
        description: { type: "string", description: "Description of the relationship" },
      },
      required: ["other_repo", "relation_type", "description"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task as completed with a result summary.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Task ID to complete" },
        result: { type: "string", description: "Result or summary of what was accomplished" },
      },
      required: ["id", "result"],
    },
  },
  {
    name: "run_check",
    description:
      "Run a static analysis check (linter, type checker, test runner) and get summarized results. Auto-detects available tools if type is 'auto'.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["eslint", "tsc", "biome", "pytest", "bun-test", "auto"],
          description: "Check type to run, or 'auto' to detect and run all available",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "silent",
    description: "No action needed — routine state. Use when nothing interesting is happening.",
    parameters: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Brief explanation of why nothing is needed",
        },
      },
      required: ["reasoning"],
    },
  },
  {
    name: "subscribe_event",
    description:
      "Subscribe to specific git events for fine-grained wake conditions. When sleeping with wakeOn=['git_event'], only matching subscriptions will trigger a wake. Without subscriptions, any git event wakes the agent.",
    parameters: {
      type: "object",
      properties: {
        event_type: {
          type: "string",
          enum: ["file_change", "new_commit", "branch_switch", "uncommitted_drift"],
          description: "Git event type to subscribe to",
        },
        filter: {
          type: "string",
          description:
            "Optional substring filter on event detail (e.g., 'src/' to match file changes in src, 'main' to match branch switches to main)",
        },
      },
      required: ["event_type"],
    },
  },
];

export function formatToolsForPrompt(): string {
  const toolSummary = TOOL_DEFINITIONS.map((t) => `- ${t.name}: ${t.description}`).join("\n");

  return `Available tools:
${toolSummary}

Respond with ONLY a JSON object:
{
  "tool_calls": [{ "tool": "tool_name", "args": { ... } }],
  "reasoning": "brief explanation"
}

You may call multiple tools per response. Call "silent" if nothing needs doing.`;
}

// ── Tool Executor ──

export class ToolExecutor {
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    try {
      switch (call.tool) {
        case "observe":
          return this.execObserve(call.args);
        case "notify":
          return this.execNotify(call.args);
        case "sleep":
          return this.execSleep(call.args);
        case "search_memory":
          return this.execSearchMemory(call.args);
        case "load_topic":
          return this.execLoadTopic(call.args);
        case "spawn_worker":
          return this.execSpawnWorker(call.args);
        case "schedule":
          return this.execSchedule(call.args);
        case "read_file":
          return this.execReadFile(call.args);
        case "search_codebase":
          return this.execSearchCodebase(call.args);
        case "list_files":
          return this.execListFiles(call.args);
        case "read_file_range":
          return this.execReadFileRange(call.args);
        case "summarize_structure":
          return this.execSummarizeStructure(call.args);
        case "review":
          return this.execReview(call.args);
        case "create_task":
          return this.execCreateTask(call.args);
        case "list_tasks":
          return this.execListTasks(call.args);
        case "complete_task":
          return this.execCompleteTask(call.args);
        case "cross_repo_search":
          return this.execCrossRepoSearch(call.args);
        case "declare_relation":
          return this.execDeclareRelation(call.args);
        case "execute_action":
          return this.execAction(call.args);
        case "run_check":
          return this.execRunCheck(call.args);
        case "silent":
          return { tool: "silent", result: "ok" };
        case "subscribe_event":
          return this.execSubscribeEvent(call.args);
        default:
          return {
            tool: call.tool,
            result: null,
            error: `Unknown tool: ${call.tool}`,
          };
      }
    } catch (err) {
      return { tool: call.tool, result: null, error: String(err) };
    }
  }

  private execObserve(args: Record<string, unknown>): ToolResult {
    const content = args.content as string;
    const confidence = (args.confidence as number) ?? 0.5;
    const topic = (args.topic as string) || undefined;

    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      repo: this.ctx.repo,
      type: "decision" as const,
      content,
      metadata: { tickNum: this.ctx.tickNum, tool: "observe" },
      confidence,
    };
    this.ctx.vectorStore.store(entry);
    this.ctx.eventLog.append(this.ctx.repo, {
      type: "observe",
      detail: content,
    });

    // Incremental topic learning — update topic if confidence is high enough
    if (topic && confidence >= 0.4) {
      this.ctx.topicTier.addObservation(this.ctx.repo, topic, content, confidence);
    }

    return { tool: "observe", result: "stored" };
  }

  private execNotify(args: Record<string, unknown>): ToolResult {
    this.ctx.eventLog.append(this.ctx.repo, {
      type: "notify",
      detail: args.message as string,
      severity: args.severity ?? "info",
    });
    return { tool: "notify", result: args.message };
  }

  private execSleep(args: Record<string, unknown>): ToolResult {
    this.ctx.sleepController.requestSleep({
      type: args.type as "duration" | "condition",
      durationMs: args.durationMinutes ? (args.durationMinutes as number) * 60_000 : undefined,
      wakeOn: args.wakeOn as WakeTrigger[] | undefined,
      reason: args.reason as string,
    });
    return { tool: "sleep", result: "sleeping" };
  }

  private execSearchMemory(args: Record<string, unknown>): ToolResult {
    const results = this.ctx.vectorStore.hybridSearch(
      args.query as string,
      (args.limit as number) ?? 5,
    );
    return {
      tool: "search_memory",
      result: results.map((r) => r.content),
    };
  }

  private execLoadTopic(args: Record<string, unknown>): ToolResult {
    const topic = this.ctx.topicTier.getTopic(this.ctx.repo, args.topic as string);
    if (!topic) {
      return {
        tool: "load_topic",
        result: null,
        error: `Topic "${args.topic}" not found`,
      };
    }
    return { tool: "load_topic", result: topic };
  }

  private execSchedule(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.scheduler) {
      return {
        tool: "schedule",
        result: null,
        error: "Scheduler not available",
      };
    }
    const entry = this.ctx.scheduler.add({
      name: args.name as string,
      cron: args.cron as string,
      action: args.action as string,
      repo: this.ctx.repo,
    });
    return {
      tool: "schedule",
      result: `Scheduled "${entry.name}" [${entry.id}]`,
    };
  }

  private execReadFile(args: Record<string, unknown>): ToolResult {
    const filePath = args.path as string;
    const repoPath = this.ctx.repoPath || ".";
    if (filePath.includes("..")) {
      return { tool: "read_file", result: null, error: "Path traversal not allowed" };
    }
    try {
      const { readFileSync } = require("node:fs");
      const { join } = require("node:path");
      const fullPath = join(repoPath, filePath);
      const content = readFileSync(fullPath, "utf-8");
      const maxChars = 4000;
      return {
        tool: "read_file",
        result:
          content.length > maxChars
            ? `${content.slice(0, maxChars)}\n...(truncated at ${maxChars} chars)`
            : content,
      };
    } catch {
      return { tool: "read_file", result: null, error: `File not found: ${filePath}` };
    }
  }

  private execReview(args: Record<string, unknown>): ToolResult {
    const report = args.report as string;
    const severity = (args.severity as string) || "info";
    // Store the review as a high-confidence observation
    const entry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      repo: this.ctx.repo,
      type: "insight" as const,
      content: `[CODE REVIEW] ${report}`,
      metadata: { tickNum: this.ctx.tickNum, tool: "review", severity },
      confidence: 0.9,
    };
    this.ctx.vectorStore.store(entry);
    this.ctx.eventLog.append(this.ctx.repo, {
      type: "notify",
      detail: `Code review: ${report.slice(0, 200)}...`,
      severity,
    });
    return { tool: "review", result: report };
  }

  private execAction(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.actionExecutor) {
      return {
        tool: "execute_action",
        result: null,
        error: "ActionExecutor not available",
      };
    }
    const command = args.command as string;
    const reason = args.reason as string;
    const repoPath = this.ctx.repoPath || ".";

    // Submit is async but we fire-and-forget for the tool loop
    // Safe actions execute immediately, others queue
    this.ctx.actionExecutor
      .submit(command, reason, this.ctx.repo, repoPath)
      .then((action) => {
        if (action.status === "executed") {
          this.ctx.eventLog.append(this.ctx.repo, {
            type: "act",
            detail: `Executed: ${command} → ${action.result?.slice(0, 200) || "ok"}`,
          });
        } else if (action.status === "pending") {
          this.ctx.eventLog.append(this.ctx.repo, {
            type: "act",
            detail: `Queued for approval: ${command} (${action.tier})`,
          });
        }
      })
      .catch((err) => {
        this.ctx.eventLog.append(this.ctx.repo, {
          type: "error",
          detail: `Action submission failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      });

    const tier = ActionExecutor.classifyTier(command);
    if (tier === "safe") {
      return { tool: "execute_action", result: `Executing: ${command}` };
    }
    return {
      tool: "execute_action",
      result: `Queued for approval (${tier}): ${command}`,
    };
  }

  private execCreateTask(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.taskManager) {
      return { tool: "create_task", result: null, error: "TaskManager not available" };
    }
    const task = this.ctx.taskManager.create({
      repo: this.ctx.repo,
      title: args.title as string,
      description: (args.description as string) ?? "",
      waitCondition: args.wait_condition as any,
      parentId: args.parent_id as string | undefined,
    });
    return {
      tool: "create_task",
      result: `Task created: [${task.id}] "${task.title}" (${task.status})`,
    };
  }

  private execListTasks(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.taskManager) {
      return { tool: "list_tasks", result: null, error: "TaskManager not available" };
    }
    const tasks = this.ctx.taskManager.list({
      status: args.status as any,
      repo: this.ctx.repo,
      limit: (args.limit as number) ?? 10,
    });
    if (tasks.length === 0) {
      return { tool: "list_tasks", result: "No tasks found" };
    }
    const summary = tasks
      .map(
        (t) =>
          `[${t.id.slice(0, 8)}] ${t.status.toUpperCase()} — ${t.title}${t.result ? ` → ${t.result.slice(0, 100)}` : ""}`,
      )
      .join("\n");
    return { tool: "list_tasks", result: summary };
  }

  private execCompleteTask(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.taskManager) {
      return { tool: "complete_task", result: null, error: "TaskManager not available" };
    }
    const task = this.ctx.taskManager.complete(args.id as string, args.result as string);
    if (!task) {
      return {
        tool: "complete_task",
        result: null,
        error: `Task not found or not completable: ${args.id}`,
      };
    }
    return {
      tool: "complete_task",
      result: `Task completed: "${task.title}"`,
    };
  }

  private execCrossRepoSearch(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.crossRepoAnalyzer) {
      return { tool: "cross_repo_search", result: null, error: "CrossRepoAnalyzer not available" };
    }
    const query = args.query as string;
    const repos = args.repos as string[] | undefined;
    const limit = (args.limit as number) ?? 10;

    // If specific repos given, search those; otherwise get all related repos
    let targetRepos: string[];
    if (repos && repos.length > 0) {
      targetRepos = repos;
    } else {
      const relations = this.ctx.crossRepoAnalyzer.getRelatedRepos(this.ctx.repo);
      targetRepos = [
        this.ctx.repo,
        ...relations.map((r) => (r.repoA === this.ctx.repo ? r.repoB : r.repoA)),
      ];
    }

    // Use hybrid search across all target repos
    const results = this.ctx.vectorStore.hybridSearch(query, limit * 2);
    const filtered = results.filter((r) => targetRepos.includes(r.repo)).slice(0, limit);

    if (filtered.length === 0) {
      return { tool: "cross_repo_search", result: "No cross-repo matches found" };
    }

    const summary = filtered.map((r) => `[${r.repo}] ${r.content.slice(0, 200)}`).join("\n");
    return { tool: "cross_repo_search", result: summary };
  }

  private execDeclareRelation(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.crossRepoAnalyzer) {
      return { tool: "declare_relation", result: null, error: "CrossRepoAnalyzer not available" };
    }
    const otherRepo = args.other_repo as string;
    const relationType = args.relation_type as import("../memory/cross-repo.ts").RelationType;
    const description = args.description as string;

    this.ctx.crossRepoAnalyzer.declareRelation(this.ctx.repo, otherRepo, relationType, description);
    return {
      tool: "declare_relation",
      result: `Relation declared: ${this.ctx.repo} ↔ ${otherRepo} (${relationType})`,
    };
  }

  private async execSearchCodebase(args: Record<string, unknown>): Promise<ToolResult> {
    const repoPath = this.ctx.repoPath || ".";
    return searchCodebase(
      repoPath,
      args.pattern as string,
      args.glob as string | undefined,
      args.maxResults as number | undefined,
    );
  }

  private async execListFiles(args: Record<string, unknown>): Promise<ToolResult> {
    const repoPath = this.ctx.repoPath || ".";
    return listFiles(repoPath, args.path as string | undefined, args.glob as string | undefined);
  }

  private execReadFileRange(args: Record<string, unknown>): ToolResult {
    const repoPath = this.ctx.repoPath || ".";
    return readFileRange(
      repoPath,
      args.path as string,
      args.startLine as number | undefined,
      args.endLine as number | undefined,
    );
  }

  private async execSummarizeStructure(args: Record<string, unknown>): Promise<ToolResult> {
    const repoPath = this.ctx.repoPath || ".";
    return summarizeStructure(repoPath, args.path as string | undefined);
  }

  private async execRunCheck(args: Record<string, unknown>): Promise<ToolResult> {
    const repoPath = this.ctx.repoPath || ".";
    try {
      const { detectChecks, runCheck } = await import("./check-runner.ts");
      const checkType = args.type as string;

      if (checkType === "auto") {
        const configs = detectChecks(repoPath);
        if (configs.length === 0) {
          return { tool: "run_check", result: "No supported checks detected in this repo" };
        }
        const results = await Promise.all(configs.map((c) => runCheck(c)));
        const summary = results
          .map((r) => `[${r.type}] exit=${r.exitCode} errors=${r.errorCount} warnings=${r.warningCount} (${r.durationMs}ms)\n${r.summary}`)
          .join("\n\n");
        return { tool: "run_check", result: summary };
      }

      const configs = detectChecks(repoPath).filter((c) => c.type === checkType);
      if (configs.length === 0) {
        return { tool: "run_check", result: null, error: `Check type "${checkType}" not available in this repo` };
      }
      const result = await runCheck(configs[0]);
      return {
        tool: "run_check",
        result: `[${result.type}] exit=${result.exitCode} errors=${result.errorCount} warnings=${result.warningCount} (${result.durationMs}ms)\n${result.summary}`,
      };
    } catch (err) {
      return { tool: "run_check", result: null, error: String(err) };
    }
  }

  private execSubscribeEvent(args: Record<string, unknown>): ToolResult {
    const eventType = args.event_type as GitEventType;
    const filter = args.filter as string | undefined;
    this.ctx.sleepController.subscribe({ eventType, filter });
    const subs = this.ctx.sleepController.getSubscriptions();
    return {
      tool: "subscribe_event",
      result: `Subscribed to ${eventType}${filter ? ` (filter: "${filter}")` : ""}. Active subscriptions: ${subs.length}`,
    };
  }

  private execSpawnWorker(args: Record<string, unknown>): ToolResult {
    if (!this.ctx.coordinator) {
      return {
        tool: "spawn_worker",
        result: null,
        error: "Coordinator not available",
      };
    }
    try {
      const prompt = String(args.prompt || args.task || args.question || "");
      if (!prompt) {
        return { tool: "spawn_worker", result: null, error: "Missing prompt for worker" };
      }
      // Fire-and-forget — results collected at next tick
      this.ctx.coordinator.spawnWorker({
        prompt,
        model: (args.model as string) ?? "claude-haiku-4-5-20251001",
        repo: this.ctx.repo,
      });
      return {
        tool: "spawn_worker",
        result: "Worker spawned — results available next tick",
      };
    } catch (err) {
      return {
        tool: "spawn_worker",
        result: null,
        error: String(err),
      };
    }
  }
}
