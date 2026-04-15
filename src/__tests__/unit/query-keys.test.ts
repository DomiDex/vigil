import { describe, expect, it } from "bun:test";
import { vigilKeys } from "../../../dashboard-v2/src/lib/query-keys.ts";

describe("vigilKeys", () => {
  describe("static keys", () => {
    it("overview returns correct tuple", () => {
      expect(vigilKeys.overview).toEqual(["overview"]);
    });

    it("dreams returns correct tuple", () => {
      expect(vigilKeys.dreams).toEqual(["dreams"]);
    });

    it("tasks returns correct tuple", () => {
      expect(vigilKeys.tasks).toEqual(["tasks"]);
    });

    it("scheduler returns correct tuple", () => {
      expect(vigilKeys.scheduler).toEqual(["scheduler"]);
    });

    it("metrics returns correct tuple", () => {
      expect(vigilKeys.metrics).toEqual(["metrics"]);
    });

    it("health returns correct tuple", () => {
      expect(vigilKeys.health).toEqual(["health"]);
    });

    it("repos.all returns correct tuple", () => {
      expect(vigilKeys.repos.all).toEqual(["repos"]);
    });

    it("actions.all returns correct tuple", () => {
      expect(vigilKeys.actions.all).toEqual(["actions"]);
    });

    it("actions.pending returns correct tuple", () => {
      expect(vigilKeys.actions.pending).toEqual(["actions", "pending"]);
    });

    it("memory.stats returns correct tuple", () => {
      expect(vigilKeys.memory.stats).toEqual(["memory"]);
    });
  });

  describe("parametric keys", () => {
    it("repos.detail includes repo name", () => {
      expect(vigilKeys.repos.detail("my-repo")).toEqual(["repos", "my-repo"]);
    });

    it("repos.detail returns different tuples for different names", () => {
      const a = vigilKeys.repos.detail("alpha");
      const b = vigilKeys.repos.detail("beta");
      expect(a).not.toEqual(b);
      expect(a).toEqual(["repos", "alpha"]);
      expect(b).toEqual(["repos", "beta"]);
    });

    it("timeline with no filters returns default", () => {
      const key = vigilKeys.timeline();
      expect(key).toEqual(["timeline", {}]);
    });

    it("timeline with filters includes them", () => {
      const key = vigilKeys.timeline({ status: "alert", repo: "vigil", page: 2 });
      expect(key).toEqual(["timeline", { status: "alert", repo: "vigil", page: 2 }]);
    });

    it("dreamPatterns includes repo name", () => {
      expect(vigilKeys.dreamPatterns("vigil")).toEqual(["dreams", "patterns", "vigil"]);
    });

    it("memory.search includes query string", () => {
      expect(vigilKeys.memory.search("git merge")).toEqual(["memory", "search", "git merge"]);
    });
  });

  describe("readonly enforcement", () => {
    it("static keys are frozen arrays (readonly)", () => {
      const key = vigilKeys.overview;
      expect(Array.isArray(key)).toBe(true);
      expect(key.length).toBe(1);
      expect(key[0]).toBe("overview");
    });

    it("parametric keys return fresh arrays each call", () => {
      const a = vigilKeys.repos.detail("x");
      const b = vigilKeys.repos.detail("x");
      expect(a).toEqual(b);
    });
  });
});
