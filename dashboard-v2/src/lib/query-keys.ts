export const vigilKeys = {
  overview: ["overview"],
  repos: {
    all: ["repos"],
    detail: (name: string) => ["repos", name] as const,
  },
  timeline: (filters?: { status?: string; repo?: string; q?: string; page?: number }) =>
    ["timeline", filters ?? {}] as const,
  dreams: ["dreams"],
  dreamPatterns: (repo: string) => ["dreams", "patterns", repo] as const,
  memory: {
    stats: ["memory"],
    search: (query: string) => ["memory", "search", query] as const,
  },
  actions: {
    all: ["actions"],
    pending: ["actions", "pending"],
  },
  tasks: ["tasks"],
  scheduler: ["scheduler"],
  metrics: ["metrics"],
  config: ["config"],
  plugins: ["plugins"],
  agents: {
    all: ["agents"],
    current: ["agents", "current"],
  },
  health: ["health"],
  webhooks: ["webhooks"],
  channels: ["channels"],
  notifications: ["notifications"],
  a2a: ["a2a"],
} as const;
