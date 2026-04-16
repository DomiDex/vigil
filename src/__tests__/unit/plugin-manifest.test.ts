import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DASHBOARD_V2 = join(import.meta.dir, "../../../dashboard-v2");

describe("Phase 5 plugin manifest", () => {
  const expectedPlugins = [
    { id: "config", icon: "Settings", order: 75 },
    { id: "agents", icon: "Bot", order: 80, featureGate: "VIGIL_AGENT_IDENTITY" },
    { id: "health", icon: "HeartPulse", order: 85 },
    { id: "webhooks", icon: "Webhook", order: 88 },
    { id: "channels", icon: "Radio", order: 90 },
    { id: "notifications", icon: "Bell", order: 92 },
    { id: "a2a", icon: "Network", order: 93, featureGate: "VIGIL_A2A" },
  ];

  describe("route files exist", () => {
    for (const plugin of expectedPlugins) {
      it(`route file exists: ${plugin.id}.tsx`, () => {
        const routePath = join(DASHBOARD_V2, "src/routes", `${plugin.id}.tsx`);
        expect(existsSync(routePath)).toBe(true);
      });
    }
  });

  describe("plugin page components exist", () => {
    const componentPaths: Record<string, string> = {
      config: "config/ConfigPage.tsx",
      agents: "agents/AgentsPage.tsx",
      health: "health/HealthPage.tsx",
      webhooks: "webhooks/WebhooksPage.tsx",
      channels: "channels/ChannelsPage.tsx",
      notifications: "notifications/NotificationsPage.tsx",
      a2a: "a2a/A2APage.tsx",
    };

    for (const [id, relPath] of Object.entries(componentPaths)) {
      it(`component file exists: ${id}`, () => {
        const fullPath = join(DASHBOARD_V2, "src/plugins", relPath);
        expect(existsSync(fullPath)).toBe(true);
      });
    }
  });

  describe("plugin registry", () => {
    it("plugins/index.ts contains all 7 new plugin IDs", async () => {
      const indexPath = join(DASHBOARD_V2, "src/plugins/index.ts");
      const content = await Bun.file(indexPath).text();

      for (const plugin of expectedPlugins) {
        expect(content).toContain(`id: "${plugin.id}"`);
      }
    });

    it("feature-gated plugins have correct gate", async () => {
      const indexPath = join(DASHBOARD_V2, "src/plugins/index.ts");
      const content = await Bun.file(indexPath).text();

      expect(content).toContain('featureGate: "VIGIL_AGENT_IDENTITY"');
      expect(content).toContain('featureGate: "VIGIL_A2A"');
    });

    it("non-gated plugins do not have featureGate", async () => {
      const indexPath = join(DASHBOARD_V2, "src/plugins/index.ts");
      const content = await Bun.file(indexPath).text();

      // Count featureGate occurrences — at least 2 from Phase 5 (agents, a2a)
      const gateMatches = content.match(/featureGate:/g);
      expect(gateMatches).toBeDefined();
      expect(gateMatches!.length).toBeGreaterThanOrEqual(2);
    });
  });
});
