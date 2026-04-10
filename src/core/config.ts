import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ActionType = "git_stash" | "git_branch" | "git_commit" | "run_tests" | "run_lint" | "custom_script";

export interface ActionGateConfig {
  enabled: boolean;
  allowedRepos: string[];
  allowedActions: ActionType[];
  confidenceThreshold: number;
  autoApprove: boolean;
}

export const DEFAULT_GATE_CONFIG: ActionGateConfig = {
  enabled: false,
  allowedRepos: [],
  allowedActions: ["git_stash", "run_tests", "run_lint"],
  confidenceThreshold: 0.8,
  autoApprove: false,
};

export interface VigilConfig {
  tickInterval: number;
  blockingBudget: number;
  sleepAfter: number;
  sleepTickInterval: number;
  dreamAfter: number;
  tickModel: string;
  escalationModel: string;
  maxEventWindow: number;
  notifyBackends: string[];
  webhookUrl: string;
  desktopNotify: boolean;
  allowModerateActions: boolean;
  actions: ActionGateConfig;
  /** Brief mode — suppress routine output, only show filtered messages */
  briefMode: boolean;
  /** Feature flags — per-feature enable/disable (Layer 2 config gating) */
  features: Record<string, boolean>;
  /** Push notification config (Phase 13) */
  push: {
    enabled: boolean;
    minSeverity: "info" | "warning" | "critical";
    statuses: string[];
    quietHours?: { start: string; end: string };
    maxPerHour: number;
    ntfy?: { topic: string; server?: string; token?: string };
    native?: boolean;
  };
  /** GitHub webhook server config (Phase 12) */
  webhook: {
    port: number;
    secret: string;
    path: string;
    allowedEvents: string[];
  };
  /** Channel notifications config (Phase 11) */
  channels: {
    enabled: boolean;
    /** Channel names declared for this session (gate 5) */
    sessionChannels: string[];
    /** Approved channel server names (gate 6) */
    allowlist: string[];
    /** Bypass allowlist for dev channels */
    devMode: boolean;
  };
}

const DEFAULT_CONFIG: VigilConfig = {
  tickInterval: 30,
  blockingBudget: 120,
  sleepAfter: 900, // 15 minutes in seconds
  sleepTickInterval: 300,
  dreamAfter: 1800, // 30 minutes in seconds
  tickModel: "claude-haiku-4-5-20251001",
  escalationModel: "claude-sonnet-4-6",
  maxEventWindow: 100,
  notifyBackends: ["file"],
  webhookUrl: "",
  desktopNotify: true,
  allowModerateActions: false,
  actions: { ...DEFAULT_GATE_CONFIG },
  briefMode: false,
  features: {},
  push: {
    enabled: false,
    minSeverity: "warning",
    statuses: ["alert", "proactive"],
    maxPerHour: 10,
  },
  webhook: {
    port: 7433,
    secret: "",
    path: "/webhook/github",
    allowedEvents: ["pull_request", "pull_request_review", "push", "issues", "issue_comment"],
  },
  channels: {
    enabled: false,
    sessionChannels: [],
    allowlist: [],
    devMode: false,
  },
};

export function getConfigDir(): string {
  const dir = join(homedir(), ".vigil");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getDataDir(): string {
  const dir = join(getConfigDir(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function getLogsDir(): string {
  const dir = join(getDataDir(), "logs");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function loadConfig(): VigilConfig {
  const configPath = join(getConfigDir(), "config.json");
  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: VigilConfig): void {
  const configPath = join(getConfigDir(), "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export function getApiKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY;
}

// --- Config hot-reload ---

type ConfigChangeHandler = (newConfig: VigilConfig) => void;

let configWatcher: ReturnType<typeof watch> | null = null;
const changeHandlers: ConfigChangeHandler[] = [];
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastConfigSnapshot = "";

/**
 * Start watching config file for changes.
 * Changes take effect without daemon restart (Kairos GrowthBook TTL pattern).
 */
export function watchConfig(onReload?: ConfigChangeHandler): void {
  const configPath = join(getConfigDir(), "config.json");

  if (onReload) changeHandlers.push(onReload);

  // Only create one watcher
  if (configWatcher) return;

  // Snapshot current content so we only fire on actual changes
  try {
    lastConfigSnapshot = readFileSync(configPath, "utf-8");
  } catch {}

  configWatcher = watch(configPath, () => {
    // 300ms debounce (matches Kairos FILE_STABILITY_MS)
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      try {
        const raw = readFileSync(configPath, "utf-8");
        // Skip spurious fs.watch events (common on WSL) when content hasn't changed
        if (raw === lastConfigSnapshot) return;
        lastConfigSnapshot = raw;
        const newConfig = loadConfig();
        for (const h of changeHandlers) h(newConfig);
      } catch (err) {
        console.warn("[config] Failed to reload:", err);
      }
    }, 300);
  });
}

export function stopWatchingConfig(): void {
  configWatcher?.close();
  configWatcher = null;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = null;
  changeHandlers.length = 0;
}
