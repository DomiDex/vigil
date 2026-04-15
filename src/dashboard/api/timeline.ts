import type { VigilMessage } from "../../messaging/schema.ts";
import type { DashboardContext } from "../types.ts";

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

// ── Icons ─────────────────────────────────────────

const DECISION_ICONS: Record<string, string> = {
  SILENT: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 14V2"/><path d="M9 18.12L5.36 14.47A2 2 0 014 13.06V4a2 2 0 012-2h2"/><path d="M12 18.12L15.64 14.47A2 2 0 0117 13.06"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
  OBSERVE: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>`,
  NOTIFY: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>`,
  ACT: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
};

const ICON = {
  search: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  expand: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`,
  collapse: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
};

// ── Decision styling ──────────────────────────────

interface DecisionStyle {
  badge: string;
  border: string;
}

function decisionStyle(decision: string): DecisionStyle {
  switch (decision) {
    case "OBSERVE":
      return { badge: "bg-info/15 text-info", border: "border-l-[3px] border-l-info" };
    case "NOTIFY":
      return { badge: "bg-warning/15 text-warning", border: "border-l-[3px] border-l-warning" };
    case "ACT":
      return { badge: "bg-vigil/15 text-vigil", border: "border-l-[3px] border-l-vigil" };
    default:
      return { badge: "bg-surface-light text-text-muted", border: "border-l-[3px] border-l-border" };
  }
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

// ── HTML Fragments ────────────────────────────────

function renderEntryCard(msg: VigilMessage, collapsed = true): string {
  const decision = decisionFromMessage(msg);
  const confidence = confidenceFromMessage(msg);
  const time = formatTime(msg.timestamp);
  const repo = msg.source.repo;
  const icon = DECISION_ICONS[decision] || DECISION_ICONS.SILENT;
  const ds = decisionStyle(decision);
  const confDisplay = confidence > 0 ? confidence.toFixed(2) : "";

  if (collapsed) {
    return `<div class="bg-surface rounded-lg border border-border ${ds.border} p-4 mb-3 hover:shadow-[0_0_12px_rgba(255,129,2,0.06)] transition-shadow duration-200" id="entry-${msg.id}">
  <div class="flex items-center gap-3 mb-2">
    <span class="text-xs text-text-muted font-mono">${time}</span>
    <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ds.badge}">${decision}</span>
    <span class="text-xs text-text-muted">${escapeHtml(repo)}</span>
    ${confDisplay ? `<span class="ml-auto text-xs font-mono text-text-muted">${confDisplay}</span>` : ""}
  </div>
  <div class="flex items-start gap-2">
    <span class="text-text-muted mt-0.5 shrink-0">${icon}</span>
    <span class="text-sm text-text leading-relaxed flex-1">${escapeHtml(msg.message.slice(0, 200))}${msg.message.length > 200 ? "..." : ""}</span>
    <button class="shrink-0 flex items-center gap-1 text-xs text-text-muted hover:text-vigil transition-colors px-2 py-1 rounded hover:bg-vigil/5"
            hx-get="/api/timeline/${msg.id}/fragment"
            hx-target="#entry-${msg.id}"
            hx-swap="outerHTML">${ICON.expand} expand</button>
  </div>
