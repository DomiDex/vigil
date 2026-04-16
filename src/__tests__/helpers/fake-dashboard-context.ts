import { SSEManager } from "../../dashboard/api/sse.ts";

export interface FakeContextOptions {
  config?: Record<string, any>;
  repoPaths?: string[];
  featureGates?: Record<string, boolean>;
  agentDir?: string;
}

export function createFakeDashboardContext(opts: FakeContextOptions = {}) {
  const config = {
    tickInterval: 30,
    sleepAfter: 900,
    sleepTickInterval: 300,
    dreamAfter: 1800,
    blockingBudget: 120,
    maxEventWindow: 100,
    tickModel: "claude-haiku-4-5-20251001",
    escalationModel: "claude-sonnet-4-6",
    notifyBackends: [],
    actions: {
      enabled: true,
      autoApprove: false,
      confidenceThreshold: 0.8,
      allowedRepos: ["/home/user/projects/vigil"],
      allowedActions: ["git_stash", "run_tests", "run_lint"],
    },
    features: {},
    push: {
      enabled: false,
      minSeverity: "warning",
      statuses: ["alert", "proactive"],
      maxPerHour: 10,
      quietHours: { start: "22:00", end: "07:00" },
    },
    webhook: {
      port: 7433,
      secret: "",
      path: "/webhook/github",
      allowedEvents: ["push", "pull_request"],
    },
    channels: {
      enabled: false,
      sessionChannels: [],
      allowlist: [],
      devMode: false,
    },
    ...opts.config,
  };

  const gateConfig = {
    enabled: true,
    autoApprove: false,
    confidenceThreshold: 0.8,
    allowedRepos: ["/home/user/projects/vigil"],
    allowedActions: ["git_stash", "run_tests"],
  };

  // Feature gates stub
  const featureStates: Record<string, boolean> = {
    VIGIL_A2A: false,
    VIGIL_AGENT_IDENTITY: false,
    VIGIL_WEBHOOKS: true,
    ...opts.featureGates,
  };

  const featureGates = {
    isEnabled(name: string) {
      return featureStates[name] ?? false;
    },
    diagnose(name: string) {
      const enabled = featureStates[name] ?? false;
      return {
        build: true,
        config: enabled,
        runtime: enabled,
        session: enabled,
      };
    },
    setConfigLayer(name: string, value: boolean) {
      featureStates[name] = value;
    },
  };

  // Webhook processor stub
  const webhookEvents: any[] = [];
  const webhookSubscriptions: any[] = [];
  const webhookEventDetails: Record<string, any> = {
    evt_001: {
      id: "evt_001",
      repo: "vigil",
      eventType: "push",
      source: "github",
      timestamp: new Date().toISOString(),
      status: "processed",
      payload: { ref: "refs/heads/main", commits: [{ id: "abc123", message: "fix: typo" }] },
      headers: { "x-github-event": "push" },
      processingTime: 42,
    },
  };
  const webhookProcessor = {
    getEvents() {
      return webhookEvents;
    },
    getSubscriptions() {
      return webhookSubscriptions;
    },
    addSubscription(sub: any) {
      const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      webhookSubscriptions.push({ id, ...sub });
      return id;
    },
    removeSubscription(id: string) {
      const idx = webhookSubscriptions.findIndex((s: any) => s.id === id);
      if (idx >= 0) webhookSubscriptions.splice(idx, 1);
      return idx >= 0;
    },
    getStatus() {
      return {
        running: true,
        port: 7481,
        eventsReceived: 42,
        errors: 0,
        signatureFailures: 0,
        lastEventAt: Date.now() - 30000,
      };
    },
    getEventDetail(id: string) {
      return webhookEventDetails[id] ?? null;
    },
  };

  // Channel manager stub
  const channels: any[] = [];
  const channelManager = {
    getChannels() {
      return channels;
    },
    register(channel: any) {
      const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      channels.push({ id, ...channel, status: "active", queueDepth: 0 });
      return id;
    },
    unregister(id: string) {
      const idx = channels.findIndex((c: any) => c.id === id);
      if (idx >= 0) channels.splice(idx, 1);
      return idx >= 0;
    },
    getPermissions(_id: string) {
      return {
        read: true,
        write: true,
        execute: false,
        admin: false,
        subscribe: true,
      };
    },
    getQueue(_id: string) {
      return [
        {
          id: "msg_1",
          content: "test message",
          status: "pending",
          createdAt: Date.now(),
        },
      ];
    },
    testChannel(id: string) {
      const ch = channels.find((c: any) => c.id === id);
      if (!ch) return null;
      return { success: true, message: "Test message sent to channel", channelId: id };
    },
    updatePermissions(id: string, permissions: Record<string, boolean>) {
      const ch = channels.find((c: any) => c.id === id);
      if (!ch) return null;
      return { channelId: id, ...permissions };
    },
  };

  // Push notifier stub
  const notificationHistory: any[] = [];
  const pushNotifier = {
    getHistory() {
      return notificationHistory;
    },
    sendTest() {
      return {
        success: true,
        backend: "desktop",
        message: "Test notification sent",
      };
    },
    getRules() {
      return {
        enabled: true,
        minSeverity: "warning",
        statuses: ["alert", "proactive"],
        maxPerHour: 10,
        quietHours: { start: "22:00", end: "07:00" },
      };
    },
    updateRules(rules: any) {
      return { ...this.getRules(), ...rules };
    },
  };

  // Decision engine stub
  const decisionEngine = {
    currentAgent: "default",
    restart(agentName: string) {
      this.currentAgent = agentName;
    },
    getSystemPrompt() {
      return "You are Vigil, an always-on git monitoring agent.";
    },
  };

  // A2A server stub
  const a2aServer = {
    getStatus() {
      return {
        running: true,
        port: 7482,
        endpoint: "http://localhost:7482/.well-known/agent",
        authType: "bearer",
        connections: 2,
        maxConnections: 10,
      };
    },
    getAgentCard() {
      return {
        name: "Vigil",
        version: "1.0.0",
        capabilities: ["streaming", "pushNotifications"],
        skills: [
          { name: "git-watch", description: "Monitor git repositories" },
          { name: "code-review", description: "Review code changes" },
        ],
      };
    },
    getHistory() {
      return [
        {
          time: Date.now() - 60000,
          method: "message/send",
          status: 200,
          latency: 340,
          tokens: 1200,
        },
        {
          time: Date.now() - 30000,
          method: "message/send",
          status: 429,
          latency: 5,
          tokens: 0,
        },
      ];
    },
  };

  const daemon = {
    config,
    repoPaths: opts.repoPaths ?? ["/home/user/projects/vigil"],
    actionExecutor: {
      _actions: [
        {
          id: "act_001",
          command: "run_tests",
          args: ["--coverage"],
          reason: "Test suite has not been run in 3 hours",
          tier: "safe",
          confidence: 0.92,
          status: "pending",
          repo: "vigil",
          createdAt: Date.now() - 60_000,
          updatedAt: Date.now() - 60_000,
        },
        {
          id: "act_002",
          command: "git_stash",
          args: ["save", "auto-stash"],
          reason: "Uncommitted changes detected before branch switch",
          tier: "moderate",
          confidence: 0.85,
          status: "approved",
          repo: "vigil",
          createdAt: Date.now() - 120_000,
          updatedAt: Date.now() - 90_000,
        },
        {
          id: "act_003",
          command: "run_lint",
          args: ["--fix"],
          reason: "Lint errors detected in recent commit",
          tier: "safe",
          confidence: 0.88,
          status: "rejected",
          repo: "vigil",
          createdAt: Date.now() - 180_000,
          updatedAt: Date.now() - 150_000,
        },
      ] as any[],
      isOptedIn: true,
      getGateConfig() {
        return gateConfig;
      },
      getRecent(_limit: number) {
        return this._actions;
      },
      getPending() {
        return this._actions.filter((a: any) => a.status === "pending");
      },
      getById(id: string) {
        return this._actions.find((a: any) => a.id === id) ?? null;
      },
      async approve(id: string, _repoPath: string) {
        const a = this._actions.find((x: any) => x.id === id);
        if (a) a.status = "approved";
      },
      reject(id: string) {
        const a = this._actions.find((x: any) => x.id === id);
        if (a) a.status = "rejected";
      },
    },
    featureGates,
    webhookProcessor,
    channelManager,
    pushNotifier,
    decisionEngine,
    a2aServer,
    session: {
      id: "test-session-001",
      startedAt: Date.now() - 3_600_000, // 1 hour ago
      tickCount: 120,
    },
    tickEngine: {
      currentTick: 120,
      isSleeping: false,
      paused: false,
      lastTickAt: Date.now() - 5_000,
      sleep: { getNextInterval: () => 30 },
      onTick(_cb: any) {},
    },
    metrics: {
      getSummary() {
        return {
          "errors.total": { count: 3, avg: 1, max: 1 },
          "errors.llm_timeout": { count: 1, avg: 1, max: 1 },
          "errors.tick_crash": { count: 2, avg: 1, max: 1 },
        };
      },
      getTimeSeries(_name: string, _since?: number) {
        return [];
      },
    },
    messageRouter: { route() {}, on() {} },
    // Keep agentDir accessible for tests
    agentDir: opts.agentDir,
  } as any;

  const sse = new SSEManager();

  return { daemon, sse };
}
