// Decision and status types
export type DecisionType = "SILENT" | "OBSERVE" | "NOTIFY" | "ACT";
export type MessageStatus = "normal" | "proactive" | "scheduled" | "alert";
export type TaskStatus = "pending" | "active" | "waiting" | "completed" | "failed" | "cancelled";
export type ActionStatus = "pending" | "approved" | "rejected" | "executed" | "failed";
export type ActionTier = "safe" | "moderate" | "dangerous";

// Overview
export interface OverviewData {
  repos: Array<{ name: string; path: string; state: "sleeping" | "active" | "dreaming" }>;
  repoCount: number;
  sessionId: string;
  uptime: string;
  uptimeSeconds: number;
  state: "awake" | "sleeping" | "dreaming";
  tickCount: number;
  lastTickAt: string;
  nextTickIn: number;
  tickInterval: number;
  adaptiveInterval: number;
  tickModel: string;
  escalationModel: string;
}

// Timeline
export interface TimelineMessage {
  id: string;
  timestamp: string;
  source: Record<string, unknown>;
  status: string;
  severity: string;
  decision: string;
  message: string;
  confidence: number;
  metadata: Record<string, unknown>;
  attachments: Record<string, unknown> | unknown[];
}

export interface TimelineData {
  messages: TimelineMessage[];
  total: number;
  page: number;
  hasMore: boolean;
}

// Repos
export interface RepoListItem {
  name: string;
  path: string;
  state: "active" | "sleeping" | "dreaming";
  branch: string;
  head: string;
  dirty: boolean;
}

export interface RepoCommit {
  hash: string;
  message: string;
  author: string;
  date: string;
}

export interface TopicInfo {
  topic: string;
  mentions: number;
  lastSeen: string;
}

export interface DecisionDistribution {
  SILENT: number;
  OBSERVE: number;
  NOTIFY: number;
  ACT: number;
}

export interface RepoDetail {
  name: string;
  path: string;
  state: "active" | "sleeping" | "dreaming";
  branch: string;
  head: string;
  headMessage: string;
  dirty: boolean;
  dirtyFileCount: number;
  uncommittedSummary: string;
  recentCommits: RepoCommit[];
  decisions: DecisionDistribution;
  patterns: string[];
  topics: TopicInfo[];
}

// Dreams
export interface DreamResult {
  timestamp: string;
  repo: string;
  observationsConsolidated: number;
  summary: string;
  patterns: string[];
  insights: string[];
  confidence: number;
}

export interface DreamsData {
  dreams: DreamResult[];
  status: { running: boolean; repo?: string; pid?: number };
}

export interface DreamPatternsData {
  repo: string;
  patterns: string[];
  lastUpdated: string | null;
}

// Tasks
export interface WaitCondition {
  type: "event" | "task" | "schedule";
  eventType?: string;
  filter?: string;
  taskId?: string;
  cron?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  repo?: string;
  createdAt: string;
  updatedAt: string;
  waitCondition: WaitCondition | null;
  updatedRelative?: string;
}

export interface TasksData {
  tasks: TaskItem[];
  counts: Record<string, number>;
  completionRate: number;
}

// Actions
export type ActionType = "shell" | "git" | "file" | "api";

export interface ActionRequest {
  id: string;
  repo: string;
  command: string;
  args: string[];
  tier: ActionTier;
  actionType?: ActionType;
  reason: string;
  confidence: number;
  status: ActionStatus;
  result?: string;
  error?: string;
  gateResults?: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
  timeFormatted?: string;
  timeRelative?: string;
}

export interface ActionPreview {
  id: string;
  command: string;
  args: string[];
  description: string;
  dryRun: string | null;
  estimatedEffect: string | null;
}

export interface ActionsData {
  actions: ActionRequest[];
  pending: ActionRequest[];
  stats: {
    approved: number;
    rejected: number;
    executed: number;
    failed: number;
    pending: number;
  };
  byTier: { safe: number; moderate: number; dangerous: number };
  gateConfig: Record<string, unknown>;
  isOptedIn: boolean;
}

export interface ActionsPendingData {
  pending: ActionRequest[];
}

// Memory
export interface MemorySearchResult {
  id: string;
  repo: string;
  type: string;
  content: string;
  confidence: number;
  timestamp: string;
}

export interface MemoryProfile {
  repo: string;
  summary: string;
  patternCount: number;
  lastUpdated: string;
}

export interface MemoryData {
  pipeline: {
    eventLog: { count: number; oldestDate: string; newestDate: string };
    vectorStore: { count: number; types: Record<string, number> };
    topicTier: { count: number; repos: string[] };
    indexTier: { count: number; repos: string[] };
  };
  profiles: MemoryProfile[];
}

export interface MemorySearchData {
  results: MemorySearchResult[];
}

// Metrics
export interface MetricsData {
  decisions: {
    series: Array<{ time: string; SILENT: number; OBSERVE: number; NOTIFY: number; ACT: number }>;
    totals: { SILENT: number; OBSERVE: number; NOTIFY: number; ACT: number };
  };
  latency: {
    series: Array<{ tick: number; ms: number }>;
    avg: number;
    p95: number;
    max: number;
    count: number;
  };
  tokens: {
    total: number;
    perTick: { avg: number; max: number };
    costEstimate: string;
  };
  tickTiming: {
    configured: number;
    adaptiveCurrent: number;
    recentActivity: number;
    series: Array<{ time: string; count: number }>;
  };
  ticks: {
    total: number;
    sleeping: number;
    proactive: number;
    current: number;
  };
  state: {
    isSleeping: boolean;
    uptime: string;
    model: string;
  };
}

// Scheduler
export interface ScheduleEntry {
  id: string;
  name: string;
  cron: string;
  action: string;
  repo?: string;
  nextRun: string | null;
  msToNext: number | null;
  nextRunRelative: string;
}

export interface SchedulerHistory {
  startedAt: number;
  scheduleName: string;
  status: "ok" | "fail";
  duration: number;
  error?: string;
}

export interface SchedulerData {
  entries: ScheduleEntry[];
  history: SchedulerHistory[];
}