</div>`;
  }

  // Expanded view
  const tickNum = msg.metadata?.tickNum ?? "";
  const action = msg.metadata?.action ?? "";

  return `<div class="bg-surface rounded-lg border border-vigil/20 ${ds.border} p-4 mb-3 shadow-[0_0_16px_rgba(255,129,2,0.08)]" id="entry-${msg.id}">
  <!-- Header -->
  <div class="flex items-center gap-3 mb-3">
    <span class="text-xs text-text-muted font-mono">${time}</span>
    <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ds.badge}">${decision}</span>
    <span class="text-xs text-text-muted">${escapeHtml(repo)}</span>
    ${confDisplay ? `<span class="ml-auto text-xs font-mono text-text-muted">${confDisplay}</span>` : ""}
  </div>

  <!-- Full Message -->
  <div class="flex items-start gap-2 mb-4">
    <span class="text-text-muted mt-0.5 shrink-0">${icon}</span>
    <div class="text-sm text-text leading-relaxed whitespace-pre-wrap">${escapeHtml(msg.message)}</div>
  </div>

  <!-- Detail Grid -->
  <div class="grid grid-cols-2 gap-x-6 gap-y-2 bg-surface-dark rounded-lg p-3 mb-4 text-xs">
    <div class="flex justify-between"><span class="text-text-muted">Severity</span><span class="text-text">${msg.severity}</span></div>
    <div class="flex justify-between"><span class="text-text-muted">Status</span><span class="text-text">${msg.status}</span></div>
    ${tickNum ? `<div class="flex justify-between"><span class="text-text-muted">Tick</span><span class="font-mono text-vigil">#${tickNum}</span></div>` : ""}
    ${action ? `<div class="flex justify-between"><span class="text-text-muted">Action</span><span class="text-text">${escapeHtml(String(action))}</span></div>` : ""}
    <div class="flex justify-between"><span class="text-text-muted">Branch</span><span class="font-mono text-text">${escapeHtml(msg.source.branch || "—")}</span></div>
    <div class="flex justify-between"><span class="text-text-muted">Event</span><span class="text-text">${escapeHtml(msg.source.event || "—")}</span></div>
    <div class="col-span-2 flex justify-between"><span class="text-text-muted">Timestamp</span><span class="font-mono text-text">${msg.timestamp}</span></div>
  </div>

  <!-- Reply Form -->
  <div class="border-t border-border pt-3">
    <form hx-post="/api/timeline/${msg.id}/reply"
          hx-target="#reply-result-${msg.id}"
          hx-swap="innerHTML"
          class="flex gap-2">
      <input type="text" name="reply" placeholder="Reply to this observation..."
             class="flex-1 bg-surface-dark border border-border rounded-lg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-vigil focus:border-vigil transition-all"
             autocomplete="off">
      <button type="submit"
              class="flex items-center gap-1.5 bg-vigil hover:bg-vigil-hover text-black font-medium text-sm rounded-lg px-4 py-2 transition-colors">
        ${ICON.send} Send
      </button>
    </form>
    <div id="reply-result-${msg.id}" class="mt-2"></div>
  </div>

  <!-- Collapse -->
  <button class="flex items-center gap-1 text-xs text-text-muted hover:text-vigil transition-colors mt-3 px-2 py-1 rounded hover:bg-vigil/5"
          hx-get="/api/timeline/${msg.id}/fragment?collapsed=1"
          hx-target="#entry-${msg.id}"
          hx-swap="outerHTML">${ICON.collapse} collapse</button>
</div>`;
}

export function getTimelineFragment(ctx: DashboardContext, url: URL): string {
  const data = getTimelineJSON(ctx, url);

  if (data.messages.length === 0) {
    return `<div class="flex flex-col items-center justify-center py-16 text-text-muted">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="mb-3 opacity-40">
        <circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      </svg>
      <span class="text-sm">No messages match your filters.</span>
    </div>`;
  }

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
    html += `<div class="flex justify-center py-4 text-text-muted text-sm"
                  hx-get="/api/timeline/fragment?${params.toString()}"
                  hx-trigger="revealed"
                  hx-swap="outerHTML">
      <span class="animate-pulse">Loading more...</span>
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
    return `<span class="flex items-center gap-1 text-xs text-error">${ICON.check.replace("currentColor", "#E74C3C")} Reply cannot be empty.</span>`;
  }

  const allMessages = ctx.daemon.messageRouter.getHistory({ limit: 1000 });
  const msg = allMessages.find((m) => m.id === id);

  if (!msg) {
    return `<span class="flex items-center gap-1 text-xs text-error">Message not found.</span>`;
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

  return `<span class="flex items-center gap-1.5 text-xs text-success">
  ${ICON.check} Reply sent
</span>`;
}

/** Render a single entry for SSE live push (collapsed card HTML) */
export function renderSSEEntry(msg: VigilMessage): string {
  return renderEntryCard(msg, true);
}
