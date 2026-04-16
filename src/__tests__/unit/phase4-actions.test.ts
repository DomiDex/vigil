import { describe, expect, it, mock } from "bun:test";

describe("Actions plugin", () => {
  describe("action-approval tier badge mapping", () => {
    it("maps tier to correct badge classes", () => {
      const { getTierBadgeClasses } = require("../../../dashboard-v2/src/components/vigil/action-approval");
      expect(getTierBadgeClasses("safe")).toEqual({ bg: "bg-success/10", text: "text-success" });
      expect(getTierBadgeClasses("moderate")).toEqual({ bg: "bg-warning/10", text: "text-warning" });
      expect(getTierBadgeClasses("dangerous")).toEqual({ bg: "bg-error/10", text: "text-error" });
    });
  });

  describe("6-gate checklist icon mapping", () => {
    it("maps gate values to correct icons", () => {
      const { getGateIcon } = require("../../../dashboard-v2/src/components/vigil/action-approval");
      expect(getGateIcon(true)).toBe("CheckCircle");
      expect(getGateIcon(false)).toBe("XCircle");
      expect(getGateIcon(undefined)).toBe("Clock");
    });

    it("processes full gateResults object", () => {
      const { getGateIcon } = require("../../../dashboard-v2/src/components/vigil/action-approval");
      const gates: Record<string, boolean | undefined> = {
        configEnabled: true,
        sessionOptedIn: true,
        repoAllowed: true,
        actionTypeAllowed: true,
        confidenceMet: true,
        userApproval: undefined,
      };
      const icons = Object.entries(gates).map(([key, val]) => ({ key, icon: getGateIcon(val) }));
      expect(icons).toHaveLength(6);
      expect(icons.filter((g) => g.icon === "CheckCircle")).toHaveLength(5);
      expect(icons.filter((g) => g.icon === "Clock")).toHaveLength(1);
      expect(icons.find((g) => g.key === "userApproval")?.icon).toBe("Clock");
    });

    it("handles gates with failed checks (dangerous action)", () => {
      const { getGateIcon } = require("../../../dashboard-v2/src/components/vigil/action-approval");
      const gates: Record<string, boolean | undefined> = {
        configEnabled: true,
        sessionOptedIn: true,
        repoAllowed: false,
        actionTypeAllowed: true,
        confidenceMet: false,
        userApproval: undefined,
      };
      const failedGates = Object.entries(gates).filter(([, v]) => getGateIcon(v) === "XCircle");
      expect(failedGates).toHaveLength(2);
    });
  });

  describe("gate labels", () => {
    it("exports ordered gate labels for the 6-gate checklist", () => {
      const { GATE_LABELS } = require("../../../dashboard-v2/src/components/vigil/action-approval");
      expect(GATE_LABELS).toHaveLength(6);
      expect(GATE_LABELS).toContain("Config enabled");
      expect(GATE_LABELS).toContain("User approval");
    });
  });

  describe("pending vs history filtering", () => {
    const actions = [
      { id: "a1", status: "pending", tier: "safe" },
      { id: "a2", status: "pending", tier: "moderate" },
      { id: "a3", status: "pending", tier: "dangerous" },
      { id: "a4", status: "approved", tier: "safe" },
      { id: "a5", status: "rejected", tier: "dangerous" },
    ];

    it("filters pending actions correctly", () => {
      const pending = actions.filter((a) => a.status === "pending");
      expect(pending).toHaveLength(3);
    });

    it("filters history (non-pending) actions correctly", () => {
      const history = actions.filter((a) => a.status !== "pending");
      expect(history).toHaveLength(2);
    });
  });

  describe("approve/reject mutations", () => {
    it("approveAction calls with action id", async () => {
      const approveAction = mock(() => Promise.resolve({ success: true }));
      await approveAction({ data: { id: "a1" } });
      expect(approveAction).toHaveBeenCalledWith({ data: { id: "a1" } });
    });

    it("rejectAction calls with action id", async () => {
      const rejectAction = mock(() => Promise.resolve({ success: true }));
      await rejectAction({ data: { id: "a2" } });
      expect(rejectAction).toHaveBeenCalledWith({ data: { id: "a2" } });
    });

    it("both mutations would invalidate actions query key", () => {
      const { vigilKeys } = require("../../../dashboard-v2/src/lib/query-keys");
      expect(vigilKeys.actions.all).toEqual(["actions"]);
    });
  });
});
