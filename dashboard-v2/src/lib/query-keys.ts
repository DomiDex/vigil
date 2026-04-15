export const vigilKeys = {
  overview: ["overview"] as const,
  repos: {
    all: ["repos"] as const,
    detail: (name: string) => ["repos", name] as const,
  },
  timeline: (filters?: { status?: string; repo?: string; q?: string; page?: number }) =>
    ["timeline", filters ?? {}] as const,
  dreams: ["dreams"] as const,
  dreamPatterns: (repo: string) => ["dreams", "patterns", repo] as const,
  memory: {
    stats: ["memory"] as const,
    search: (query: string) => ["memory", "search", query] as const,
  },
  actions: {
    all: ["actions"] as const,
    pending: ["actions", "pending"] as const,
  },
  tasks: ["tasks"] as const,
  scheduler: ["scheduler"] as const,
  metrics: ["metrics"] as const,
  config: ["config"] as const,
  plugins: ["plugins"] as const,
  agents: {
    all: ["agents"] as const,
    current: ["agents", "current"] as const,
  },
  health: ["health"] as const,
  webhooks: ["webhooks"] as const,
  channels: ["channels"] as const,
  notifications: ["notifications"] as const,
  a2a: ["a2a"] as const,
} as const;
