import type { VigilMessage } from "../../messaging/schema.ts";
import type { DashboardContext } from "../server.ts";

// ── Helpers ───────────────────────────────────────

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function decisionFromMessage(msg: VigilMessage): string {
  return (msg.metadata?.decision as string) || "SILENT";
}

function confidenceFromMessage(msg: VigilMessage): number {
  return (msg.metadata?.confidence as number) ?? 0;
}

const DECISION_ICONS: Record<string, string> = {
  SILENT: `<svg class="decision-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 14V2"/><path d="M9 18.12L5.36 14.47A2 2 0 014 13.06V4a2 2 0 012-2h2"/><path d="M12 18.12L15.64 14.47A2 2 0 0117 13.06"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  OBSERVE: `<svg class="decision-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>`,
  NOTIFY: `<svg class="decision-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  ACT: `<svg class="decision-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

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

  // Full-text search via VectorStore
  if (query.q?.trim()) {
    const searchResults = ctx.daemon.vectorStore.search(query.q.trim(), 100);
    // Map search results back to messages by matching content
    const searchContent = new Set(searchResults.map((r) => r.content));
    messages = allMessages.filter((m) => searchContent.has(m.message));
    messages = filterMessages(messages, { ...query, q: undefined });
  } else {
    messages = filterMessages(allMessages, query);
  }

  // Sort descending by timestamp
  messages.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Paginate
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

// ── HTML Fragments ────────────────────────────────

function renderEntryCard(msg: VigilMessage, collapsed = true): string {
  const decision = decisionFromMessage(msg);
  const confidence = confidenceFromMessage(msg);
  const time = formatTime(msg.timestamp);
  const repo = msg.source.repo;
  const icon = DECISION_ICONS[decision] || DECISION_ICONS.SILENT;
  const decClass = decision.toLowerCase();
  const confDisplay = confidence > 0 ? confidence.toFixed(2) : "";

  if (collapsed) {
    return `<div class="tl-entry tl-${decClass}" id="entry-${msg.id}">
  <div class="tl-entry-header">
    <span class="tl-time">${time}</span>
    <span class="tl-decision tl-badge-${decClass}">${decision}</span>
    <span class="tl-repo">${escapeHtml(repo)}</span>
    ${confDisplay ? `<span class="tl-confidence">${confDisplay}</span>` : ""}
  </div>
  <div class="tl-entry-body">
    <span class="tl-icon">${icon}</span>
    <span class="tl-message">${escapeHtml(msg.message.slice(0, 200))}${msg.message.length > 200 ? "..." : ""}</span>
    <button class="tl-expand-btn"
            hx-get="/api/timeline/${msg.id}/fragment"
            hx-target="#entry-${msg.id}"
            hx-swap="outerHTML">expand</button>
  </div>
</div>`;
  }

  // Expanded view
  const tickNum = msg.metadata?.tickNum ?? "";
  const action = msg.metadata?.action ?? "";

  return `<div class="tl-entry tl-${decClass} tl-expanded" id="entry-${msg.id}">
  <div class="tl-entry-header">
    <span class="tl-time">${time}</span>
    <span class="tl-decision tl-badge-${decClass}">${decision}</span>
    <span class="tl-repo">${escapeHtml(repo)}</span>
    ${confDisplay ? `<span class="tl-confidence">${confDisplay}</span>` : ""}
  </div>
  <div class="tl-entry-body-full">
    <span class="tl-icon">${icon}</span>
    <div class="tl-message-full">${escapeHtml(msg.message)}</div>
  </div>
  <div class="tl-detail-panel">
    <div class="tl-detail-row"><span class="tl-detail-label">Severity</span><span>${msg.severity}</span></div>
    <div class="tl-detail-row"><span class="tl-detail-label">Status</span><span>${msg.status}</span></div>
    ${tickNum ? `<div class="tl-detail-row"><span class="tl-detail-label">Tick</span><span>#${tickNum}</span></div>` : ""}
    ${action ? `<div class="tl-detail-row"><span class="tl-detail-label">Action</span><span>${escapeHtml(String(action))}</span></div>` : ""}
    <div class="tl-detail-row"><span class="tl-detail-label">Branch</span><span>${escapeHtml(msg.source.branch || "—")}</span></div>
    <div class="tl-detail-row"><span class="tl-detail-label">Event</span><span>${escapeHtml(msg.source.event || "—")}</span></div>
    <div class="tl-detail-row"><span class="tl-detail-label">Timestamp</span><span>${msg.timestamp}</span></div>
  </div>
  <div class="tl-reply-area">
    <form hx-post="/api/timeline/${msg.id}/reply"
          hx-target="#reply-result-${msg.id}"
          hx-swap="innerHTML"
          class="tl-reply-form">
      <input type="text" name="reply" placeholder="Reply to this observation..." class="tl-reply-input" autocomplete="off">
      <button type="submit" class="tl-reply-btn">Send</button>
    </form>
    <div id="reply-result-${msg.id}" class="tl-reply-result"></div>
  </div>
  <button class="tl-collapse-btn"
          hx-get="/api/timeline/${msg.id}/fragment?collapsed=1"
          hx-target="#entry-${msg.id}"
          hx-swap="outerHTML">collapse</button>
</div>`;
}

export function getTimelineFragment(ctx: DashboardContext, url: URL): string {
  const data = getTimelineJSON(ctx, url);

  if (data.messages.length === 0) {
    return `<div class="tl-empty">No messages match your filters.</div>`;
  }

  // Get full messages for rendering
  const allMessages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });
  const messageMap = new Map(allMessages.map((m) => [m.id, m]));

  let html = "";
  for (const entry of data.messages) {
    const msg = messageMap.get(entry.id);
    if (msg) html += renderEntryCard(msg, true);
  }

  if (data.hasMore) {
    const nextPage = data.page + 1;
    const params = new URLSearchParams(url.searchParams);
    params.set("page", String(nextPage));
    html += `<div class="tl-sentinel"
                  hx-get="/api/timeline/fragment?${params.toString()}"
                  hx-trigger="revealed"
                  hx-swap="outerHTML">
      <span class="tl-loading">Loading more...</span>
    </div>`;
  }

  return html;
}

export function getEntryFragment(ctx: DashboardContext, id: string, collapsed: boolean): string | null {
  const allMessages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });
  const msg = allMessages.find((m) => m.id === id);
  if (!msg) return null;
  return renderEntryCard(msg, collapsed);
}

export function handleReply(ctx: DashboardContext, id: string, reply: string): string {
  if (!reply.trim()) {
    return `<span class="tl-reply-error">Reply cannot be empty.</span>`;
  }

  // Find the message to get context
  const allMessages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });
  const msg = allMessages.find((m) => m.id === id);

  if (!msg) {
    return `<span class="tl-reply-error">Message not found.</span>`;
  }

  // Feed into the daemon's UserReply system if available
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

  return `<span class="tl-reply-success">
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
  Reply sent
</span>`;
}

/** Render a single entry for SSE live push (collapsed card HTML) */
export function renderSSEEntry(msg: VigilMessage): string {
  return renderEntryCard(msg, true);
}
