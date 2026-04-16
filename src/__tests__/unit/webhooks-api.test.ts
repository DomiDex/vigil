import { beforeEach, describe, expect, it } from "bun:test";
import {
  getWebhookEventsJSON,
  getWebhookStatusJSON,
  getWebhookSubscriptionsJSON,
  handleSubscriptionCreate,
  handleSubscriptionDelete,
} from "../../dashboard/api/webhooks";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";

describe("webhooks API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getWebhookEventsJSON", () => {
    it("returns events array from processor", () => {
      const result = getWebhookEventsJSON(ctx);
      expect(result).toBeArray();
    });
  });

  describe("getWebhookSubscriptionsJSON", () => {
    it("returns subscriptions array", () => {
      const result = getWebhookSubscriptionsJSON(ctx);
      expect(result).toBeArray();
    });
  });

  describe("handleSubscriptionCreate", () => {
    it("creates subscription with valid input", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: ["push", "pull_request"],
      });
      expect(result.id).toBeString();
    });

    it("rejects missing repo field", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        eventTypes: ["push"],
      });
      expect(result.error).toBeDefined();
    });

    it("rejects empty eventTypes array", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: [],
      });
      expect(result.error).toBeDefined();
    });

    it("accepts optional expiry field", async () => {
      const result = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: ["push"],
        expiry: Date.now() + 86400000,
      });
      expect(result.id).toBeString();
    });
  });

  describe("handleSubscriptionDelete", () => {
    it("deletes existing subscription", async () => {
      const created = await handleSubscriptionCreate(ctx, {
        repo: "vigil",
        eventTypes: ["push"],
      });
      const result = await handleSubscriptionDelete(ctx, created.id);
      expect(result.success).toBe(true);
    });

    it("returns error for non-existent subscription", async () => {
      const result = await handleSubscriptionDelete(ctx, "nonexistent_id");
      expect(result.error).toBeDefined();
    });
  });

  describe("getWebhookStatusJSON", () => {
    it("returns server health info", () => {
      const result = getWebhookStatusJSON(ctx);
      expect(result.running).toBe(true);
      expect(result.port).toBeNumber();
      expect(result.eventsReceived).toBeNumber();
      expect(result.errors).toBeNumber();
    });
  });
});
