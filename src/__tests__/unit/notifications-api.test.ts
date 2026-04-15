import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";
import { withTempHome } from "../helpers/temp-config";
import {
  getNotificationsJSON,
  handleTestNotification,
  handleNotificationRulesUpdate,
} from "../../dashboard/api/notifications";

describe("notifications API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getNotificationsJSON", () => {
    it("returns recent deliveries array", () => {
      const result = getNotificationsJSON(ctx);
      expect(result).toBeArray();
    });
  });

  describe("handleTestNotification", () => {
    it("sends test notification and returns success", async () => {
      const result = await handleTestNotification(ctx);
      expect(result.success).toBe(true);
      expect(result.backend).toBeString();
    });
  });

  describe("handleNotificationRulesUpdate", () => {
    let home: ReturnType<typeof withTempHome>;

    beforeEach(() => {
      home = withTempHome();
    });

    afterEach(() => {
      home.cleanup();
    });

    it("accepts valid rules update", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        enabled: true,
        minSeverity: "critical",
        maxPerHour: 5,
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid minSeverity value", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        minSeverity: "extreme",
      });
      expect(result.error).toBeDefined();
    });

    it("rejects negative maxPerHour", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        maxPerHour: -1,
      });
      expect(result.error).toBeDefined();
    });

    it("validates quiet hours format", async () => {
      const result = await handleNotificationRulesUpdate(ctx, {
        quietHours: { start: "25:00", end: "07:00" },
      });
      expect(result.error).toBeDefined();
    });
  });
});
