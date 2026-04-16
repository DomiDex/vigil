export const vigilKeys = {
  overview: ["overview"],
  repos: {
    all: ["repos"],
    detail: (name: string) => ["repos", name] as const,
    diff: (name: string) => ["repos", name, "diff"] as const,
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
    preview: (id: string) => ["actions", id, "preview"] as const,
  },
  tasks: ["tasks"],
  scheduler: ["scheduler"],
  metrics: ["metrics"],
  config: {
    all: ["config"],
    features: ["config", "features"],
  },
  plugins: ["plugins"],
  agents: {
    all: ["agents"],
    current: ["agents", "current"],
  },
  health: ["health"],
  webhooks: {
    all: ["webhooks"],
    events: ["webhooks", "events"],
    eventDetail: (id: string) => ["webhooks", "events", id] as const,
    subscriptions: ["webhooks", "subscriptions"],
    status: ["webhooks", "status"],
  },
  channels: {
    all: ["channels"],
    detail: (id: string) => ["channels", id] as const,
    permissions: (id: string) => ["channels", id, "permissions"] as const,
    queue: (id: string) => ["channels", id, "queue"] as const,
  },
  notifications: ["notifications"],
  a2a: {
    all: ["a2a"],
    status: ["a2a", "status"],
    skills: ["a2a", "skills"],
    history: ["a2a", "history"],
  },
} as const;
