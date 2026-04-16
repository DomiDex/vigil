import type { VigilMessage } from "../../messaging/schema.ts";
import type { DashboardContext } from "../types.ts";

// ── Helpers ───────────────────────────────────────

function decisionFromMessage(msg: VigilMessage): string {
  return (msg.metadata?.decision as string) || "SILENT";
}

function confidenceFromMessage(msg: VigilMessage): number {
  return (msg.metadata?.confidence as number) ?? 0;
}

// ── JSON API ──────────────────────────────────────

export interface TimelineQuery {
  decision?: string;
  repo?: string;
  q?: string;
  page?: number;
  limit?: number;
}

function parseQuery(url: URL): TimelineQuery {
  return {
    decision: url.searchParams.get("decision") || undefined,
    repo: url.searchParams.get("repo") || undefined,
    q: url.searchParams.get("q") || undefined,
    page: parseInt(url.searchParams.get("page") || "1", 10) || 1,
    limit: Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 100),
  };
}

function filterMessages(messages: VigilMessage[], query: TimelineQuery): VigilMessage[] {
  let filtered = messages;

  if (query.decision) {
    const dec = query.decision.toUpperCase();
    filtered = filtered.filter((m) => decisionFromMessage(m) === dec);
  }

  if (query.repo) {
    const repo = query.repo.toLowerCase();
    filtered = filtered.filter((m) => m.source.repo.toLowerCase() === repo);
  }

  return filtered;
}

export function getTimelineJSON(ctx: DashboardContext, url: URL) {
  const query = parseQuery(url);
  const allMessages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });

  let messages: VigilMessage[];

  if (query.q?.trim()) {
    const searchResults = ctx.daemon.vectorStore.search(query.q.trim(), 100);
    const searchContent = new Set(searchResults.map((r) => r.content));
    messages = allMessages.filter((m) => searchContent.has(m.message));
    messages = filterMessages(messages, { ...query, q: undefined });
  } else {
    messages = filterMessages(allMessages, query);
  }

  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const total = messages.length;
  const start = (query.page! - 1) * query.limit!;
  const page = messages.slice(start, start + query.limit!);

  return {
    messages: page.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      source: m.source,
      status: m.status,
      severity: m.severity,
      decision: decisionFromMessage(m),
      message: m.message,
      confidence: confidenceFromMessage(m),
      metadata: m.metadata,
      attachments: m.attachments,
    })),
    total,
    page: query.page!,
    hasMore: start + query.limit! < total,
  };
}

// ── POST /api/timeline/:id/reply ─────────────────

export function handleReply(
  ctx: DashboardContext,
  id: string,
  reply: string,
): { ok: boolean; error?: string } {
  if (!reply.trim()) {
    return { ok: false, error: "Reply cannot be empty." };
  }

  const allMessages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });
  const msg = allMessages.find((m) => m.id === id);

  if (!msg) {
    return { ok: false, error: "Message not found." };
  }

  const userReply = ctx.daemon.userReply as any;
  if (userReply?.pendingReplies) {
    userReply.pendingReplies.push({
      tickNum: (msg.metadata?.tickNum as number) ?? 0,
      repo: msg.source.repo,
      decision: decisionFromMessage(msg),
      content: msg.message,
      userReply: reply.trim(),
      timestamp: Date.now(),
    });
  }

  return { ok: true };
}
