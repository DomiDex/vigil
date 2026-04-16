import { beforeEach, describe, expect, it } from "bun:test";
import {
  getChannelPermissionsJSON,
  getChannelQueueJSON,
  getChannelsJSON,
  handleChannelDelete,
  handleChannelRegister,
} from "../../dashboard/api/channels";
import { createFakeDashboardContext } from "../helpers/fake-dashboard-context";

describe("channels API", () => {
  let ctx: ReturnType<typeof createFakeDashboardContext>;

  beforeEach(() => {
    ctx = createFakeDashboardContext();
  });

  describe("getChannelsJSON", () => {
    it("returns empty array initially", () => {
      const result = getChannelsJSON(ctx);
      expect(result).toBeArray();
      expect(result).toHaveLength(0);
    });
  });

  describe("handleChannelRegister", () => {
    it("registers channel with valid input", async () => {
      const result = await handleChannelRegister(ctx, {
        name: "test-channel",
        type: "mcp",
        config: { endpoint: "http://localhost:9000" },
      });
      expect(result.id).toBeString();
    });

    it("rejects missing name", async () => {
      const result = await handleChannelRegister(ctx, {
        type: "mcp",
        config: {},
      });
      expect(result.error).toBeDefined();
    });

    it("registered channel appears in list", async () => {
      await handleChannelRegister(ctx, {
        name: "test-channel",
        type: "mcp",
        config: {},
      });
      const channels = getChannelsJSON(ctx);
      expect(channels).toHaveLength(1);
      expect(channels[0].name).toBe("test-channel");
    });
  });

  describe("handleChannelDelete", () => {
    it("deletes existing channel", async () => {
      const created = await handleChannelRegister(ctx, {
        name: "to-delete",
        type: "mcp",
        config: {},
      });
      const result = await handleChannelDelete(ctx, created.id);
      expect(result.success).toBe(true);
      expect(getChannelsJSON(ctx)).toHaveLength(0);
    });

    it("returns error for non-existent channel", async () => {
      const result = await handleChannelDelete(ctx, "nonexistent");
      expect(result.error).toBeDefined();
    });
  });

  describe("getChannelPermissionsJSON", () => {
    it("returns 5-gate permission results", async () => {
      const created = await handleChannelRegister(ctx, {
        name: "perm-test",
        type: "mcp",
        config: {},
      });
      const result = getChannelPermissionsJSON(ctx, created.id);
      expect(typeof result.read).toBe("boolean");
      expect(typeof result.write).toBe("boolean");
      expect(typeof result.execute).toBe("boolean");
      expect(typeof result.admin).toBe("boolean");
      expect(typeof result.subscribe).toBe("boolean");
    });
  });

  describe("getChannelQueueJSON", () => {
    it("returns pending messages array", async () => {
      const created = await handleChannelRegister(ctx, {
        name: "queue-test",
        type: "mcp",
        config: {},
      });
      const result = getChannelQueueJSON(ctx, created.id);
      expect(result).toBeArray();
    });
  });
});
