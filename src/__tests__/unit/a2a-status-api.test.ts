import { describe, it, expect, beforeEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import {
  getA2AStatusJSON,
  getA2ASkillsJSON,
  getA2AHistoryJSON,
} from "../../dashboard/api/a2a-status";

describe("a2a-status API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getA2AStatusJSON", () => {
    it("returns server running state", () => {
      const result = getA2AStatusJSON(ctx);
      expect(typeof result.running).toBe("boolean");
    });

    it("returns server connection info", () => {
      const result = getA2AStatusJSON(ctx);
      expect(result.port).toBeNumber();
      expect(result.endpoint).toBeString();
      expect(result.authType).toBeString();
    });

    it("returns connection counts", () => {
      const result = getA2AStatusJSON(ctx);
      expect(result.connections).toBeNumber();
      expect(result.maxConnections).toBeNumber();
    });
  });

  describe("getA2ASkillsJSON", () => {
    it("returns skills array from agent card", () => {
      const result = getA2ASkillsJSON(ctx);
      expect(result).toBeArray();
      expect(result.length).toBeGreaterThan(0);
    });

    it("each skill has name and description", () => {
      const result = getA2ASkillsJSON(ctx);
      for (const skill of result) {
        expect(skill.name).toBeString();
        expect(skill.description).toBeString();
      }
    });
  });

  describe("getA2AHistoryJSON", () => {
    it("returns RPC call history", () => {
      const result = getA2AHistoryJSON(ctx);
      expect(result).toBeArray();
    });

    it("each entry has method, status, latency, tokens", () => {
      const result = getA2AHistoryJSON(ctx);
      for (const entry of result) {
        expect(entry.method).toBeString();
        expect(entry.status).toBeNumber();
        expect(entry.latency).toBeNumber();
        expect(entry.tokens).toBeNumber();
      }
    });

    it("includes rate-limited entries (status 429)", () => {
      const result = getA2AHistoryJSON(ctx);
      const rateLimited = result.filter((e: any) => e.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });
  });
});
