import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getDataDir, getLogsDir } from "../../core/config.ts";
import { type AskContext, AskEngine } from "../../llm/ask-engine.ts";
import { IndexTier } from "../../memory/index-tier.ts";
import { TopicTier } from "../../memory/topic-tier.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ──

function countLogEntries(): { count: number; oldestDate: string; newestDate: string } {
  const logsDir = getLogsDir();
  if (!existsSync(logsDir)) return { count: 0, oldestDate: "", newestDate: "" };

  const files = readdirSync(logsDir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();

  if (files.length === 0) return { count: 0, oldestDate: "", newestDate: "" };

  let count = 0;
  for (const file of files) {
    const content = readFileSync(join(logsDir, file), "utf-8");
    count += content.trim().split("\n").filter(Boolean).length;
  }

  const oldestDate = files[0].slice(0, 10);
  const newestDate = files[files.length - 1].slice(0, 10);

  return { count, oldestDate, newestDate };
}

function getVectorStoreStats(ctx: DashboardContext): { count: number; types: Record<string, number> } {
  try {
    const db = (ctx.daemon.vectorStore as any).db;
    const countRow = db.query("SELECT COUNT(*) as cnt FROM memories").get() as { cnt: number } | null;
    const typeRows = db.query("SELECT type, COUNT(*) as cnt FROM memories GROUP BY type").all() as {
      type: string;
      cnt: number;
    }[];

    const types: Record<string, number> = {};
    for (const row of typeRows) {
      types[row.type] = row.cnt;
    }

    return { count: countRow?.cnt ?? 0, types };
  } catch {
    return { count: 0, types: {} };
  }
}

function getTopicStats(): { count: number; repos: string[] } {
  const topicTier = new TopicTier();
  const baseDir = join(getDataDir(), "topics");
  if (!existsSync(baseDir)) return { count: 0, repos: [] };

  const repos = readdirSync(baseDir).filter((f) => {
    const p = join(baseDir, f);
    return existsSync(p) && statSync(p).isDirectory();
  });

  let count = 0;
  for (const repo of repos) {
    count += topicTier.listTopics(repo).length;
  }

  return { count, repos };
}

function getIndexStats(): { count: number; repos: string[] } {
  const indexDir = join(getDataDir(), "index");
  if (!existsSync(indexDir)) return { count: 0, repos: [] };

  const files = readdirSync(indexDir).filter((f) => f.endsWith(".json"));
  const repos = files.map((f) => f.replace(".json", ""));

  return { count: files.length, repos };
}

// ── GET /api/memory ──

export function getMemoryJSON(ctx: DashboardContext) {
  const eventLogStats = countLogEntries();
  const vectorStats = getVectorStoreStats(ctx);
  const topicStats = getTopicStats();
  const indexStats = getIndexStats();

  const profiles = ctx.daemon.vectorStore.getAllRepoProfiles().map((p) => ({
    repo: p.repo,
    summary: p.summary.slice(0, 200),
    patternCount: p.patterns.length,
    lastUpdated: new Date(p.lastUpdated).toISOString(),
  }));

  return {
    pipeline: {
      eventLog: eventLogStats,
      vectorStore: vectorStats,
      topicTier: topicStats,
      indexTier: indexStats,
    },
    profiles,
  };
}

// ── GET /api/memory/search ──

export function getMemorySearchJSON(ctx: DashboardContext, query: string, repo?: string) {
  if (!query || query.trim().length === 0) return { results: [] };

  try {
    let results = ctx.daemon.vectorStore.search(query, 20);

    if (repo) {
      results = results.filter((r) => r.repo === repo);
    }

    return {
      results: results.map((r) => ({
        id: r.id,
        repo: r.repo,
        type: r.type,
        content: r.content.slice(0, 300),
        confidence: r.confidence,
        timestamp: new Date(r.timestamp).toISOString(),
      })),
    };
  } catch {
    return { results: [] };
  }
}

// ── POST /api/memory/ask ──

export async function handleAsk(
  ctx: DashboardContext,
  question: string,
  repo?: string,
): Promise<{ answer?: string; rounds?: number; sources?: number; error?: string }> {
  if (!question || question.trim().length === 0) {
    return { error: "Please enter a question." };
  }

  // Find the repo path
  const targetRepo = repo || (ctx.daemon.repoPaths[0]?.split("/").pop() ?? "");
  const repoPath = ctx.daemon.repoPaths.find((p) => p.endsWith(`/${targetRepo}`) || p === targetRepo);

  if (!repoPath) {
    return { error: `Repository "${targetRepo}" not found. Select a monitored repo.` };
  }

  const repoName = repoPath.split("/").pop() || repoPath;

  try {
    const topicTier = new TopicTier();
    const indexTier = new IndexTier();

    const askCtx: AskContext = {
      repo: repoName,
      repoPath,
      vectorStore: ctx.daemon.vectorStore,
      topicTier,
      indexTier,
      eventLog: ctx.daemon.eventLog,
    };

    const askEngine = new AskEngine(ctx.daemon.config);
    const gitContext = await getGitContext(repoPath);
    const result = await askEngine.investigate(question, gitContext, askCtx);

    return {
      answer: result.answer,
      rounds: result.rounds,
      sources: result.sources.length,
    };
  } catch (err) {
    return { error: String(err) };
  }
}

// ── Zod schemas for memory CRUD ──

const createMemorySchema = z.object({
  content: z.string().min(1).max(5000),
  repo: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const relevanceSchema = z.object({
  relevant: z.boolean(),
});

// ── POST /api/memory ──

export function handleMemoryCreate(
  ctx: DashboardContext,
  body: { content: string; repo?: string; tags?: string[] },
): { id?: string; error?: string } {
  const result = createMemorySchema.safeParse(body);
  if (!result.success) {
    return { error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const { content, repo, tags } = result.data;
  const id = crypto.randomUUID();
  const repoName = repo || ctx.daemon.repoPaths[0]?.split("/").pop() || "unknown";

  ctx.daemon.vectorStore.store({
    id,
    timestamp: Date.now(),
    repo: repoName,
    type: "insight",
    content,
    metadata: tags ? { tags } : {},
    confidence: 0.5,
  });

  return { id };
}

// ── DELETE /api/memory/:id ──

export function handleMemoryDelete(ctx: DashboardContext, id: string): { success: boolean; error?: string } {
  const deleted = ctx.daemon.vectorStore.delete(id);
  if (!deleted) {
    return { success: false, error: "Memory entry not found" };
  }
  return { success: true };
}

// ── PATCH /api/memory/:id ──

export function handleMemoryRelevance(
  ctx: DashboardContext,
  id: string,
  body: { relevant: boolean },
): { success: boolean; error?: string } {
  const result = relevanceSchema.safeParse(body);
  if (!result.success) {
    return { success: false, error: result.error.issues.map((i) => i.message).join("; ") };
  }

  const updated = ctx.daemon.vectorStore.updateRelevance(id, result.data.relevant);
  if (!updated) {
    return { success: false, error: "Memory entry not found" };
  }
  return { success: true };
}

async function getGitContext(repoPath: string): Promise<string> {
  try {
    const proc = Bun.spawn(["git", "log", "--oneline", "-10"], {
      cwd: repoPath,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    await proc.exited;
    return `Recent commits:\n${stdout.trim()}`;
  } catch {
    return "";
  }
}
