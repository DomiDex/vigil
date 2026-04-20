import { describe, test, expect } from "bun:test";
import { z } from "zod";
import { agentsSearchSchema } from "../../routes/agents";

const referenceSchema = z.object({
  tab: z.enum(["persona", "specialists", "findings", "flaky"]).default("persona"),
  id: z.string().optional(),
});

describe("agents route search schema (reconstructed)", () => {
  test("accepts { tab: 'persona' }", () => {
    const r = referenceSchema.parse({ tab: "persona" });
    expect(r.tab).toBe("persona");
  });

  test("accepts { tab: 'specialists' }", () => {
    const r = referenceSchema.parse({ tab: "specialists" });
    expect(r.tab).toBe("specialists");
  });

  test("accepts { tab: 'findings' }", () => {
    const r = referenceSchema.parse({ tab: "findings" });
    expect(r.tab).toBe("findings");
  });

  test("accepts { tab: 'flaky' }", () => {
    const r = referenceSchema.parse({ tab: "flaky" });
    expect(r.tab).toBe("flaky");
  });

  test("accepts { tab: 'findings', id: 'abc-123' }", () => {
    const r = referenceSchema.parse({ tab: "findings", id: "abc-123" });
    expect(r.tab).toBe("findings");
    expect(r.id).toBe("abc-123");
  });

  test("rejects { tab: 'nonexistent' }", () => {
    expect(() => referenceSchema.parse({ tab: "nonexistent" })).toThrow();
  });

  test("defaults tab to 'persona' when omitted", () => {
    const r = referenceSchema.parse({});
    expect(r.tab).toBe("persona");
  });

  test("id is optional and defaults to undefined", () => {
    const r = referenceSchema.parse({});
    expect(r.id).toBeUndefined();
  });
});

describe("agents route search schema (imported from route file)", () => {
  test("imported schema accepts all four tab values", () => {
    for (const tab of ["persona", "specialists", "findings", "flaky"] as const) {
      const r = agentsSearchSchema.parse({ tab });
      expect(r.tab).toBe(tab);
    }
  });

  test("imported schema defaults tab to 'persona'", () => {
    const r = agentsSearchSchema.parse({});
    expect(r.tab).toBe("persona");
  });

  test("imported schema rejects invalid tab", () => {
    expect(() => agentsSearchSchema.parse({ tab: "bogus" })).toThrow();
  });

  test("imported schema accepts optional id", () => {
    const r = agentsSearchSchema.parse({ tab: "findings", id: "xyz" });
    expect(r.id).toBe("xyz");
  });
});
